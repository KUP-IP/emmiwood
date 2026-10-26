import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTIFICATION_PROVIDER_MOCK,
  NOTIFICATION_PROVIDER_UNCONFIGURED,
  NOTIFICATION_PROVIDER_TWILIO,
  NOTIFICATION_PROVIDER_RESEND,
  NOTICE_STALE_AGE_SECONDS,
  REMINDER_STALE_AGE_SECONDS,
  STALE_APPOINTMENT_ERROR,
  STALE_NOTICE_ERROR,
  STALE_SENDING_SECONDS,
  appointmentSmsStatements,
  barberReminderAvailableAt,
  barberSmsStatements,
  shopAdminNoticePhones,
  staffSmsStatements,
  deliverNotification,
  adminAppointmentUrl,
  manageAppointmentUrl,
  notificationProvider,
  notificationReadiness,
  notificationTestMode,
  processQueuedNotifications,
  reminderAvailableAt,
  guestReminderAvailableAt,
  phoneLast4,
  renderSms,
  sanitizeOutboxRow,
  staleNotificationReason,
} from './emmiwood-notifications.js';

const PRODUCTION_RUNTIME = Object.freeze({
  ENVIRONMENT: 'production',
  EMMIWOOD_PUBLIC_ORIGIN: 'https://emmiwood.example',
  EMMIWOOD_BOOKING_WRITES_ENABLED: 'false',
  EMMIWOOD_RELEASE_SHA: 'a'.repeat(40),
  TWILIO_API_KEY_SID: 'SKconfigured',
});

test('preview uses mock delivery while incomplete production credentials fail closed', () => {
  assert.equal(notificationProvider({ ENVIRONMENT: 'preview' }), NOTIFICATION_PROVIDER_MOCK);
  assert.equal(notificationProvider({ ENVIRONMENT: 'production', TWILIO_ACCOUNT_SID: 'sid' }), NOTIFICATION_PROVIDER_UNCONFIGURED);
  assert.equal(notificationProvider({ ENVIRONMENT: 'production' }, 'email'), NOTIFICATION_PROVIDER_UNCONFIGURED);
});

test('complete Twilio credentials activate live SMS on preview for controlled smoke', () => {
  assert.equal(notificationProvider({
    ENVIRONMENT: 'preview',
    TWILIO_ACCOUNT_SID: 'sid',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_FROM_NUMBER: '+16050000000',
  }), NOTIFICATION_PROVIDER_TWILIO);
  const readiness = notificationReadiness({
    ENVIRONMENT: 'preview',
    EMMIWOOD_NOTIFICATION_SECRET: 'secret',
    TWILIO_ACCOUNT_SID: 'sid',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_FROM_NUMBER: '+16050000000',
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.exactIdOnly, true);
  assert.equal(readiness.sms.provider, NOTIFICATION_PROVIDER_TWILIO);
});



test('production readiness reports missing names without exposing values', () => {
  const incomplete = notificationReadiness({
    ...PRODUCTION_RUNTIME,
    EMMIWOOD_NOTIFICATION_SECRET: 'super-secret-sentinel',
    RESEND_API_KEY: 'super-secret-sentinel',
    EMAIL_FROM: 'super-secret-sentinel',
  });
  assert.equal(incomplete.ready, false);
  assert.deepEqual(incomplete.sms.missing, ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']);
  assert.deepEqual(incomplete.email.missing, []);
  assert.equal(incomplete.email.deferred, true);
  assert.equal(JSON.stringify(incomplete).includes('super-secret-sentinel'), false);

  const smsOnly = notificationReadiness({
    ...PRODUCTION_RUNTIME,
    EMMIWOOD_NOTIFICATION_SECRET: 'configured',
    TWILIO_ACCOUNT_SID: 'configured',
    TWILIO_AUTH_TOKEN: 'configured',
    TWILIO_FROM_NUMBER: 'configured',
  });
  assert.equal(smsOnly.ready, true);
  assert.equal(smsOnly.sms.provider, NOTIFICATION_PROVIDER_TWILIO);
  assert.equal(smsOnly.email.ready, false);
  assert.equal(smsOnly.email.deferred, true);
  assert.deepEqual(smsOnly.email.missing, ['RESEND_API_KEY', 'EMAIL_FROM']);

  const complete = notificationReadiness({
    ...PRODUCTION_RUNTIME,
    EMMIWOOD_NOTIFICATION_SECRET: 'configured',
    TWILIO_ACCOUNT_SID: 'configured',
    TWILIO_AUTH_TOKEN: 'configured',
    TWILIO_FROM_NUMBER: 'configured',
    RESEND_API_KEY: 'configured',
    EMAIL_FROM: 'configured',
  });
  assert.equal(complete.ready, true);
  assert.equal(complete.sms.provider, NOTIFICATION_PROVIDER_TWILIO);
  assert.equal(complete.email.provider, NOTIFICATION_PROVIDER_RESEND);
  assert.equal(complete.email.deferred, true);
  assert.deepEqual(complete.configuration.bookingWrites, { enabled: false, configured: true, valid: true });
  assert.deepEqual(complete.configuration.publicOrigin, { configured: true, valid: true, value: 'https://emmiwood.example' });
  assert.deepEqual(complete.configuration.release, { configured: true, valid: true, value: 'a'.repeat(40) });
});

test('production readiness fails closed on missing or invalid runtime configuration', () => {
  const credentials = {
    ENVIRONMENT: 'production',
    EMMIWOOD_NOTIFICATION_SECRET: 'configured',
    TWILIO_ACCOUNT_SID: 'configured',
    TWILIO_API_KEY_SID: 'SKconfigured',
    TWILIO_AUTH_TOKEN: 'configured',
    TWILIO_FROM_NUMBER: 'configured',
  };
  const missing = notificationReadiness(credentials);
  assert.equal(missing.ready, false);
  assert.equal(missing.configuration.bookingWrites.enabled, false);
  assert.equal(missing.configuration.bookingWrites.valid, false);
  assert.equal(missing.configuration.publicOrigin.valid, false);
  assert.equal(missing.configuration.release.valid, false);

  const invalid = notificationReadiness({
    ...credentials,
    EMMIWOOD_PUBLIC_ORIGIN: 'http://emmiwood.example/path',
    EMMIWOOD_BOOKING_WRITES_ENABLED: 'yes',
    EMMIWOOD_RELEASE_SHA: 'short',
  });
  assert.equal(invalid.ready, false);
  assert.equal(invalid.configuration.bookingWrites.valid, false);
  assert.equal(invalid.configuration.publicOrigin.valid, false);
  assert.equal(invalid.configuration.release.valid, false);
});

test('reminders are due exactly 24 hours before eligible appointments', () => {
  assert.equal(reminderAvailableAt(200_000, 100_000), 113_600);
  assert.equal(reminderAvailableAt(186_400, 100_000), 100_000);
  assert.equal(reminderAvailableAt(186_399, 100_000), null);
});

test('notification processor readiness is authenticated and fails closed before any attempt', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const { onRequestGet, onRequestPost } = await import('../api/emmiwood/internal/notifications.js');
  const db = setupEmmiwoodTestD1();
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetchCalls += 1; return new Response('{}', { status: 200 }); };
  try {
    db.exec(`INSERT INTO emmiwood_notification_outbox(id,shop_id,channel,template,recipient,payload_json,provider,status,available_at)
      VALUES('blocked-1','emmiwood','sms','booking_confirmation','+16055550100','{}','twilio','queued',0)`);
    const env = {
      DB: db,
      ...PRODUCTION_RUNTIME,
      EMMIWOOD_NOTIFICATION_SECRET: 'secret',
    };
    const unauthorized = await onRequestGet({ env, request: new Request('https://example.com/api/emmiwood/internal/notifications') });
    assert.equal(unauthorized.status, 401);

    const request = new Request('https://example.com/api/emmiwood/internal/notifications', {
      headers: { authorization: 'Bearer secret' },
    });
    const readiness = await onRequestGet({ env, request });
    assert.equal(readiness.status, 503);
    assert.deepEqual((await readiness.json()).data.sms.missing, ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']);

    const response = await onRequestPost({ env, request: new Request(request, { method: 'POST' }) });
    assert.equal(response.status, 503);
    assert.equal(fetchCalls, 0);
    assert.deepEqual(db.query("SELECT status,attempt_count,last_attempt_at FROM emmiwood_notification_outbox WHERE id='blocked-1'"), [
      { status: 'queued', attempt_count: 0, last_attempt_at: null },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test('preview processor rejects bulk processing without exact notification id', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const { onRequestPost } = await import('../api/emmiwood/internal/notifications.js');
  const db = setupEmmiwoodTestD1();
  const env = {
    DB: db,
    ENVIRONMENT: 'preview',
    EMMIWOOD_NOTIFICATION_SECRET: 'secret',
    TWILIO_ACCOUNT_SID: 'sid',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_FROM_NUMBER: '+16050000000',
  };
  const bulk = await onRequestPost({
    env,
    request: new Request('https://example.com/api/emmiwood/internal/notifications', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
    }),
  });
  assert.equal(bulk.status, 422);
  assert.match((await bulk.json()).error, /exact notification id/i);
});

test('SMS-only production credentials satisfy readiness without Resend', async () => {
  const { onRequestGet } = await import('../api/emmiwood/internal/notifications.js');
  const env = {
    ...PRODUCTION_RUNTIME,
    EMMIWOOD_NOTIFICATION_SECRET: 'secret',
    TWILIO_ACCOUNT_SID: 'sid',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_FROM_NUMBER: '+16050000000',
  };
  const request = new Request('https://example.com/api/emmiwood/internal/notifications', {
    headers: { authorization: 'Bearer secret' },
  });
  const readiness = await onRequestGet({ env, request });
  assert.equal(readiness.status, 200);
  const body = await readiness.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.ready, true);
  assert.equal(body.data.sms.ready, true);
  assert.equal(body.data.email.ready, false);
  assert.equal(body.data.email.deferred, true);
});
test('complete production credentials activate Twilio', () => {
  assert.equal(notificationProvider({
    ENVIRONMENT: 'production',
    TWILIO_ACCOUNT_SID: 'sid',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_FROM_NUMBER: '+16050000000',
  }), NOTIFICATION_PROVIDER_UNCONFIGURED);
  assert.equal(notificationProvider({
    ENVIRONMENT: 'production',
    TWILIO_ACCOUNT_SID: 'sid',
    TWILIO_API_KEY_SID: 'SKkey',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_FROM_NUMBER: '+16050000000',
  }), NOTIFICATION_PROVIDER_TWILIO);
});

test('mock delivery never performs an external send and copy carries opt-out language', async () => {
  const result = await deliverNotification({}, { provider: 'mock', channel: 'sms' });
  assert.deepEqual(result, { provider: NOTIFICATION_PROVIDER_MOCK, status: 'queued' });
  assert.match(renderSms('booking_confirmation', { optOut: 'Reply STOP to opt out.' }), /Reply STOP/);
  assert.match(renderSms('booking_confirmation', { optOut: 'Reply STOP to opt out.' }), /^KUP Solutions:/);
  assert.match(renderSms('admin_login_code', { code: '123456' }), /^KUP Solutions: Emmiwood staff code 123456/);
});

test('booking confirmation SMS includes absolute manage link and appointment detail', () => {
  const manageUrl = manageAppointmentUrl(
    { EMMIWOOD_PUBLIC_ORIGIN: 'https://emmiwood-barbers-preview.pages.dev' },
    'tok_abc',
  );
  assert.equal(manageUrl, 'https://emmiwood-barbers-preview.pages.dev/emmiwood/manage#token=tok_abc');
  const body = renderSms('booking_confirmation', {
    serviceName: 'Signature Haircut',
    barberName: 'Barro',
    shopName: 'Emmiwood Barbers',
    when: 'Wed, Aug 12, 9:00 AM',
    manageUrl,
  });
  assert.match(body, /^KUP Solutions: You're booked at Emmiwood\./);
  assert.match(body, /Signature Haircut with Barro/);
  assert.match(body, /Manage: https:\/\/emmiwood-barbers-preview\.pages\.dev\/emmiwood\/manage#token=tok_abc/);
  assert.match(body, /Reply STOP to opt out, HELP for help/);
  assert.doesNotMatch(body, /appointment confirmed at/);
});


test('production email credentials activate Resend', () => {
  assert.equal(notificationProvider({ ENVIRONMENT: 'production', RESEND_API_KEY: 're_test', EMAIL_FROM: 'shop@example.com' }, 'email'), NOTIFICATION_PROVIDER_RESEND);
});


test('unconfigured production delivery never silently behaves like preview', async () => {
  await assert.rejects(
    () => deliverNotification({}, { provider: NOTIFICATION_PROVIDER_UNCONFIGURED, channel: 'email' }),
    /not configured/i,
  );
});

test('provider responses expose stable delivery identifiers', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => new Response(JSON.stringify(
      String(url).includes('twilio') ? { sid: 'SM123' } : { id: 'email-123' },
    ), { status: 200, headers: { 'content-type': 'application/json' } });
    const sms = await deliverNotification({
      TWILIO_ACCOUNT_SID: 'sid', TWILIO_AUTH_TOKEN: 'token', TWILIO_FROM_NUMBER: '+16050000000',
    }, { provider: NOTIFICATION_PROVIDER_TWILIO, channel: 'sms', template: 'booking_confirmation', recipient: '+16055550100', payload_json: '{}' });
    assert.equal(sms.providerMessageId, 'SM123');
    const email = await deliverNotification({ RESEND_API_KEY: 're_test', EMAIL_FROM: 'shop@example.com' }, {
      provider: NOTIFICATION_PROVIDER_RESEND, channel: 'email', template: 'admin_login_code', recipient: 'owner@example.com', payload_json: '{"code":"123456"}',
    });
    assert.equal(email.providerMessageId, 'email-123');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Twilio API key auth uses SK user with AC path', async () => {
  const originalFetch = globalThis.fetch;
  let seenAuth = '';
  let seenUrl = '';
  try {
    globalThis.fetch = async (url, init) => {
      seenUrl = String(url);
      seenAuth = String(init?.headers?.authorization || '');
      return new Response(JSON.stringify({ sid: 'SM-api-key' }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const result = await deliverNotification({
      TWILIO_ACCOUNT_SID: 'ACaccount',
      TWILIO_API_KEY_SID: 'SKkey',
      TWILIO_AUTH_TOKEN: 'api-secret',
      TWILIO_FROM_NUMBER: '+16050000000',
    }, { provider: NOTIFICATION_PROVIDER_TWILIO, channel: 'sms', template: 'booking_confirmation', recipient: '+16055550100', payload_json: '{}' });
    assert.equal(result.providerMessageId, 'SM-api-key');
    assert.match(seenUrl, /Accounts\/ACaccount\/Messages\.json/);
    assert.equal(seenAuth, `Basic ${btoa('SKkey:api-secret')}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('notification worker retries transient failures, then records terminal failure', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const { onRequestPost } = await import('../api/emmiwood/internal/notifications.js');
  const db = setupEmmiwoodTestD1();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  try {
    db.exec(`INSERT INTO emmiwood_notification_outbox(id,shop_id,channel,template,recipient,payload_json,provider,status,available_at)
      VALUES('retry-1','emmiwood','email','admin_login_code','owner@example.com','{"code":"123456"}','resend','queued',0)`);
    const env = {
      DB: db,
      ...PRODUCTION_RUNTIME,
      EMMIWOOD_NOTIFICATION_SECRET: 'secret',
      TWILIO_ACCOUNT_SID: 'sid',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM_NUMBER: '+16050000000',
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'shop@example.com',
    };
    const request = new Request('https://example.com/api/emmiwood/internal/notifications?id=retry-1', { method: 'POST', headers: { authorization: 'Bearer secret' } });
    let response = await onRequestPost({ env, request });
    assert.equal(response.status, 200);
    assert.deepEqual(db.query("SELECT status,attempt_count,error LIKE '%failed%' failed FROM emmiwood_notification_outbox WHERE id='retry-1'"), [{ status: 'queued', attempt_count: 1, failed: 1 }]);
    db.exec("UPDATE emmiwood_notification_outbox SET attempt_count=2,available_at=0 WHERE id='retry-1'");
    response = await onRequestPost({ env, request });
    assert.equal(response.status, 200);
    assert.deepEqual(db.query("SELECT status,attempt_count FROM emmiwood_notification_outbox WHERE id='retry-1'"), [{ status: 'failed', attempt_count: 3 }]);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});


test('notification worker resolves rows queued before production credentials were complete', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const { onRequestPost } = await import('../api/emmiwood/internal/notifications.js');
  const db = setupEmmiwoodTestD1();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ sid: 'SM-recovered' }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    db.exec(`INSERT INTO emmiwood_notification_outbox(id,shop_id,channel,template,recipient,payload_json,provider,status,available_at)
      VALUES('recovered-1','emmiwood','sms','booking_confirmation','+16055550100','{}','unconfigured','queued',0)`);
    const env = {
      DB: db,
      ...PRODUCTION_RUNTIME,
      EMMIWOOD_NOTIFICATION_SECRET: 'secret',
      TWILIO_ACCOUNT_SID: 'sid',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM_NUMBER: '+16050000000',
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'shop@example.com',
    };
    const request = new Request('https://example.com/api/emmiwood/internal/notifications?id=recovered-1', { method: 'POST', headers: { authorization: 'Bearer secret' } });
    const response = await onRequestPost({ env, request });
    assert.equal(response.status, 200);
    assert.deepEqual(db.query("SELECT provider,status,provider_message_id FROM emmiwood_notification_outbox WHERE id='recovered-1'"), [
      { provider: 'twilio', status: 'sent', provider_message_id: 'SM-recovered' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test('notification worker persists provider delivery identifiers', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const { onRequestPost } = await import('../api/emmiwood/internal/notifications.js');
  const db = setupEmmiwoodTestD1();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'email-provider-42' }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    db.exec(`INSERT INTO emmiwood_notification_outbox(id,shop_id,channel,template,recipient,payload_json,provider,status,available_at)
      VALUES('sent-1','emmiwood','email','admin_login_code','owner@example.com','{"code":"123456"}','resend','queued',0),
             ('untouched-1','emmiwood','email','admin_login_code','other@example.com','{"code":"654321"}','resend','queued',0)`);
    const env = {
      DB: db,
      ...PRODUCTION_RUNTIME,
      EMMIWOOD_NOTIFICATION_SECRET: 'secret',
      TWILIO_ACCOUNT_SID: 'sid',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM_NUMBER: '+16050000000',
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'shop@example.com',
    };
    const request = new Request('https://example.com/api/emmiwood/internal/notifications?id=sent-1', { method: 'POST', headers: { authorization: 'Bearer secret' } });
    const response = await onRequestPost({ env, request });
    const body = await response.json();
    assert.deepEqual(body.data.results, [{ id: 'sent-1', status: 'sent', provider: 'resend', providerMessageId: 'email-provider-42', attempt: 1 }]);
    assert.deepEqual(db.query("SELECT status,attempt_count,provider_message_id FROM emmiwood_notification_outbox WHERE id='sent-1'"), [{ status: 'sent', attempt_count: 1, provider_message_id: 'email-provider-42' }]);
    assert.deepEqual(db.query("SELECT status,attempt_count FROM emmiwood_notification_outbox WHERE id='untouched-1'"), [{ status: 'queued', attempt_count: 0 }]);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test('staffSmsStatements fanout copies notices to managers without T-15m or owner phones', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const db = setupEmmiwoodTestD1();
  db.exec(`INSERT INTO emmiwood_admins(id,shop_id,email,role,phone,active)
    VALUES('admin-barro','emmiwood','barro@example.com','manager','+16059006334',1);`);
  const start = Math.floor(Date.now() / 1000) + 3600;
  const args = {
    shopId: 'emmiwood', appointmentId: null, event: 'booked',
    startAt: start, serviceName: 'Cut', barberName: 'John', customerName: 'G', customerPhone: '+16055550188',
    now: start - 3600,
  };
  try {
    assert.deepEqual(await shopAdminNoticePhones({ DB: db, ENVIRONMENT: 'preview' }, 'emmiwood', null), []);

    const off = await staffSmsStatements({ DB: db, ENVIRONMENT: 'preview' }, { ...args, barberPhone: null });
    assert.deepEqual(off, []);

    const env = { DB: db, ENVIRONMENT: 'preview', EMMIWOOD_SHOP_ADMIN_SMS_FANOUT: 'true' };
    assert.deepEqual(await shopAdminNoticePhones(env, 'emmiwood', '+16059006334'), []);
    assert.deepEqual(await shopAdminNoticePhones(env, 'emmiwood', '+15078485517'), ['+16059006334']);

    const john = await staffSmsStatements(env, { ...args, barberPhone: null });
    assert.equal(john.length, 1);
    await db.batch(john);
    assert.deepEqual(
      db.query("SELECT template,recipient FROM emmiwood_notification_outbox ORDER BY template,recipient"),
      [{ template: 'barber_booking_notice', recipient: '+16059006334' }],
    );

    db.exec('DELETE FROM emmiwood_notification_outbox');
    const ownChair = await staffSmsStatements(env, { ...args, barberName: 'Barro', barberPhone: '+16059006334' });
    assert.equal(ownChair.length, 2);
    await db.batch(ownChair);
    assert.deepEqual(
      db.query('SELECT template,recipient FROM emmiwood_notification_outbox ORDER BY template'),
      [
        { template: 'barber_booking_notice', recipient: '+16059006334' },
        { template: 'barber_reminder_15m', recipient: '+16059006334' },
      ],
    );
  } finally {
    db.close();
  }
});

test('guest reminder uses same-day lead when the visit is under 24h away', () => {
  const now = 1_000_000;
  assert.equal(guestReminderAvailableAt(now + 48 * 3600, now), now + 24 * 3600);
  assert.equal(guestReminderAvailableAt(now + 3 * 3600, now), now + 3600);
  assert.equal(guestReminderAvailableAt(now + 45 * 60, now), now + 15 * 60);
  assert.equal(guestReminderAvailableAt(now + 10 * 60, now), null);
  assert.equal(phoneLast4('+16055550199'), '...0199');
});

test('renderSms staff templates include the chair name when provided', () => {
  const body = renderSms('barber_booking_notice', {
    shopName: 'Emmiwood Barbers',
    barberName: 'John',
    serviceName: 'Signature Haircut',
    when: 'Wed, Aug 26, 11:00 AM',
    customerName: 'Guest',
    customerPhone: '+16055550199',
    optOut: 'Reply STOP to opt out. Reply HELP for help.',
  });
  assert.match(body, /Wed, Aug 26, 11:00 AM · Signature Haircut/);
  assert.doesNotMatch(body, /John · Signature Haircut/);
});

test('barber reminder lead is T-15m and skips when start is too soon', () => {
  const now = 1_000_000;
  assert.equal(barberReminderAvailableAt(now + 20 * 60, now), now + 5 * 60);
  assert.equal(barberReminderAvailableAt(now + 10 * 60, now), null);
});

test('renderSms staff templates include customer details and STOP/HELP', () => {
  const body = renderSms('barber_booking_notice', {
    shopName: 'Emmiwood Barbers',
    serviceName: 'Signature Haircut',
    when: 'Wed, Aug 26, 11:00 AM',
    customerName: 'Guest',
    customerPhone: '+16055550199',
    optOut: 'Reply STOP to opt out. Reply HELP for help.',
  });
  assert.match(body, /New Emmiwood booking/);
  assert.match(body, /Guest · \.\.\.0199/);
  assert.doesNotMatch(body, /\+16055550199/);
  assert.match(body, /STOP/);
  assert.match(body, /HELP/);
});

test('adminAppointmentUrl builds the staff deep link and fails closed without origin or id', () => {
  assert.equal(
    adminAppointmentUrl({ EMMIWOOD_PUBLIC_ORIGIN: 'https://emmiwood.example' }, 'appt 1'),
    'https://emmiwood.example/emmiwood/admin?appointment=appt%201',
  );
  assert.equal(adminAppointmentUrl({}, 'appt-1'), null);
  assert.equal(adminAppointmentUrl({ EMMIWOOD_PUBLIC_ORIGIN: 'https://emmiwood.example' }, ''), null);
  assert.equal(adminAppointmentUrl({ EMMIWOOD_PUBLIC_ORIGIN: 'https://emmiwood.example' }, null), null);
});

test('renderSms staff templates carry the View deep link only when an admin URL is present', () => {
  const withLink = renderSms('barber_booking_notice', {
    serviceName: 'Cut',
    when: 'Wed, Aug 26, 11:00 AM',
    customerName: 'Guest',
    customerPhoneLast4: '...0199',
    adminUrl: 'https://emmiwood.example/emmiwood/admin?appointment=appt-1',
  });
  assert.match(withLink, /View: https:\/\/emmiwood\.example\/emmiwood\/admin\?appointment=appt-1/);
  const withoutLink = renderSms('barber_booking_notice', {
    serviceName: 'Cut',
    when: 'Wed, Aug 26, 11:00 AM',
    customerName: 'Guest',
    customerPhoneLast4: '...0199',
  });
  assert.doesNotMatch(withoutLink, /View:/);
});

test('barberSmsStatements payload carries the admin deep link for the notice and the reminder', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const db = setupEmmiwoodTestD1();
  const env = { DB: db, ENVIRONMENT: 'preview', EMMIWOOD_PUBLIC_ORIGIN: 'https://emmiwood.example' };
  const start = Math.floor(Date.now() / 1000) + 3600;
  try {
    db.exec(`INSERT INTO emmiwood_customers(id,shop_id,name,phone) VALUES('c-42','emmiwood','G','+16055550199');
      INSERT INTO emmiwood_appointments(id,shop_id,barber_id,service_id,customer_id,start_at,end_at,claim_end_at,status,manage_token_hash)
      VALUES('appt-42','emmiwood','barro','signature','c-42',${start},${start + 2400},${start + 3000},'booked','hash-42');`);
    const stmts = barberSmsStatements(env, {
      shopId: 'emmiwood', appointmentId: 'appt-42', barberPhone: '+15078485517', event: 'booked',
      startAt: start, serviceName: 'Cut', barberName: 'Barro', customerName: 'G', customerPhone: '+16055550199',
      now: start - 3600,
    });
    await db.batch(stmts);
    const rows = db.query("SELECT template,payload_json FROM emmiwood_notification_outbox ORDER BY template");
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(JSON.parse(row.payload_json).adminUrl, 'https://emmiwood.example/emmiwood/admin?appointment=appt-42');
    }
  } finally {
    db.close();
  }
});

test('sanitizeOutboxRow redacts OTP codes and full customer phones', () => {
  const otp = sanitizeOutboxRow({
    id: 'otp-1',
    template: 'admin_login_code',
    payload_json: '{"code":"111222"}',
  });
  assert.equal(otp.bodyPreview, 'Staff sign-in code (hidden)');
  assert.equal(JSON.parse(otp.payload_json).redacted, true);
  assert.equal(JSON.stringify(otp).includes('111222'), false);

  const staff = sanitizeOutboxRow({
    id: 'staff-1',
    template: 'barber_booking_notice',
    payload_json: JSON.stringify({
      when: 'Tue, Sep 8, 10:35 AM',
      serviceName: 'Cut',
      customerName: 'Jane Doe',
      customerPhone: '+16055550188',
    }),
  });
  assert.equal(JSON.parse(staff.payload_json).customerPhone, undefined);
  assert.equal(JSON.parse(staff.payload_json).customerPhoneLast4, '...0188');
  assert.match(staff.bodyPreview, /Jane · \.\.\.0188/);
  assert.doesNotMatch(staff.bodyPreview, /\+16055550188/);
});

test('barberSmsStatements no-ops without phone; queues notice + 15m reminder with phone', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const db = setupEmmiwoodTestD1();
  const env = { DB: db, ENVIRONMENT: 'preview' };
  const start = Math.floor(Date.now() / 1000) + 3600;
  try {
    assert.deepEqual(barberSmsStatements(env, {
      shopId: 'emmiwood', appointmentId: null, barberPhone: null, event: 'booked',
      startAt: start, serviceName: 'Cut', barberName: 'Barro', customerName: 'G', customerPhone: '+1',
      now: start - 3600,
    }), []);

    const stmts = barberSmsStatements(env, {
      shopId: 'emmiwood', appointmentId: null, barberPhone: '+15078485517', event: 'booked',
      startAt: start, serviceName: 'Cut', barberName: 'Barro', customerName: 'G', customerPhone: '+16055550199',
      now: start - 3600,
    });
    assert.equal(stmts.length, 2);
    await db.batch(stmts);
    assert.deepEqual(
      db.query("SELECT template,recipient,status FROM emmiwood_notification_outbox ORDER BY template"),
      [
        { template: 'barber_booking_notice', recipient: '+15078485517', status: 'queued' },
        { template: 'barber_reminder_15m', recipient: '+15078485517', status: 'queued' },
      ],
    );
    assert.deepEqual(
      db.query("SELECT available_at FROM emmiwood_notification_outbox WHERE template='barber_reminder_15m'"),
      [{ available_at: start - 15 * 60 }],
    );
  } finally {
    db.close();
  }
});

test('guest supersession scopes away from barber_*; barber path cancels and re-queues staff rows', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const db = setupEmmiwoodTestD1();
  const env = { DB: db, ENVIRONMENT: 'preview', EMMIWOOD_PUBLIC_ORIGIN: 'https://emmiwood.example' };
  const start = Math.floor(Date.now() / 1000) + 48 * 3600;
  const later = start + 3600;
  const appointmentId = 'appt-staff-1';
  try {
    db.exec(`INSERT INTO emmiwood_customers(id,shop_id,name,phone) VALUES('c-staff','emmiwood','G','+16055550199');
      INSERT INTO emmiwood_appointments(id,shop_id,barber_id,service_id,customer_id,start_at,end_at,claim_end_at,status,manage_token_hash)
      VALUES('${appointmentId}','emmiwood','barro','signature','c-staff',${start},${start + 2400},${start + 3000},'booked','hash-staff-1');`);
    await db.batch([
      ...appointmentSmsStatements(env, {
        shopId: 'emmiwood', appointmentId, recipient: '+16055550199', smsConsent: true,
        smsConsentVersion: 'kup-appointment-texts-v1', event: 'booked', startAt: start,
        serviceName: 'Cut', barberName: 'Barro', manageToken: 'tok', now: start - 30 * 3600,
      }),
      ...barberSmsStatements(env, {
        shopId: 'emmiwood', appointmentId, barberPhone: '+15078485517', event: 'booked',
        startAt: start, serviceName: 'Cut', barberName: 'Barro', customerName: 'G', customerPhone: '+16055550199',
        now: start - 30 * 3600,
      }),
    ]);
    await db.batch([
      ...appointmentSmsStatements(env, {
        shopId: 'emmiwood', appointmentId, recipient: '+16055550199', smsConsent: true,
        smsConsentVersion: 'kup-appointment-texts-v1', event: 'rescheduled', startAt: later,
        previousStartAt: start, serviceName: 'Cut', barberName: 'Barro', manageToken: 'tok', now: start - 30 * 3600,
      }),
      ...barberSmsStatements(env, {
        shopId: 'emmiwood', appointmentId, barberPhone: '+15078485517', event: 'rescheduled',
        startAt: later, previousStartAt: start, serviceName: 'Cut', barberName: 'Barro',
        customerName: 'G', customerPhone: '+16055550199', now: start - 30 * 3600,
      }),
    ]);
    const rows = db.query("SELECT template,status FROM emmiwood_notification_outbox ORDER BY template,status");
    assert.deepEqual(rows, [
      { template: 'appointment_reminder', status: 'cancelled' },
      { template: 'appointment_reminder', status: 'queued' },
      { template: 'barber_booking_notice', status: 'cancelled' },
      { template: 'barber_reminder_15m', status: 'cancelled' },
      { template: 'barber_reminder_15m', status: 'queued' },
      { template: 'barber_reschedule_notice', status: 'queued' },
      { template: 'booking_confirmation', status: 'cancelled' },
      { template: 'reschedule_confirmation', status: 'queued' },
    ]);
  } finally {
    db.close();
  }
});

test('flushDueAppointmentNotifications skips on preview exact-id-only', async () => {
  const { flushDueAppointmentNotifications } = await import('./emmiwood-notifications.js');
  const result = await flushDueAppointmentNotifications(
    { ENVIRONMENT: 'preview', DB: { prepare() { throw new Error('should not query'); } } },
    'appt-1',
  );
  assert.equal(result.skipped, 'exact_id_only');
  assert.equal(result.processed, 0);
});

function processorEnv(db, extra = {}) {
  return {
    DB: db,
    ...PRODUCTION_RUNTIME,
    EMMIWOOD_NOTIFICATION_SECRET: 'secret',
    TWILIO_ACCOUNT_SID: 'sid',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_FROM_NUMBER: '+16050000000',
    ...extra,
  };
}

function insertOutbox(db, {
  id,
  template = 'booking_confirmation',
  recipient = '+16055550100',
  provider = 'twilio',
  status = 'queued',
  availableAt = Math.floor(Date.now() / 1000),
  attemptCount = 0,
  lastAttemptAt = null,
  payload = {},
  appointmentId = null,
}) {
  const appointmentSql = appointmentId == null ? 'NULL' : `'${appointmentId}'`;
  const lastAttemptSql = lastAttemptAt == null ? 'NULL' : String(lastAttemptAt);
  db.exec(`INSERT INTO emmiwood_notification_outbox(
      id,shop_id,appointment_id,channel,template,recipient,payload_json,provider,status,available_at,attempt_count,last_attempt_at
    ) VALUES(
      '${id}','emmiwood',${appointmentSql},'sms','${template}','${recipient}',
      '${JSON.stringify(payload).replaceAll("'", "''")}','${provider}','${status}',${availableAt},${attemptCount},${lastAttemptSql}
    )`);
}

test('test mode is on by default outside production and only when allowlisted in production', () => {
  assert.equal(notificationTestMode({ ENVIRONMENT: 'preview' }, 'sms'), true);
  assert.equal(notificationTestMode({ ENVIRONMENT: 'development' }, 'email'), true);
  assert.equal(notificationTestMode({}, 'sms'), false);
  assert.equal(notificationTestMode({ ENVIRONMENT: 'production' }, 'sms'), false);
  assert.equal(notificationTestMode({
    ENVIRONMENT: 'production',
    SMS_TEST_ALLOWLIST: '+16055550100',
  }, 'sms'), true);
  const preview = notificationReadiness({ ENVIRONMENT: 'preview' });
  assert.equal(preview.sms.testMode, true);
  assert.equal(preview.sms.testAllowlistCount, 0);
  const production = notificationReadiness({
    ...PRODUCTION_RUNTIME,
    EMMIWOOD_NOTIFICATION_SECRET: 'configured',
    TWILIO_ACCOUNT_SID: 'configured',
    TWILIO_AUTH_TOKEN: 'configured',
    TWILIO_FROM_NUMBER: 'configured',
    SMS_TEST_ALLOWLIST: '+16055550100,+16055550101',
  });
  assert.equal(production.sms.testMode, true);
  assert.equal(production.sms.testAllowlistCount, 2);
});

test('staleNotificationReason covers past appointments, old reminders, and old notices', () => {
  const now = 2_000_000;
  assert.equal(staleNotificationReason({
    template: 'appointment_reminder',
    payload_json: JSON.stringify({ start: now - 10 }),
    available_at: now - 60,
  }, now), STALE_APPOINTMENT_ERROR);
  assert.equal(staleNotificationReason({
    template: 'barber_reminder_15m',
    payload_json: JSON.stringify({ start: now - 1 }),
    available_at: now - 60,
  }, now), STALE_APPOINTMENT_ERROR);
  assert.equal(staleNotificationReason({
    template: 'appointment_reminder',
    payload_json: JSON.stringify({ start: now + 3600 }),
    available_at: now - REMINDER_STALE_AGE_SECONDS - 1,
  }, now), STALE_APPOINTMENT_ERROR);
  assert.equal(staleNotificationReason({
    template: 'booking_confirmation',
    payload_json: '{}',
    available_at: now - NOTICE_STALE_AGE_SECONDS - 1,
  }, now), STALE_NOTICE_ERROR);
  assert.equal(staleNotificationReason({
    template: 'cancellation_confirmation',
    payload_json: '{}',
    available_at: now - NOTICE_STALE_AGE_SECONDS - 1,
  }, now), STALE_NOTICE_ERROR);
  assert.equal(staleNotificationReason({
    template: 'reschedule_confirmation',
    payload_json: '{}',
    available_at: now - NOTICE_STALE_AGE_SECONDS - 1,
  }, now), STALE_NOTICE_ERROR);
  assert.equal(staleNotificationReason({
    template: 'appointment_reminder',
    payload_json: JSON.stringify({ start: now + 3600 }),
    available_at: now - 60,
  }, now), null);
});

test('processor expires stale reminders and old confirmation notices', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const db = setupEmmiwoodTestD1();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ sid: 'SM-stale' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const now = Math.floor(Date.now() / 1000);
    insertOutbox(db, {
      id: 'stale-reminder',
      template: 'appointment_reminder',
      payload: { start: now - 120 },
    });
    insertOutbox(db, {
      id: 'stale-notice',
      template: 'booking_confirmation',
      availableAt: now - NOTICE_STALE_AGE_SECONDS - 30,
    });
    const env = processorEnv(db);
    const reminder = await processQueuedNotifications(env, { notificationId: 'stale-reminder' });
    const notice = await processQueuedNotifications(env, { notificationId: 'stale-notice' });
    assert.equal(reminder.results[0].status, 'expired');
    assert.equal(reminder.results[0].error, STALE_APPOINTMENT_ERROR);
    assert.equal(notice.results[0].status, 'expired');
    assert.equal(notice.results[0].error, STALE_NOTICE_ERROR);
    assert.equal(fetchCalls, 0);
    assert.deepEqual(db.query("SELECT status,error FROM emmiwood_notification_outbox WHERE id='stale-reminder'"), [
      { status: 'expired', error: STALE_APPOINTMENT_ERROR },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test('allowlisted SMS sends via stubbed Twilio and non-allowlisted stays queued', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const db = setupEmmiwoodTestD1();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: String(init?.body || '') });
    return new Response(JSON.stringify({ sid: 'SM-allow' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    insertOutbox(db, { id: 'allow-1', recipient: '+16055550100' });
    insertOutbox(db, { id: 'block-1', recipient: '+16055550999' });
    const env = processorEnv(db, { SMS_TEST_ALLOWLIST: '+16055550100' });
    const allowed = await deliverNotification(env, {
      provider: NOTIFICATION_PROVIDER_TWILIO,
      channel: 'sms',
      template: 'booking_confirmation',
      recipient: '+16055550100',
      payload_json: '{}',
    });
    const blocked = await deliverNotification(env, {
      provider: NOTIFICATION_PROVIDER_TWILIO,
      channel: 'sms',
      template: 'booking_confirmation',
      recipient: '+16055550999',
      payload_json: '{}',
    });
    assert.equal(allowed.status, 'sent');
    assert.equal(allowed.providerMessageId, 'SM-allow');
    assert.equal(blocked.status, 'skipped_test_mode');
    const sent = await processQueuedNotifications(env, { notificationId: 'allow-1' });
    const skipped = await processQueuedNotifications(env, { notificationId: 'block-1' });
    assert.equal(sent.results[0].status, 'sent');
    assert.equal(skipped.results[0].status, 'skipped_test_mode');
    assert.equal(skipped.processed, 0);
    assert.deepEqual(db.query("SELECT status,attempt_count,last_attempt_at FROM emmiwood_notification_outbox WHERE id='block-1'"), [
      { status: 'queued', attempt_count: 0, last_attempt_at: null },
    ]);
    assert.equal(calls.length, 2);
    assert.match(calls[0].body, /To=%2B16055550100/);
    assert.match(calls[1].body, /To=%2B16055550100/);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test('test mode leaves non-allowlisted outbox rows queued and unclaimed', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const db = setupEmmiwoodTestD1();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ sid: 'SM-nope' }), { status: 200 });
  };
  try {
    insertOutbox(db, { id: 'skip-1', recipient: '+16055550999' });
    const env = processorEnv(db, { SMS_TEST_ALLOWLIST: '+16055550100' });
    const outcome = await processQueuedNotifications(env, { notificationId: 'skip-1' });
    assert.equal(outcome.results[0].status, 'skipped_test_mode');
    assert.equal(outcome.processed, 0);
    assert.equal(fetchCalls, 0);
    assert.deepEqual(
      db.query("SELECT status,attempt_count,last_attempt_at,error FROM emmiwood_notification_outbox WHERE id='skip-1'"),
      [{ status: 'queued', attempt_count: 0, last_attempt_at: null, error: null }],
    );
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test('booking-time flush defers non-allowlisted numbers to the queue', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const { flushDueAppointmentNotifications } = await import('./emmiwood-notifications.js');
  const db = setupEmmiwoodTestD1();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ sid: 'SM-book' }), { status: 200 });
  };
  const start = Math.floor(Date.now() / 1000) + 3600;
  try {
    db.exec(`INSERT INTO emmiwood_customers(id,shop_id,name,phone) VALUES('c-skip','emmiwood','G','+16055550999');
      INSERT INTO emmiwood_appointments(id,shop_id,barber_id,service_id,customer_id,start_at,end_at,claim_end_at,status,manage_token_hash)
      VALUES('appt-skip','emmiwood','barro','signature','c-skip',${start},${start + 2400},${start + 3000},'booked','hash-skip');`);
    insertOutbox(db, {
      id: 'book-skip-1',
      appointmentId: 'appt-skip',
      recipient: '+16055550999',
      payload: { start },
    });
    const env = processorEnv(db, { SMS_TEST_ALLOWLIST: '+16055550100' });
    const outcome = await flushDueAppointmentNotifications(env, 'appt-skip');
    assert.equal(outcome.ok, true);
    assert.equal(outcome.processed, 0);
    assert.equal(outcome.results[0].status, 'skipped_test_mode');
    assert.equal(fetchCalls, 0);
    assert.deepEqual(
      db.query("SELECT status,attempt_count,last_attempt_at FROM emmiwood_notification_outbox WHERE id='book-skip-1'"),
      [{ status: 'queued', attempt_count: 0, last_attempt_at: null }],
    );
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test('preview live SMS is skipped when the allowlist is empty', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ sid: 'SM-nope' }), { status: 200 });
  };
  try {
    const result = await deliverNotification({
      ENVIRONMENT: 'preview',
      TWILIO_ACCOUNT_SID: 'sid',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM_NUMBER: '+16050000000',
    }, {
      provider: NOTIFICATION_PROVIDER_TWILIO,
      channel: 'sms',
      template: 'booking_confirmation',
      recipient: '+16055550100',
      payload_json: '{}',
    });
    assert.equal(result.status, 'skipped_test_mode');
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('two concurrent processors deliver one queued row exactly once', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const db = setupEmmiwoodTestD1();
  const originalFetch = globalThis.fetch;
  let sends = 0;
  globalThis.fetch = async () => {
    sends += 1;
    await new Promise((resolve) => setTimeout(resolve, 25));
    return new Response(JSON.stringify({ sid: 'SM-once' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    insertOutbox(db, { id: 'once-1', recipient: '+16055550100' });
    const env = processorEnv(db);
    const [first, second] = await Promise.all([
      processQueuedNotifications(env, { notificationId: 'once-1' }),
      processQueuedNotifications(env, { notificationId: 'once-1' }),
    ]);
    const sent = [first, second].filter((outcome) => outcome.results.some((row) => row.status === 'sent'));
    const processed = first.processed + second.processed;
    assert.equal(sends, 1);
    assert.equal(sent.length, 1);
    assert.ok(processed <= 1);
    assert.deepEqual(db.query("SELECT status,provider_message_id,attempt_count FROM emmiwood_notification_outbox WHERE id='once-1'"), [
      { status: 'sent', provider_message_id: 'SM-once', attempt_count: 1 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test('reaper returns stale sending rows to queued and counts the attempt', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const db = setupEmmiwoodTestD1();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ sid: 'SM-reaped' }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const now = Math.floor(Date.now() / 1000);
    insertOutbox(db, {
      id: 'reap-1',
      status: 'sending',
      attemptCount: 1,
      lastAttemptAt: now - STALE_SENDING_SECONDS - 5,
      payload: { start: now + 3600 },
    });
    const outcome = await processQueuedNotifications(processorEnv(db), { notificationId: 'reap-1' });
    assert.equal(outcome.results[0].status, 'sent');
    assert.deepEqual(db.query("SELECT status,attempt_count FROM emmiwood_notification_outbox WHERE id='reap-1'"), [
      { status: 'sent', attempt_count: 3 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

