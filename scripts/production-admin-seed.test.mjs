import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import {
  buildAdminSeedSql,
  maskedAdminRoster,
  productionAdminRosterFromEnv,
  seedContractFingerprint,
  validatePreSeedRoster,
} from './production-admin-seed-lib.mjs';
import { setupEmmiwoodTestD1 } from '../functions/lib/emmiwood-test-d1.js';
import { validateAdminRoster } from './release-preflight-lib.mjs';

const VALID_ENV = {
  EMMIWOOD_OWNER_EMAIL: 'owner@example.com',
  EMMIWOOD_OWNER_PHONE: '+16055550101',
  EMMIWOOD_RECOVERY_EMAIL: 'recovery@example.com',
  EMMIWOOD_RECOVERY_PHONE: '+16055550102',
  EMMIWOOD_SUPPORT_EMAIL: 'support@example.com',
  EMMIWOOD_SUPPORT_PHONE: '+16055550103',
};

test('production admin seed builds the exact role-isolated roster', () => {
  const roster = productionAdminRosterFromEnv(VALID_ENV);
  assert.deepEqual(roster.map(({ id, role }) => ({ id, role })), [
    { id: 'admin-isaiah', role: 'owner' },
    { id: 'admin-recovery', role: 'manager' },
    { id: 'admin-kup-support', role: 'kup_support' },
  ]);
  const sql = buildAdminSeedSql(roster);
  assert.match(sql, /ON CONFLICT\(id\) DO UPDATE/);
  assert.doesNotMatch(sql, /\bBEGIN\b|\bCOMMIT\b/);
  const fingerprint = seedContractFingerprint(roster);
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(fingerprint, seedContractFingerprint(roster.map((admin) => ({ ...admin, email: 'changed@example.com', phone: '+19999999999' }))));
});

test('production admin seed SQL applies to the migrated schema and verifies exactly', () => {
  const db = setupEmmiwoodTestD1();
  try {
    db.exec(buildAdminSeedSql(productionAdminRosterFromEnv(VALID_ENV)));
    const roster = db.query('SELECT id,email,role,active,phone FROM emmiwood_admins ORDER BY id');
    assert.deepEqual(validateAdminRoster(roster), []);
    assert.deepEqual(roster.map(({ id, role }) => ({ id, role })), [
      { id: 'admin-isaiah', role: 'owner' },
      { id: 'admin-kup-support', role: 'kup_support' },
      { id: 'admin-recovery', role: 'manager' },
    ]);
  } finally {
    db.close();
  }
});

test('production admin seed rejects missing, malformed, placeholder, and duplicate inputs', () => {
  assert.throws(() => productionAdminRosterFromEnv({}), /EMMIWOOD_OWNER_EMAIL/);
  assert.throws(() => productionAdminRosterFromEnv({ ...VALID_ENV, EMMIWOOD_OWNER_EMAIL: 'invalid' }), /valid email/);
  assert.throws(() => productionAdminRosterFromEnv({ ...VALID_ENV, EMMIWOOD_OWNER_PHONE: '6055550101' }), /E\.164/);
  assert.throws(() => productionAdminRosterFromEnv({ ...VALID_ENV, EMMIWOOD_OWNER_PHONE: '+16055550199' }), /placeholder/);
  assert.throws(() => productionAdminRosterFromEnv({ ...VALID_ENV, EMMIWOOD_RECOVERY_PHONE: VALID_ENV.EMMIWOOD_OWNER_PHONE }), /phones must be unique/);
});

test('production admin seed precondition accepts only the untouched migration roster', () => {
  assert.equal(validatePreSeedRoster([{ id: 'admin-isaiah', role: 'owner', active: 1, phone: '+16055550199' }]), true);
  assert.throws(() => validatePreSeedRoster([]), /exactly one/);
  assert.throws(() => validatePreSeedRoster([{ id: 'admin-isaiah', role: 'owner', active: 1, phone: '+16055550101' }]), /placeholder/);
});

test('dry run validates without exposing full emails or phones and performs no external mutation', () => {
  const script = new URL('./seed-production-admins.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, ...VALID_ENV } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /admin_seed=DRY_RUN/);
  assert.match(result.stdout, /external_mutation=false/);
  assert.doesNotMatch(result.stdout, /owner@example\.com/);
  assert.doesNotMatch(result.stdout, /\+16055550101/);
  assert.match(result.stdout, /\*\*\*0101/);
  assert.deepEqual(maskedAdminRoster(productionAdminRosterFromEnv(VALID_ENV))[0], {
    id: 'admin-isaiah', role: 'owner', email: 'o***@example.com', phone: '***0101',
  });
});

test('execute mode refuses before any provider call without the exact confirmation', () => {
  const script = new URL('./seed-production-admins.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [script, '--execute'], { encoding: 'utf8', env: { ...process.env, ...VALID_ENV } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /REFUSED/);
});
