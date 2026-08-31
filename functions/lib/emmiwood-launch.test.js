import test from 'node:test';
import assert from 'node:assert/strict';
import { book, cancelAppointment, normalizePhone, rescheduleAppointment, slots, zonedEpoch } from './emmiwood-core.js';
import { bookingWriteState } from './emmiwood-runtime.js';
import { setupEmmiwoodTestD1 } from './emmiwood-test-d1.js';

test('browser mutations reject foreign origins while allowing same-origin and non-browser calls', async () => {
  const { requireSameOrigin } = await import('./emmiwood-core.js');
  assert.doesNotThrow(() => requireSameOrigin(new Request('https://emmiwood.example/api/emmiwood/appointments', { method: 'POST', headers: { origin: 'https://emmiwood.example' } })));
  assert.doesNotThrow(() => requireSameOrigin(new Request('https://emmiwood.example/api/emmiwood/appointments', { method: 'POST' })));
  assert.throws(
    () => requireSameOrigin(new Request('https://emmiwood.example/api/emmiwood/appointments', { method: 'POST', headers: { origin: 'https://attacker.example' } })),
    { code: 'forbidden_origin', status: 403 },
  );
});

test('booking writes fail closed before any database operation in production and explicit preview freezes', async () => {
  let databaseOperations = 0;
  const blockedDb = {
    prepare() {
      databaseOperations += 1;
      throw new Error('database must not be touched while booking writes are frozen');
    },
  };

  assert.deepEqual(bookingWriteState({ ENVIRONMENT: 'production' }), {
    enabled: false,
    configured: false,
    valid: false,
  });
  assert.deepEqual(bookingWriteState({ ENVIRONMENT: 'preview' }), {
    enabled: true,
    configured: false,
    valid: true,
  });
  assert.equal(bookingWriteState({ ENVIRONMENT: 'production', EMMIWOOD_BOOKING_WRITES_ENABLED: 'true' }).enabled, true);
  assert.equal(bookingWriteState({ ENVIRONMENT: 'preview', EMMIWOOD_BOOKING_WRITES_ENABLED: 'false' }).enabled, false);
  assert.deepEqual(bookingWriteState({ ENVIRONMENT: 'production', EMMIWOOD_BOOKING_WRITES_ENABLED: 'yes' }), {
    enabled: false,
    configured: true,
    valid: false,
  });

  await assert.rejects(
    () => book({ DB: blockedDb, ENVIRONMENT: 'production' }, {}),
    { code: 'booking_paused', status: 503 },
  );
  await assert.rejects(
    () => cancelAppointment({ DB: blockedDb, ENVIRONMENT: 'preview', EMMIWOOD_BOOKING_WRITES_ENABLED: 'false' }, 'token'),
    { code: 'booking_paused', status: 503 },
  );
  await assert.rejects(
    () => rescheduleAppointment({ DB: blockedDb, ENVIRONMENT: 'preview', EMMIWOOD_BOOKING_WRITES_ENABLED: 'invalid' }, 'token', {}),
    { code: 'booking_paused', status: 503 },
  );

  const { cancelAdminAppointment, rescheduleAdminAppointment } = await import('./emmiwood-admin.js');
  await assert.rejects(
    () => cancelAdminAppointment({ DB: blockedDb, ENVIRONMENT: 'production' }, 'appointment', { id: 'admin' }),
    { code: 'booking_paused', status: 503 },
  );
  await assert.rejects(
    () => rescheduleAdminAppointment({ DB: blockedDb, ENVIRONMENT: 'preview', EMMIWOOD_BOOKING_WRITES_ENABLED: 'false' }, 'appointment', {}, { id: 'admin' }),
    { code: 'booking_paused', status: 503 },
  );
  assert.equal(databaseOperations, 0);
});


test('customer mobile numbers normalize to E.164 and invalid values fail closed', () => {
  assert.equal(normalizePhone('(605) 555-0142'), '+16055550142');
  assert.equal(normalizePhone('1-605-555-0142'), '+16055550142');
  assert.throws(() => normalizePhone('not-a-number'), { code: 'invalid_phone', status: 422 });
  assert.throws(() => normalizePhone('555-0142'), { code: 'invalid_phone', status: 422 });
});

function nextBookableDate(weekdays = [1, 2, 3, 4, 5, 6], from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + 5);
  while (!weekdays.includes(date.getDay())) date.setDate(date.getDate() + 1);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

test('booking fixture selects an eligible weekday across every possible runner day', () => {
  for (let offset = 0; offset < 7; offset++) {
    const from = new Date(2026, 7, 24 + offset, 12);
    for (const weekdays of [[1, 2, 3, 4, 5, 6], [1, 3, 5]]) {
      const date = nextBookableDate(weekdays, from);
      assert.ok(weekdays.includes(new Date(`${date}T12:00:00`).getDay()));
    }
  }
});

test('slot generation uses bounded D1 operations and filters claims and exceptions in memory', async () => {
  const db = setupEmmiwoodTestD1();
  const date = nextBookableDate();
  const start = zonedEpoch(date, 540);
  const now = start - 5 * 3600;
  const env = { DB: db, ENVIRONMENT: 'preview' };

  try {
    await book(env, {
      serviceId: 'signature', barberId: 'barro', date, start, now,
      name: 'Query Budget Guest', phone: '6055550123',
    });
    db.exec(`INSERT INTO emmiwood_exceptions(id,shop_id,barber_id,date,start_minute,end_minute,kind,note)
      VALUES('query-budget-block','emmiwood','barro','${date}',600,660,'blocked','Regression fixture')`);

    db.resetMetrics();
    const openings = await slots(env, { serviceId: 'signature', date, barberId: 'barro', now });
    assert.equal(openings[0].start, zonedEpoch(date, 660));
    assert.ok(db.operationCount() <= 6, `expected at most 6 D1 operations, observed ${db.operationCount()}: ${JSON.stringify(db.metrics)}`);
    assert.equal(db.metrics.batch, 0);
    assert.equal(db.metrics.run, 0);
  } finally {
    db.close();
  }
});

test('booking records consent provenance only when the guest opts into appointment texts', async () => {
  const db = setupEmmiwoodTestD1();
  const date = nextBookableDate();
  const start = zonedEpoch(date, 540);
  const env = { DB: db, ENVIRONMENT: 'preview' };

  try {
    await book(env, {
      serviceId: 'signature', barberId: 'barro', date, start, now: start - 5 * 3600,
      name: 'No Consent Guest', phone: '6055550141', notes: '',
    });
    await book(env, {
      serviceId: 'signature', barberId: 'barro', date, start: zonedEpoch(date, 600), now: start - 5 * 3600,
      name: 'Consented Guest', phone: '6055550142', smsConsent: true,
      smsConsentVersion: 'kup-appointment-texts-v1',
    });

    assert.deepEqual(
      db.query('SELECT name,sms_consent,sms_consent_version,sms_consent_at IS NOT NULL consented_at FROM emmiwood_customers ORDER BY name'),
      [
        { name: 'Consented Guest', sms_consent: 1, sms_consent_version: 'kup-appointment-texts-v1', consented_at: 1 },
        { name: 'No Consent Guest', sms_consent: 0, sms_consent_version: null, consented_at: 0 },
      ],
    );
    assert.deepEqual(
      db.query('SELECT channel,template,provider,status FROM emmiwood_notification_outbox'),
      [{ channel: 'sms', template: 'booking_confirmation', provider: 'mock', status: 'queued' }],
    );
  } finally {
    db.close();
  }
});

test('appointment management tokens expire and exchange into a scoped HttpOnly cookie', async () => {
  const { managedAppointment, manageSessionCookie, manageTokenFromRequest } = await import('./emmiwood-core.js');
  const db = setupEmmiwoodTestD1();
  const date = nextBookableDate();
  const start = zonedEpoch(date, 660);
  const env = { DB: db, ENVIRONMENT: 'preview' };
  try {
    const booking = await book(env, {
      serviceId: 'signature', barberId: 'barro', date, start, now: start - 5 * 3600,
      name: 'Manage Guest', phone: '6055550199',
    });
    assert.equal((await managedAppointment(env, booking.manageToken)).customer_name, 'Manage Guest');
    const cookie = manageSessionCookie(booking.manageToken, env);
    assert.match(cookie, /^emmiwood_manage_session=/);
    assert.match(cookie, /Path=\/api\/emmiwood\/appointments/);
    assert.match(cookie, /Max-Age=7200/);
    assert.match(cookie, /HttpOnly/);
    const request = new Request('https://example.com/api/emmiwood/appointments/manage', { headers: { cookie } });
    assert.equal(manageTokenFromRequest(request), booking.manageToken);
    db.exec('UPDATE emmiwood_appointments SET manage_token_expires_at=0');
    await assert.rejects(() => managedAppointment(env, booking.manageToken), { code: 'appointment_not_found' });
  } finally {
    db.close();
  }
});


test('consented lifecycle queues eligible reminders and supersedes them on reschedule and cancellation', async () => {
  const db = setupEmmiwoodTestD1();
  const date = nextBookableDate();
  const start = zonedEpoch(date, 540);
  const rescheduledStart = zonedEpoch(date, 660);
  const now = start - 30 * 3600;
  const env = { DB: db, ENVIRONMENT: 'preview' };

  try {
    const booking = await book({
      ...env,
      EMMIWOOD_PUBLIC_ORIGIN: 'https://emmiwood-barbers-preview.pages.dev',
    }, {
      serviceId: 'signature', barberId: 'barro', date, start, now,
      name: 'Lifecycle Guest', phone: '6055550177', smsConsent: true,
      smsConsentVersion: 'kup-appointment-texts-v1',
    });
    assert.deepEqual(
      db.query("SELECT template,status,COUNT(*) count FROM emmiwood_notification_outbox GROUP BY template,status ORDER BY template,status"),
      [
        { template: 'appointment_reminder', status: 'queued', count: 1 },
        { template: 'booking_confirmation', status: 'queued', count: 1 },
      ],
    );
    const confirmPayload = JSON.parse(db.query("SELECT payload_json FROM emmiwood_notification_outbox WHERE template='booking_confirmation' AND status='queued'")[0].payload_json);
    assert.match(confirmPayload.manageUrl, /#token=/);
    assert.equal(confirmPayload.manageUrl.includes(booking.manageToken), true);
    assert.equal(confirmPayload.serviceName, 'Signature Haircut');
    assert.deepEqual(db.query("SELECT available_at FROM emmiwood_notification_outbox WHERE template='appointment_reminder'"), [
      { available_at: start - 24 * 3600 },
    ]);

    await rescheduleAppointment(env, booking.manageToken, {
      serviceId: 'signature', barberId: 'barro', date, start: rescheduledStart,
    }, null, now);
    assert.deepEqual(
      db.query("SELECT template,status,COUNT(*) count FROM emmiwood_notification_outbox GROUP BY template,status ORDER BY template,status"),
      [
        { template: 'appointment_reminder', status: 'cancelled', count: 1 },
        { template: 'appointment_reminder', status: 'queued', count: 1 },
        { template: 'booking_confirmation', status: 'cancelled', count: 1 },
        { template: 'reschedule_confirmation', status: 'queued', count: 1 },
      ],
    );
    assert.deepEqual(db.query("SELECT available_at FROM emmiwood_notification_outbox WHERE template='appointment_reminder' AND status='queued'"), [
      { available_at: rescheduledStart - 24 * 3600 },
    ]);

    await cancelAppointment(env, booking.manageToken, null, now);
    assert.deepEqual(
      db.query("SELECT template,status,COUNT(*) count FROM emmiwood_notification_outbox GROUP BY template,status ORDER BY template,status"),
      [
        { template: 'appointment_reminder', status: 'cancelled', count: 2 },
        { template: 'booking_confirmation', status: 'cancelled', count: 1 },
        { template: 'cancellation_confirmation', status: 'queued', count: 1 },
        { template: 'reschedule_confirmation', status: 'cancelled', count: 1 },
      ],
    );
  } finally {
    db.close();
  }
});

test('legacy appointment-texts-v1 consent is stored but does not enqueue SMS', async () => {
  const db = setupEmmiwoodTestD1();
  const date = nextBookableDate();
  const start = zonedEpoch(date, 540);
  const env = { DB: db, ENVIRONMENT: 'preview' };
  try {
    await book(env, {
      serviceId: 'signature', barberId: 'barro', date, start, now: start - 5 * 3600,
      name: 'Legacy Consent Guest', phone: '6055550143', smsConsent: true,
      smsConsentVersion: 'appointment-texts-v1',
    });
    assert.deepEqual(
      db.query("SELECT sms_consent,sms_consent_version FROM emmiwood_customers WHERE name='Legacy Consent Guest'"),
      [{ sms_consent: 1, sms_consent_version: 'appointment-texts-v1' }],
    );
    assert.deepEqual(db.query('SELECT count(*) count FROM emmiwood_notification_outbox'), [{ count: 0 }]);
  } finally {
    db.close();
  }
});

test('barber phone queues staff SMS without guest consent; john without phone queues none', async () => {
  const db = setupEmmiwoodTestD1();
  // Both bookings need an eligible day: John works only Mon/Wed/Fri.
  const date = nextBookableDate([1, 3, 5]);
  const start = zonedEpoch(date, 540);
  const env = { DB: db, ENVIRONMENT: 'preview', EMMIWOOD_BOOKING_WRITES_ENABLED: 'true' };
  try {
    db.exec("UPDATE emmiwood_barbers SET phone='+15078485517' WHERE id='barro'");
    await book(env, {
      serviceId: 'signature', barberId: 'barro', date, start, now: start - 5 * 3600,
      name: 'Staff Only Guest', phone: '6055550188',
    });
    assert.deepEqual(
      db.query("SELECT template,recipient FROM emmiwood_notification_outbox ORDER BY template"),
      [
        { template: 'barber_booking_notice', recipient: '+15078485517' },
        { template: 'barber_reminder_15m', recipient: '+15078485517' },
      ],
    );

    const johnStart = zonedEpoch(date, 600);
    await book(env, {
      serviceId: 'signature', barberId: 'john', date, start: johnStart, now: start - 5 * 3600,
      name: 'John Guest', phone: '6055550189', smsConsent: true,
      smsConsentVersion: 'kup-appointment-texts-v1',
    });
    assert.equal(
      db.query("SELECT count(*) c FROM emmiwood_notification_outbox WHERE recipient='+15078485517' AND template LIKE 'barber_%' AND appointment_id IN (SELECT id FROM emmiwood_appointments WHERE barber_id='john')")[0].c,
      0,
    );
    assert.ok(db.query("SELECT count(*) c FROM emmiwood_notification_outbox WHERE template='booking_confirmation'")[0].c >= 1);
  } finally {
    db.close();
  }
});
