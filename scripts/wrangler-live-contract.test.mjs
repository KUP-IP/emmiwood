import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const config = readFileSync(resolve(root, 'wrangler.toml'), 'utf8');

function section(name) {
  const marker = name === 'vars' ? /^\[vars\]$/m : new RegExp(`^\\[${name.replaceAll('.', '\\.')}\\]$`, 'm');
  const start = config.search(marker);
  assert.ok(start >= 0, `missing [${name}]`);
  const rest = config.slice(start);
  const next = rest.slice(1).search(/^\[/m);
  return next >= 0 ? rest.slice(0, next + 1) : rest;
}

function varsFrom(block) {
  const values = {};
  for (const match of block.matchAll(/^([A-Z0-9_]+)\s*=\s*"([^"]*)"/gm)) {
    values[match[1]] = match[2];
  }
  return values;
}

test('wrangler.toml top-level and production vars match the live 2026-08-31 Pages snapshot', () => {
  const expected = {
    ENVIRONMENT: 'production',
    EMMIWOOD_PUBLIC_ORIGIN: 'https://emmiwood.com',
    EMMIWOOD_BOOKING_WRITES_ENABLED: 'true',
    EMMIWOOD_NOTIFICATIONS_ENABLED: 'true',
    EMMIWOOD_SHOP_ADMIN_SMS_FANOUT: 'false',
  };
  assert.deepEqual(varsFrom(section('vars')), expected);
  assert.deepEqual(varsFrom(section('env.production.vars')), expected);
  assert.match(config, /database_name\s*=\s*"emmiwood-db"/);
  assert.match(config, /database_id\s*=\s*"a79f099e-396f-4466-801c-2458a0c2b3e2"/);
  assert.doesNotMatch(section('vars'), /localhost/);
  assert.doesNotMatch(section('env.production.vars'), /localhost/);
});

test('wrangler.toml preview env stays isolated on the preview D1 and origin', () => {
  const preview = varsFrom(section('env.preview.vars'));
  assert.equal(preview.ENVIRONMENT, 'preview');
  assert.equal(preview.EMMIWOOD_PUBLIC_ORIGIN, 'https://emmiwood-barbers-preview.pages.dev');
  assert.equal(preview.EMMIWOOD_BOOKING_WRITES_ENABLED, 'true');
  assert.equal(preview.EMMIWOOD_NOTIFICATIONS_ENABLED, 'false');
  assert.equal(preview.EMMIWOOD_SHOP_ADMIN_SMS_FANOUT, 'false');
  assert.match(config, /database_name\s*=\s*"emmiwood-standalone-preview-db"/);
  assert.match(config, /database_id\s*=\s*"b4a10012-e0c8-40f0-b203-31474393fb2a"/);
});
