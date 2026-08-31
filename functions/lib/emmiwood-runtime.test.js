import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingWriteState, publicOriginState, releaseShaState, runtimeReadiness } from './emmiwood-runtime.js';

const SHA = 'a'.repeat(40);
const PAGES_SHA = 'b'.repeat(40);

test('release SHA accepts EMMIWOOD_RELEASE_SHA or CF_PAGES_COMMIT_SHA', () => {
  assert.deepEqual(releaseShaState({}), { configured: false, valid: false, value: '' });
  assert.deepEqual(releaseShaState({ EMMIWOOD_RELEASE_SHA: SHA }), {
    configured: true,
    valid: true,
    value: SHA,
  });
  assert.deepEqual(releaseShaState({ CF_PAGES_COMMIT_SHA: PAGES_SHA }), {
    configured: true,
    valid: true,
    value: PAGES_SHA,
  });
  assert.equal(releaseShaState({ EMMIWOOD_RELEASE_SHA: SHA, CF_PAGES_COMMIT_SHA: PAGES_SHA }).value, SHA);
  assert.equal(releaseShaState({ EMMIWOOD_RELEASE_SHA: 'short' }).valid, false);
  assert.equal(releaseShaState({ CF_PAGES_COMMIT_SHA: 'not-a-sha' }).valid, false);
});

test('production readiness accepts Pages commit SHA when the explicit release var is absent', () => {
  const env = {
    ENVIRONMENT: 'production',
    EMMIWOOD_PUBLIC_ORIGIN: 'https://emmiwood.com',
    EMMIWOOD_BOOKING_WRITES_ENABLED: 'true',
    CF_PAGES_COMMIT_SHA: SHA,
  };
  const ready = runtimeReadiness(env);
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.release, { configured: true, valid: true, value: SHA });
  assert.equal(bookingWriteState(env).enabled, true);
  assert.equal(publicOriginState(env).value, 'https://emmiwood.com');
});
