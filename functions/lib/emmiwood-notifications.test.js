import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTIFICATION_PROVIDER_MOCK,
  NOTIFICATION_PROVIDER_UNCONFIGURED,
  NOTIFICATION_PROVIDER_TWILIO,
  NOTIFICATION_PROVIDER_RESEND,
  deliverNotification,
  notificationProvider,
  notificationReadiness,
  reminderAvailableAt,
  renderSms,
} from './emmiwood-notifications.js';

test('preview uses mock delivery while incomplete production credentials fail closed', () => {
  assert.equal(notificationProvider({ ENVIRONMENT: 'preview' }), NOTIFICATION_PROVIDER_MOCK);
  assert.equal(notificationProvider({ ENVIRONMENT: 'production', TWILIO_ACCOUNT_SID: 'sid' }), NOTIFICATION_PROVIDER_UNCONFIGURED);
  assert.equal(notificationProvider({ ENVIRONMENT: 'production' }, 'email'), NOTIFICATION_PROVIDER_UNCONFIGURED);
});



test('production readiness reports missing names without exposing values', () => {
  const incomplete = notificationReadiness({
    ENVIRONMENT: 'production',
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
    ENVIRONMENT: 'production',
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
    ENVIRONMENT: 'production',
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
      ENVIRONMENT: 'production',
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

test('SMS-only production credentials satisfy readiness without Resend', async () => {
  const { onRequestGet } = await import('../api/emmiwood/internal/notifications.js');
  const env = {
    ENVIRONMENT: 'production',
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
  }), NOTIFICATION_PROVIDER_TWILIO);
});

test('mock delivery never performs an external send and copy carries opt-out language', async () => {
  const result = await deliverNotification({}, { provider: 'mock', channel: 'sms' });
  assert.deepEqual(result, { provider: NOTIFICATION_PROVIDER_MOCK, status: 'queued' });
  assert.match(renderSms('booking_confirmation', { optOut: 'Reply STOP to opt out.' }), /Reply STOP/);
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

test('notification worker retries transient failures, then records terminal failure', async () => {
  const { setupEmmiwoodTestD1 } = await import('./emmiwood-test-d1.js');
  const { onRequestPost } = await import('../api/emmiwood/internal/notifications.js');
  const db = setupEmmiwoodTestD1();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  try {
    db.exec(`INSERT INTO emmiwood_notification_outbox(id,shop_id,channel,template,recipient,payload_json,provider,status,available_at)
      VALUES('retry-1','emmiwood','email','admin_login_code','owner@example.com','{"code":"123456"}','resend','queued',0)`);
    const env = { DB: db, EMMIWOOD_NOTIFICATION_SECRET: 'secret', RESEND_API_KEY: 're_test', EMAIL_FROM: 'shop@example.com' };
    const request = new Request('https://example.com/api/emmiwood/internal/notifications', { method: 'POST', headers: { authorization: 'Bearer secret' } });
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
      ENVIRONMENT: 'production',
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
    const env = { DB: db, EMMIWOOD_NOTIFICATION_SECRET: 'secret', RESEND_API_KEY: 're_test', EMAIL_FROM: 'shop@example.com' };
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
