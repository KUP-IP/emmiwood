#!/usr/bin/env node
/**
 * Materialize gitignored `.dev.vars` from process env (Cursor Runtime Secrets / CI).
 * Never logs values. Local defaults fill only missing non-secret flags.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEV_VARS_NAMES = Object.freeze([
  'ENVIRONMENT',
  'EMMIWOOD_PUBLIC_ORIGIN',
  'EMMIWOOD_BOOKING_WRITES_ENABLED',
  'EMMIWOOD_NOTIFICATIONS_ENABLED',
  'EMMIWOOD_NOTIFICATION_SECRET',
  'EMMIWOOD_RELEASE_SHA',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'VITE_GOOGLE_MAPS_API_KEY',
  'VITE_EMMIWOOD_PUBLIC_ORIGIN',
]);

export const LOCAL_DEV_VAR_DEFAULTS = Object.freeze({
  ENVIRONMENT: 'preview',
  EMMIWOOD_PUBLIC_ORIGIN: 'http://localhost:8788',
  EMMIWOOD_BOOKING_WRITES_ENABLED: 'true',
  EMMIWOOD_NOTIFICATIONS_ENABLED: 'false',
});

export function renderDevVars(env = process.env) {
  const seen = new Set();
  const lines = [];
  for (const name of DEV_VARS_NAMES) {
    const value = env[name];
    if (value == null || String(value) === '') continue;
    lines.push(`${name}=${String(value)}`);
    seen.add(name);
  }
  for (const [name, value] of Object.entries(LOCAL_DEV_VAR_DEFAULTS)) {
    if (seen.has(name)) continue;
    lines.push(`${name}=${value}`);
  }
  return `${lines.join('\n')}\n`;
}

export function writeDevVars(env = process.env, dest = resolve(env.EMMIWOOD_DEV_VARS_PATH || '.dev.vars')) {
  const body = renderDevVars(env);
  writeFileSync(dest, body, { mode: 0o600 });
  const keys = body.trim() ? body.trim().split('\n').length : 0;
  return { dest, keys };
}

const invokedDirectly = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  const result = writeDevVars();
  console.log(`Wrote ${result.keys} keys to ${result.dest} (values not logged)`);
}
