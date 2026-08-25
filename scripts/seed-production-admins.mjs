#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildAdminSeedSql,
  maskedAdminRoster,
  productionAdminRosterFromEnv,
  seedContractFingerprint,
  validatePreSeedRoster,
} from './production-admin-seed-lib.mjs';
import { validateAdminRoster } from './release-preflight-lib.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function runWrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function queryRoster(database, environment) {
  const output = runWrangler(['d1', 'execute', database, '--remote', '--env', environment, '--command', 'SELECT id,email,role,active,phone FROM emmiwood_admins ORDER BY id;', '--json']);
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed[0]?.success !== true) throw new Error('production admin roster query failed');
  return parsed[0].results || [];
}

const roster = productionAdminRosterFromEnv(process.env);
const sql = buildAdminSeedSql(roster);
const fingerprint = seedContractFingerprint(roster);
const execute = process.argv.includes('--execute');

if (!execute) {
  console.log('admin_seed=DRY_RUN validation=PASS external_mutation=false');
  console.log(`roster_contract_sha256=${fingerprint}`);
  console.log(`roster=${JSON.stringify(maskedAdminRoster(roster))}`);
  process.exit(0);
}

if (argument('--confirm') !== 'PRODUCTION-ADMIN-SEED') {
  console.error('admin_seed=REFUSED reason=missing exact --confirm PRODUCTION-ADMIN-SEED');
  process.exit(2);
}

const database = argument('--database') || 'emmiwood-db';
const environment = argument('--env') || 'production';
validatePreSeedRoster(queryRoster(database, environment));

const directory = mkdtempSync(join(tmpdir(), 'emmiwood-admin-seed-'));
const sqlPath = join(directory, 'seed.sql');
chmodSync(directory, 0o700);
try {
  writeFileSync(sqlPath, sql, { encoding: 'utf8', mode: 0o600 });
  runWrangler(['d1', 'execute', database, '--remote', '--env', environment, '--file', sqlPath, '--json', '--yes']);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

const verified = queryRoster(database, environment);
const errors = validateAdminRoster(verified);
if (errors.length) throw new Error(`production admin seed verification failed: ${errors.join('; ')}`);
console.log('admin_seed=PASS external_mutation=true verification=PASS');
console.log(`roster_contract_sha256=${fingerprint}`);
console.log(`roster=${JSON.stringify(maskedAdminRoster(verified))}`);
