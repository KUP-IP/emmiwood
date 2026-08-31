import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LOCAL_DEV_VAR_DEFAULTS, renderDevVars, writeDevVars } from './write-dev-vars-from-env.mjs';

test('renderDevVars applies local defaults and never invents Twilio values', () => {
  const body = renderDevVars({});
  assert.match(body, /ENVIRONMENT=preview/);
  assert.match(body, /EMMIWOOD_PUBLIC_ORIGIN=http:\/\/localhost:8788/);
  assert.doesNotMatch(body, /TWILIO_/);
  assert.equal(body.includes(LOCAL_DEV_VAR_DEFAULTS.EMMIWOOD_NOTIFICATIONS_ENABLED), true);
});

test('renderDevVars prefers process env over local defaults and omits empty secrets', () => {
  const body = renderDevVars({
    ENVIRONMENT: 'production',
    EMMIWOOD_PUBLIC_ORIGIN: 'https://emmiwood.com',
    EMMIWOOD_NOTIFICATION_SECRET: 'from-cursor',
    TWILIO_AUTH_TOKEN: '',
  });
  assert.match(body, /^ENVIRONMENT=production$/m);
  assert.match(body, /^EMMIWOOD_PUBLIC_ORIGIN=https:\/\/emmiwood.com$/m);
  assert.match(body, /^EMMIWOOD_NOTIFICATION_SECRET=from-cursor$/m);
  assert.doesNotMatch(body, /TWILIO_AUTH_TOKEN/);
});

test('writeDevVars writes a 0600 file without logging values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'emmiwood-dev-vars-'));
  const dest = join(dir, '.dev.vars');
  const result = writeDevVars({ EMMIWOOD_NOTIFICATION_SECRET: 'secret-value', EMMIWOOD_DEV_VARS_PATH: dest }, dest);
  assert.equal(result.dest, dest);
  const written = await readFile(dest, 'utf8');
  assert.match(written, /EMMIWOOD_NOTIFICATION_SECRET=secret-value/);
  assert.match(written, /ENVIRONMENT=preview/);
});
