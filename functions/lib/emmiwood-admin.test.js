import test from 'node:test';
import assert from 'node:assert/strict';
import { EDIT_ROLES, authRequestLimit, authSourceLimit, requestCode, requireAdmin, verifyCode } from './emmiwood-admin.js';
import { setupEmmiwoodTestD1 } from './emmiwood-test-d1.js';

const OWNER_PHONE = '+16055550199';

function envForRole(role) {
  return {
    ENVIRONMENT: 'preview',
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                if (sql.includes('SELECT id FROM emmiwood_shops')) return { id: 'emmiwood' };
                if (sql.includes('FROM emmiwood_sessions')) return { id: `admin-${role}`, email: `${role}@example.com`, phone: OWNER_PHONE, role };
                return null;
              },
            };
          },
        };
      },
      async batch() { return []; },
    },
  };
}

const request = new Request('https://preview.example/api/emmiwood/admin/dashboard', {
  headers: { authorization: 'Bearer preview-session-token' },
});

function twilioEnv(db, extra = {}) {
  return {
    DB: db,
    ENVIRONMENT: 'production',
    TWILIO_ACCOUNT_SID: 'sid',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_FROM_NUMBER: '+16050000000',
    EMMIWOOD_AUTH_RESPONSE_FLOOR_MS: '1',
    ...extra,
  };
}

function mockTwilioFetch(calls, sid = 'SM-admin-1') {
  return async (url, init) => {
    calls.push({ url: String(url), body: String(init?.body || '') });
    return new Response(JSON.stringify({ sid }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

test('owner role can enter shop-edit operations', async () => {
  const admin = await requireAdmin(envForRole('owner'), request, EDIT_ROLES);
  assert.equal(admin.role, 'owner');
});

test('KUP support remains a separate read/support boundary', async () => {
  assert.equal(EDIT_ROLES.includes('kup_support'), false);
  await assert.rejects(() => requireAdmin(envForRole('kup_support'), request, EDIT_ROLES), (error) => error?.code === 'forbidden' && error?.status === 403);
});

test('auth request limits stay strict in production and QA-friendly in preview', () => {
  assert.equal(authRequestLimit({ ENVIRONMENT: 'production' }), 5);
  assert.equal(authRequestLimit({ ENVIRONMENT: 'preview' }), 50);
  assert.equal(authRequestLimit({ ENVIRONMENT: 'production', EMMIWOOD_AUTH_REQUEST_LIMIT: '8' }), 8);
});

test('login requests are bounded by request source as well as account', async () => {
  const db = setupEmmiwoodTestD1();
  const env = { DB: db, ENVIRONMENT: 'preview', EMMIWOOD_AUTH_SOURCE_LIMIT: '2' };
  try {
    assert.equal(authSourceLimit(env), 2);
    const first = await requestCode(env, OWNER_PHONE, { source: '203.0.113.9' });
    const second = await requestCode(env, OWNER_PHONE, { source: '203.0.113.9' });
    const limited = await requestCode(env, OWNER_PHONE, { source: '203.0.113.9' });
    assert.match(first.previewCode, /^\d{6}$/);
    assert.match(second.previewCode, /^\d{6}$/);
    assert.deepEqual(limited, { ok: true });
    assert.equal(db.query('SELECT COUNT(*) count FROM emmiwood_login_challenges')[0].count, 2);
  } finally { db.close(); }
});

test('production request-code sends SMS immediately while known and unknown numbers stay indistinguishable', async () => {
  const db = setupEmmiwoodTestD1();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockTwilioFetch(calls);

  try {
    const env = twilioEnv(db);
    const known = await requestCode(env, '605-555-0199');
    const unknown = await requestCode(env, '605-555-0100');

    assert.deepEqual(known, { ok: true });
    assert.deepEqual(unknown, known);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /api\.twilio\.com/);
    assert.match(calls[0].body, /To=%2B16055550199/);
    assert.match(decodeURIComponent(calls[0].body), /\b\d{6}\b/);
    assert.deepEqual(db.query("SELECT status,attempt_count,provider_message_id,channel,last_attempt_at IS NOT NULL attempted FROM emmiwood_notification_outbox"), [
      { status: 'sent', attempt_count: 1, provider_message_id: 'SM-admin-1', channel: 'sms', attempted: 1 },
    ]);
    const audit = JSON.stringify(db.query('SELECT event_type,detail_json FROM emmiwood_events'));
    assert.equal(audit.includes(decodeURIComponent(calls[0].body).match(/\b\d{6}\b/)[0]), false);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test('production request-code can defer delivery to the request lifecycle without a scheduler', async () => {
  const db = setupEmmiwoodTestD1();
  const deferred = [];
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockTwilioFetch(calls, 'SM-deferred');

  try {
    const result = await requestCode(twilioEnv(db), OWNER_PHONE, { defer: (task) => deferred.push(task) });
    assert.deepEqual(result, { ok: true });
    assert.equal(deferred.length, 1);
    await deferred[0];
    assert.equal(db.query('SELECT status FROM emmiwood_notification_outbox')[0].status, 'sent');
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test('provider rejection is recorded without changing the public response', async () => {
  const db = setupEmmiwoodTestD1();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });

  try {
    const result = await requestCode(twilioEnv(db), OWNER_PHONE);
    assert.deepEqual(result, { ok: true });
    const outbox = db.query('SELECT status,attempt_count,last_attempt_at IS NOT NULL attempted,error FROM emmiwood_notification_outbox')[0];
    assert.equal(outbox.status, 'failed');
    assert.equal(outbox.attempt_count, 1);
    assert.equal(outbox.attempted, 1);
    assert.match(outbox.error, /delivery failed/i);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test('provider timeout is bounded and recorded without exposing the account', async () => {
  const db = setupEmmiwoodTestD1();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });

  try {
    const result = await requestCode(twilioEnv(db, { EMMIWOOD_NOTIFICATION_TIMEOUT_MS: '5' }), OWNER_PHONE);
    assert.deepEqual(result, { ok: true });
    const outbox = db.query('SELECT status,error FROM emmiwood_notification_outbox')[0];
    assert.equal(outbox.status, 'failed');
    assert.match(outbox.error, /timed out/i);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test('preview codes expire, reject invalid values, and cannot be reused', async () => {
  const db = setupEmmiwoodTestD1();
  const env = { DB: db, ENVIRONMENT: 'preview' };

  try {
    const first = await requestCode(env, OWNER_PHONE);
    assert.match(first.previewCode, /^\d{6}$/);
    await assert.rejects(() => verifyCode(env, OWNER_PHONE, '000000'), { code: 'invalid_code' });
    db.exec('UPDATE emmiwood_login_challenges SET expires_at=0');
    await assert.rejects(() => verifyCode(env, OWNER_PHONE, first.previewCode), { code: 'invalid_code' });

    const second = await requestCode(env, OWNER_PHONE);
    const verified = await verifyCode(env, OWNER_PHONE, second.previewCode);
    assert.equal(verified.admin.phone, OWNER_PHONE);
    assert.equal(verified.admin.email, 'isaiah@kup.solutions');
    assert.match(verified.token, /^[A-Za-z0-9_-]+$/);
    await assert.rejects(() => verifyCode(env, OWNER_PHONE, second.previewCode), { code: 'invalid_code' });
  } finally {
    db.close();
  }
});

test('requesting a new code invalidates every older active code', async () => {
  const db = setupEmmiwoodTestD1();
  const env = { DB: db, ENVIRONMENT: 'preview' };
  try {
    const first = await requestCode(env, OWNER_PHONE);
    const second = await requestCode(env, OWNER_PHONE);
    await assert.rejects(() => verifyCode(env, OWNER_PHONE, first.previewCode), { code: 'invalid_code' });
    const verified = await verifyCode(env, OWNER_PHONE, second.previewCode);
    assert.equal(verified.admin.role, 'owner');
  } finally {
    db.close();
  }
});

test('a login challenge locks after five failed verification attempts', async () => {
  const db = setupEmmiwoodTestD1();
  const env = { DB: db, ENVIRONMENT: 'preview' };
  try {
    const challenge = await requestCode(env, OWNER_PHONE);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await assert.rejects(() => verifyCode(env, OWNER_PHONE, '000000'), { code: 'invalid_code' });
    }
    await assert.rejects(() => verifyCode(env, OWNER_PHONE, challenge.previewCode), { code: 'invalid_code' });
    assert.deepEqual(
      db.query('SELECT failed_attempts,locked_at IS NOT NULL locked FROM emmiwood_login_challenges ORDER BY created_at DESC LIMIT 1'),
      [{ failed_attempts: 5, locked: 1 }],
    );
  } finally {
    db.close();
  }
});

test('administrative sessions can be read from the HttpOnly cookie transport', async () => {
  const cookieRequest = new Request('https://preview.example/api/emmiwood/admin/dashboard', {
    headers: { cookie: 'emmiwood_admin_session=preview-session-token' },
  });
  const admin = await requireAdmin(envForRole('owner'), cookieRequest, EDIT_ROLES);
  assert.equal(admin.role, 'owner');
});

test('session cookie helpers are HttpOnly, strict, scoped, and production-secure', async () => {
  const { adminSessionCookie, clearAdminSessionCookie } = await import('./emmiwood-admin.js');
  const preview = adminSessionCookie('token value', { ENVIRONMENT: 'preview' });
  assert.match(preview, /^emmiwood_admin_session=token%20value;/);
  assert.match(preview, /Path=\/api\/emmiwood\/admin/);
  assert.match(preview, /HttpOnly/);
  assert.match(preview, /SameSite=Strict/);
  assert.doesNotMatch(preview, /Secure/);
  assert.match(adminSessionCookie('token', { ENVIRONMENT: 'production' }), /; Secure$/);
  assert.match(clearAdminSessionCookie({ ENVIRONMENT: 'production' }), /Max-Age=0/);
});
