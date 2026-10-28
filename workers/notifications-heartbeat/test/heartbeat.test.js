import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  isCloudflareChallenge,
  processQueue,
  probeReadiness,
  runHeartbeat,
  WORKER_USER_AGENT,
} from '../src/index.js';

const READY_BODY = {
  ok: true,
  data: {
    environment: 'production',
    ready: true,
    processor: { ready: true },
    sms: { ready: true, provider: 'twilio', testMode: false, testAllowlistCount: 0 },
    email: { ready: true, provider: 'resend', testMode: false, testAllowlistCount: 0 },
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

function jsonResponse(status, body, headers = { 'content-type': 'application/json' }) {
  const text = JSON.stringify(body);
  return {
    status,
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] || headers[name] || null;
      },
    },
    text: async () => text,
    json: async () => body,
  };
}

function textResponse(status, text, contentType = 'text/html') {
  return {
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type' ? contentType : null;
      },
    },
    text: async () => text,
  };
}

const ENV = {
  EMMIWOOD_NOTIFICATION_URL: 'https://example.test/api/emmiwood/internal/notifications',
  EMMIWOOD_NOTIFICATION_SECRET: 'test-secret',
};

test('wrangler.toml ships PROCESS_QUEUE false, test-mode off, and a 5-minute cron', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /PROCESS_QUEUE\s*=\s*"false"/);
  assert.match(toml, /EXPECT_TEST_MODE\s*=\s*"false"/);
  assert.match(toml, /crons\s*=\s*\["\*\/5 \* \* \* \*"\]/);
  assert.match(toml, /workers_dev\s*=\s*false/);
  assert.doesNotMatch(toml, /PROCESS_QUEUE\s*=\s*"true"/);
  assert.doesNotMatch(toml, /async fetch/);
});

test('worker source has no public fetch handler', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/index.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(source, /async fetch\s*\(/);
  assert.match(source, /await runHeartbeat\(env\)/);
});

test('probe succeeds on a ready production response and sends Bearer plus User-Agent', async () => {
  const calls = stubFetch(async () => jsonResponse(200, READY_BODY));
  const data = await probeReadiness({ ...ENV });
  assert.equal(data.ready, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-secret');
  assert.equal(calls[0].init.headers['User-Agent'], WORKER_USER_AGENT);
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

test('probe fails when EXPECT_TEST_MODE does not match sms.testMode', async () => {
  stubFetch(async () => jsonResponse(200, READY_BODY));
  await assert.rejects(
    () => probeReadiness({ ...ENV, EXPECT_TEST_MODE: 'true' }),
    /test mode mismatch/,
  );
});

test('probe accepts a matching production test-mode allowlist', async () => {
  stubFetch(async () => jsonResponse(200, {
    ok: true,
    data: {
      ...READY_BODY.data,
      sms: { ...READY_BODY.data.sms, testMode: true, testAllowlistCount: 1 },
    },
  }));
  const data = await probeReadiness({ ...ENV, EXPECT_TEST_MODE: 'true' });
  assert.equal(data.sms.testMode, true);
});

test('probe logs a Cloudflare HTML challenge and throws', async () => {
  stubFetch(async () => textResponse(403, '<html><title>Just a moment...</title></html>'));
  await assert.rejects(() => probeReadiness({ ...ENV }), /cf_challenge=true/);
  assert.equal(isCloudflareChallenge(403, 'text/html', '<html>Just a moment</html>'), true);
  assert.equal(isCloudflareChallenge(200, 'application/json', '{}'), false);
});

test('probe surfaces TimeoutError and TypeError names from fetch failures', async () => {
  stubFetch(async () => {
    const error = new TypeError('fetch failed');
    throw error;
  });
  await assert.rejects(() => probeReadiness({ ...ENV }), /fetch failed/);
});

test('heartbeat skips queue processing unless PROCESS_QUEUE is "true"', async () => {
  const calls = stubFetch(async () => jsonResponse(200, READY_BODY));
  await runHeartbeat({ ...ENV });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'GET');
});

test('heartbeat processes the queue after a good probe when enabled', async () => {
  const calls = stubFetch(async (url, init) => (init.method === 'POST'
    ? jsonResponse(200, {
      ok: true,
      data: {
        processed: 3,
        results: [
          { id: 'n1', status: 'sent', provider: 'twilio', attempt: 1, providerMessageId: 'SM1' },
          { id: 'n2', status: 'expired', attempt: 1 },
          { id: 'n3', status: 'skipped_test_mode', attempt: 1 },
        ],
      },
    })
    : jsonResponse(200, READY_BODY)));
  await runHeartbeat({ ...ENV, PROCESS_QUEUE: 'true' });
  assert.deepEqual(calls.map((call) => call.init.method), ['GET', 'POST']);
  assert.equal(calls[1].init.headers['User-Agent'], WORKER_USER_AGENT);
});

test('processing throws when any result is retrying or failed', async () => {
  stubFetch(async () => jsonResponse(200, {
    ok: true,
    data: { processed: 2, results: [{ id: 'n1', status: 'sent' }, { id: 'n2', status: 'failed' }] },
  }));
  await assert.rejects(() => processQueue({ ...ENV }), /n2/);
});

test('processing accepts expired and skipped test-mode results', async () => {
  stubFetch(async () => jsonResponse(200, {
    ok: true,
    data: {
      processed: 2,
      results: [
        { id: 'n1', status: 'expired' },
        { id: 'n2', status: 'skipped_test_mode' },
      ],
    },
  }));
  const data = await processQueue({ ...ENV });
  assert.equal(data.processed, 2);
});

test('heartbeat refuses to run without configuration', async () => {
  stubFetch(async () => { throw new Error('fetch must not be called'); });
  await assert.rejects(() => runHeartbeat({}), /is not configured/);
  await assert.rejects(
    () => runHeartbeat({ EMMIWOOD_NOTIFICATION_URL: ENV.EMMIWOOD_NOTIFICATION_URL }),
    /is not configured/,
  );
});
