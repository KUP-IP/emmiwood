import assert from 'node:assert/strict';
import { test } from 'node:test';

import { processQueue, probeReadiness, runHeartbeat } from '../src/index.js';

const READY_BODY = {
  ok: true,
  data: {
    environment: 'production',
    ready: true,
    processor: { ready: true },
    sms: { ready: true, provider: 'twilio' },
    email: { ready: true, provider: 'resend' },
  },
};

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init, calls.length);
  };
  return calls;
}

function jsonResponse(status, body) {
  return { status, json: async () => body };
}

const ENV = {
  EMMIWOOD_NOTIFICATION_URL: 'https://example.test/api/emmiwood/internal/notifications',
  EMMIWOOD_NOTIFICATION_SECRET: 'test-secret',
};

test('probe succeeds on a ready production response and sends Bearer auth', async () => {
  const calls = stubFetch(async () => jsonResponse(200, READY_BODY));
  const data = await probeReadiness({ ...ENV });
  assert.equal(data.ready, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-secret');
  assert.equal(calls[0].url, ENV.EMMIWOOD_NOTIFICATION_URL);
});

test('probe throws when readiness reports not ready', async () => {
  stubFetch(async () => jsonResponse(503, { ok: false, data: { environment: 'production', ready: false } }));
  await assert.rejects(() => probeReadiness({ ...ENV }), /readiness probe failed/);
});

test('probe throws when the environment is not production', async () => {
  stubFetch(async () => jsonResponse(200, { ok: true, data: { ...READY_BODY.data, environment: 'preview' } }));
  await assert.rejects(() => probeReadiness({ ...ENV }), /environment=preview/);
});

test('heartbeat skips queue processing unless PROCESS_QUEUE is "true"', async () => {
  const calls = stubFetch(async () => jsonResponse(200, READY_BODY));
  await runHeartbeat({ ...ENV });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'GET');
});

test('heartbeat processes the queue after a good probe when enabled', async () => {
  const calls = stubFetch(async (url, init) => (init.method === 'POST'
    ? jsonResponse(200, { ok: true, data: { processed: 1, results: [{ id: 'n1', status: 'sent', provider: 'twilio', attempt: 1, providerMessageId: 'SM1' }] } })
    : jsonResponse(200, READY_BODY)));
  await runHeartbeat({ ...ENV, PROCESS_QUEUE: 'true' });
  assert.deepEqual(calls.map((call) => call.init.method), ['GET', 'POST']);
});

test('processing throws when any result is retrying or failed', async () => {
  stubFetch(async () => jsonResponse(200, {
    ok: true,
    data: { processed: 2, results: [{ id: 'n1', status: 'sent' }, { id: 'n2', status: 'failed' }] },
  }));
  await assert.rejects(() => processQueue({ ...ENV }), /n2/);
});

test('heartbeat refuses to run without configuration', async () => {
  stubFetch(async () => { throw new Error('fetch must not be called'); });
  await assert.rejects(() => runHeartbeat({}), /is not configured/);
  await assert.rejects(
    () => runHeartbeat({ EMMIWOOD_NOTIFICATION_URL: ENV.EMMIWOOD_NOTIFICATION_URL }),
    /is not configured/,
  );
});
