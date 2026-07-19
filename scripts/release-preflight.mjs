#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import {
  EXPECTED_PRODUCTION_RESOURCE,
  NOTIFICATION_WORKFLOW_PATH,
  parseActionVariables,
  parseNameColumn,
  parsePendingMigrations,
  parseSecretNames,
  validateReleaseState,
} from './release-preflight-lib.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function migrationNames(cwd) {
  const tracked = run('git', ['ls-tree', '-r', '--name-only', 'HEAD', 'migrations'], cwd).split(/\r?\n/);
  return tracked
    .map((entry) => entry.split('/').pop())
    .filter((name) => /^[0-9]{4}_[A-Za-z0-9._-]+\.sql$/.test(name || ''));
}

function readResource(cwd) {
  const config = readFileSync(resolve(cwd, 'wrangler.toml'), 'utf8');
  const databaseName = config.match(/database_name\s*=\s*"([^"]+)"/)?.[1];
  const databaseId = config.match(/database_id\s*=\s*"([^"]+)"/)?.[1];
  return { pagesProject: EXPECTED_PRODUCTION_RESOURCE.pagesProject, databaseName, databaseId };
}

function gatherLiveState(cwd, expectedSha, schedulerState) {
  const migrationOutput = run('npx', ['wrangler', 'd1', 'migrations', 'list', 'emmiwood-db', '--remote', '--env', 'production'], cwd);
  const secretOutput = run('npx', ['wrangler', 'pages', 'secret', 'list', '--project-name', 'emmiwood'], cwd);
  const actionSecretOutput = run('gh', ['secret', 'list', '--repo', 'KUP-IP/emmiwood', '--app', 'actions'], cwd);
  const actionVariableOutput = run('gh', ['variable', 'list', '--repo', 'KUP-IP/emmiwood'], cwd);
  return {
    expectedSha,
    schedulerState,
    head: run('git', ['rev-parse', 'HEAD'], cwd).trim(),
    upstreamHead: run('git', ['rev-parse', '@{upstream}'], cwd).trim(),
    statusEntries: run('git', ['status', '--porcelain', '--untracked-files=all'], cwd).split(/\r?\n/).filter(Boolean),
    committedMigrations: migrationNames(cwd),
    pendingMigrations: parsePendingMigrations(migrationOutput),
    secretNames: parseSecretNames(secretOutput),
    actionSecretNames: parseNameColumn(actionSecretOutput),
    actionVariables: parseActionVariables(actionVariableOutput),
    notificationWorkflow: readFileSync(resolve(cwd, NOTIFICATION_WORKFLOW_PATH), 'utf8'),
    resource: readResource(cwd),
  };
}

const expectedSha = argument('--expected-sha');
const schedulerState = argument('--scheduler-state') || 'configured';
const root = resolve(argument('--root') || process.cwd());
if (!expectedSha) {
  console.error('preflight=FAIL reason=missing --expected-sha');
  process.exit(2);
}

let state;
const fixture = process.env.EMMIWOOD_PREFLIGHT_TEST_FIXTURE;
if (fixture) {
  if (process.env.NODE_ENV !== 'test') {
    console.error('preflight=FAIL reason=test fixture refused outside NODE_ENV=test');
    process.exit(2);
  }
  state = { ...JSON.parse(readFileSync(fixture, 'utf8')), expectedSha, schedulerState };
} else {
  state = gatherLiveState(root, expectedSha, schedulerState);
}

const result = validateReleaseState(state);
if (!result.ok) {
  console.error('preflight=FAIL');
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('preflight=PASS production_touched=false external_delivery=false');
console.log(`approved_sha=${result.approvedSha}`);
console.log(`migrations=${result.migrations.join(',')}`);
console.log(`pages_secrets_verified_by_name=${result.secretsVerifiedByName.join(',')}`);
console.log(`actions_secrets_verified_by_name=${result.actionSecretsVerifiedByName.join(',')}`);
console.log(`scheduler=${result.scheduler.variable}:${result.scheduler.value} required_state=${result.scheduler.requiredState}`);
console.log(`resource=${state.resource.pagesProject}/${state.resource.databaseName}/${state.resource.databaseId}`);
