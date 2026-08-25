#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import {
  EXPECTED_PRODUCTION_RESOURCE,
  NOTIFICATION_WORKFLOW_PATH,
  PREFLIGHT_STAGES,
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

function parsedJson(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${label} did not return valid JSON`);
  }
}

function d1ResultSets(output) {
  const parsed = parsedJson(output, 'D1 query');
  if (!Array.isArray(parsed) || parsed.some((entry) => entry?.success !== true)) throw new Error('D1 query did not succeed');
  return parsed.map((entry) => entry.results || []);
}

function pagesState(cwd) {
  const projects = parsedJson(run('npx', ['wrangler', 'pages', 'project', 'list', '--json'], cwd), 'Pages project list');
  const project = projects.find((entry) => entry?.['Project Name'] === EXPECTED_PRODUCTION_RESOURCE.pagesProject);
  if (!project) throw new Error(`Pages project ${EXPECTED_PRODUCTION_RESOURCE.pagesProject} does not exist`);
  const deployments = parsedJson(run('npx', ['wrangler', 'pages', 'deployment', 'list', '--project-name', EXPECTED_PRODUCTION_RESOURCE.pagesProject, '--environment', 'production', '--json'], cwd), 'Pages deployment list');
  const latest = deployments[0];
  if (!latest) throw new Error(`Pages project ${EXPECTED_PRODUCTION_RESOURCE.pagesProject} has no production deployment`);
  return {
    domains: String(project['Project Domains'] || '').split(',').map((value) => value.trim()).filter(Boolean),
    pagesProductionBranch: String(latest.Branch || ''),
    deploymentSha: String(latest.Source || ''),
  };
}

async function runtimeState(readinessUrl, secret) {
  if (!readinessUrl) throw new Error('deploy and cutover preflight require --readiness-url');
  if (!secret) throw new Error('deploy and cutover preflight require EMMIWOOD_PREFLIGHT_NOTIFICATION_SECRET');
  const response = await fetch(readinessUrl, {
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  const data = body?.data || {};
  const configuration = data.configuration || {};
  return {
    environment: data.environment,
    publicOrigin: configuration.publicOrigin?.value,
    bookingWrites: configuration.bookingWrites,
    releaseSha: configuration.release?.value,
  };
}

function readBackupReceipt(path) {
  if (!path || !existsSync(path)) return { exists: false };
  const receipt = parsedJson(readFileSync(path, 'utf8'), 'backup receipt');
  return { exists: true, ...receipt };
}

async function gatherLiveState(cwd, expectedSha, schedulerState, stage, options = {}) {
  const migrationOutput = run('npx', ['wrangler', 'd1', 'migrations', 'list', 'emmiwood-db', '--remote', '--env', 'production'], cwd);
  const secretOutput = run('npx', ['wrangler', 'pages', 'secret', 'list', '--project-name', 'emmiwood'], cwd);
  const actionSecretOutput = run('gh', ['secret', 'list', '--repo', 'KUP-IP/emmiwood', '--app', 'actions'], cwd);
  const actionVariableOutput = run('gh', ['variable', 'list', '--repo', 'KUP-IP/emmiwood'], cwd);
  const state = {
    stage,
    expectedSha,
    schedulerState,
    workflowState: run('gh', ['api', 'repos/KUP-IP/emmiwood/actions/workflows/notifications.yml', '--jq', '.state'], cwd).trim(),
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
  if (stage === 'deploy' || stage === 'cutover') {
    const pages = pagesState(cwd);
    const queryOutput = run('npx', ['wrangler', 'd1', 'execute', 'emmiwood-db', '--remote', '--env', 'production', '--command', "SELECT id,email,role,active,phone FROM emmiwood_admins ORDER BY id; SELECT COUNT(*) AS queued_count FROM emmiwood_notification_outbox WHERE status='queued';", '--json'], cwd);
    const [adminRoster, queueRows] = d1ResultSets(queryOutput);
    Object.assign(state, pages, {
      expectedOrigin: options.expectedOrigin,
      runtime: await runtimeState(options.readinessUrl, process.env.EMMIWOOD_PREFLIGHT_NOTIFICATION_SECRET),
      adminRoster,
      outboxQueuedCount: queueRows[0]?.queued_count,
    });
  }
  if (stage === 'cutover') state.backupReceipt = readBackupReceipt(options.backupReceipt);
  return state;
}

const expectedSha = argument('--expected-sha');
const schedulerState = argument('--scheduler-state') || 'configured';
const stage = argument('--stage') || 'provision';
const root = resolve(argument('--root') || process.cwd());
if (!expectedSha) {
  console.error('preflight=FAIL reason=missing --expected-sha');
  process.exit(2);
}
if (!PREFLIGHT_STAGES.includes(stage)) {
  console.error(`preflight=FAIL reason=invalid --stage ${stage}`);
  process.exit(2);
}

let state;
const fixture = process.env.EMMIWOOD_PREFLIGHT_TEST_FIXTURE;
if (fixture) {
  if (process.env.NODE_ENV !== 'test') {
    console.error('preflight=FAIL reason=test fixture refused outside NODE_ENV=test');
    process.exit(2);
  }
  state = { ...JSON.parse(readFileSync(fixture, 'utf8')), expectedSha, schedulerState, stage };
} else {
  const expectedOrigin = argument('--expected-origin') || (stage === 'cutover' ? 'https://emmiwood.com' : 'https://emmiwood.pages.dev');
  const readinessUrl = argument('--readiness-url') || `${expectedOrigin}/api/emmiwood/internal/notifications`;
  state = await gatherLiveState(root, expectedSha, schedulerState, stage, {
    expectedOrigin,
    readinessUrl,
    backupReceipt: argument('--backup-receipt'),
  });
}

const result = validateReleaseState(state);
if (!result.ok) {
  console.error('preflight=FAIL');
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('preflight=PASS production_touched=false external_delivery=false');
console.log(`stage=${result.stage}`);
console.log(`approved_sha=${result.approvedSha}`);
console.log(`migrations=${result.migrations.join(',')}`);
console.log(`pages_secrets_verified_by_name=${result.secretsVerifiedByName.join(',')}`);
console.log(`actions_secrets_verified_by_name=${result.actionSecretsVerifiedByName.join(',')}`);
console.log(`scheduler=${result.scheduler.variable}:${result.scheduler.value} required_state=${result.scheduler.requiredState}`);
console.log(`resource=${state.resource.pagesProject}/${state.resource.databaseName}/${state.resource.databaseId}`);
