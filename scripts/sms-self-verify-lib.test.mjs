import test from 'node:test';
import assert from 'node:assert/strict';

import { notificationSecret, SuiteError } from './sms-self-verify-lib.mjs';

test('notificationSecret prefers env and does not require Keychain', () => {
  const previous = process.env.EMMIWOOD_NOTIFICATION_SECRET;
  process.env.EMMIWOOD_NOTIFICATION_SECRET = 'from-env-only';
  try {
    assert.equal(notificationSecret(), 'from-env-only');
  } finally {
    if (previous == null) delete process.env.EMMIWOOD_NOTIFICATION_SECRET;
    else process.env.EMMIWOOD_NOTIFICATION_SECRET = previous;
  }
});

test('notificationSecret fails closed without env on non-darwin hosts', {
  skip: process.platform === 'darwin' ? 'darwin still has a Keychain fallback' : false,
}, () => {
  const previous = process.env.EMMIWOOD_NOTIFICATION_SECRET;
  delete process.env.EMMIWOOD_NOTIFICATION_SECRET;
  try {
    assert.throws(() => notificationSecret(), SuiteError);
  } finally {
    if (previous != null) process.env.EMMIWOOD_NOTIFICATION_SECRET = previous;
  }
});
