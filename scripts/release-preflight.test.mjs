import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  EXPECTED_PRODUCTION_RESOURCE,
  NOTIFICATION_SCHEDULER_VARIABLE,
  REQUIRED_ACTION_SECRETS,
  REQUIRED_EMMIWOOD_MIGRATIONS,
  REQUIRED_PRODUCTION_SECRETS,
  fetchRuntimeReadiness,
  fetchProductionDeployment,
  parseActionVariables,
  parseNameColumn,
  parsePendingMigrations,
  parseSecretNames,
  validateAdminRoster,
  validateNotificationWorkflow,
  validateReleaseState,
  validateReadinessTarget,
} from './release-preflight-lib.mjs';

const SHA = 'a'.repeat(40);
const VALID_WORKFLOW = `
name: Emmiwood notification heartbeat
on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch:
    inputs:
      process:
        type: boolean
      notification_id:
        type: string
concurrency:
  cancel-in-progress: false
jobs:
  heartbeat:
    env:
      EMMIWOOD_NOTIFICATION_URL: \${{ vars.EMMIWOOD_NOTIFICATION_URL }}
      EMMIWOOD_NOTIFICATION_SECRET: \${{ secrets.EMMIWOOD_NOTIFICATION_SECRET }}
    steps:
      - name: Probe production notification readiness
        run: curl "$EMMIWOOD_NOTIFICATION_URL"
      - name: Process scheduled notification queue
        if: github.event_name == 'schedule' && vars.EMMIWOOD_NOTIFICATIONS_ENABLED == 'true'
        run: curl -X POST "$EMMIWOOD_NOTIFICATION_URL"
      - name: Process one approved synthetic notification
        if: github.event_name == 'workflow_dispatch' && inputs.process == true
        run: |
          encoded_id="$(jq -rn --arg value "$NOTIFICATION_ID" '$value|@uri')"
          curl -X POST "$EMMIWOOD_NOTIFICATION_URL?id=$encoded_id"
          jq -e '.data.processed == 1 and (.data.results[0].providerMessageId | length > 0)' response.json
`;

const READY = {
  stage: 'provision',
  expectedSha: SHA,
  schedulerState: 'configured',
  head: SHA,
  upstreamHead: SHA,
  statusEntries: [],
  committedMigrations: [...REQUIRED_EMMIWOOD_MIGRATIONS],
  pendingMigrations: [...REQUIRED_EMMIWOOD_MIGRATIONS],
  secretNames: [...REQUIRED_PRODUCTION_SECRETS],
  actionSecretNames: [...REQUIRED_ACTION_SECRETS],
  actionVariables: { [NOTIFICATION_SCHEDULER_VARIABLE]: 'false' },
  notificationWorkflow: VALID_WORKFLOW,
  resource: { ...EXPECTED_PRODUCTION_RESOURCE, databaseId: '11111111-1111-4111-8111-111111111111' },
};

const ADMIN_ROSTER = [
  { id: 'admin-isaiah', email: 'owner@example.com', role: 'owner', active: 1, phone: '+16055550101' },
  { id: 'admin-barro', email: 'barro@example.com', role: 'manager', active: 1, phone: '+16055550102' },
];

const DEPLOY_READY = {
  ...READY,
  stage: 'deploy',
  schedulerState: 'disabled',
  workflowState: 'disabled_manually',
  pendingMigrations: [],
  expectedOrigin: 'https://emmiwood.pages.dev',
  runtime: {
    environment: 'production',
    publicOrigin: 'https://emmiwood.pages.dev',
    releaseSha: SHA,
    bookingWrites: { configured: true, valid: true, enabled: false },
  },
  pagesProductionBranch: 'main',
  deploymentSha: SHA,
  adminRoster: ADMIN_ROSTER,
  outboxQueuedCount: 0,
};

const CUTOVER_READY = {
  ...DEPLOY_READY,
  stage: 'cutover',
  expectedOrigin: 'https://www.emmiwood.com',
  runtime: { ...DEPLOY_READY.runtime, publicOrigin: 'https://www.emmiwood.com' },
  domains: ['emmiwood.pages.dev', 'emmiwood.com', 'www.emmiwood.com'],
  backupReceipt: {
    exists: true,
    approvedSha: SHA,
    previewSha256: 'b'.repeat(64),
    productionSha256: 'c'.repeat(64),
  },
};

function expectFailure(patch, pattern) {
  const result = validateReleaseState({ ...READY, ...patch });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), pattern);
}

test('parsers retain only migration, secret, and action configuration names', () => {
  assert.deepEqual(parsePendingMigrations('│ 0001_booking.sql │\n│ 0002_launch_copy.sql │'), REQUIRED_EMMIWOOD_MIGRATIONS.slice(0, 2));
  assert.deepEqual(parseSecretNames('  - RESEND_API_KEY: Value Encrypted\n  - EMAIL_FROM: Value Encrypted'), ['RESEND_API_KEY', 'EMAIL_FROM']);
  assert.deepEqual(parseNameColumn('EMMIWOOD_NOTIFICATION_SECRET\tUpdated 2026-07-19\nnot-a-secret'), ['EMMIWOOD_NOTIFICATION_SECRET']);
  assert.deepEqual(parseActionVariables('EMMIWOOD_NOTIFICATIONS_ENABLED\tfalse\t2026-07-19'), { EMMIWOOD_NOTIFICATIONS_ENABLED: 'false' });
});

test('notification workflow contract passes only with heartbeat and gated processing', () => {
  assert.deepEqual(validateNotificationWorkflow(VALID_WORKFLOW), []);
  assert.match(validateNotificationWorkflow(VALID_WORKFLOW.replace("vars.EMMIWOOD_NOTIFICATIONS_ENABLED == 'true'", 'true')).join('\n'), /scheduler variable gate/i);
  assert.match(validateNotificationWorkflow(VALID_WORKFLOW.replace('?id=$encoded_id', '')).join('\n'), /exact-id/i);
  assert.match(validateNotificationWorkflow(VALID_WORKFLOW.replace('curl -X POST "$EMMIWOOD_NOTIFICATION_URL?id=$encoded_id"', 'curl --retry 2 -X POST "$EMMIWOOD_NOTIFICATION_URL?id=$encoded_id"')).join('\n'), /must not retry/i);
});

test('clean exact release state passes with scheduler configured but disabled', () => {
  assert.deepEqual(validateReleaseState(READY).errors, []);
  assert.deepEqual(validateReleaseState({ ...READY, schedulerState: 'disabled' }).errors, []);
});

test('dirty worktree fails closed', () => expectFailure({ statusEntries: [' M docs/emmiwood-release-runbook.md'] }, /dirty/i));
test('candidate SHA mismatch fails closed', () => expectFailure({ head: 'b'.repeat(40) }, /candidate HEAD/i));
test('upstream SHA mismatch fails closed', () => expectFailure({ upstreamHead: 'b'.repeat(40) }, /upstream HEAD/i));
test('migration 0018 fails closed', () => expectFailure({ committedMigrations: [...REQUIRED_EMMIWOOD_MIGRATIONS, '0018_emmiwood_booking_idempotency.sql'] }, /0018 or later/i));
test('different production pending set fails closed', () => expectFailure({ pendingMigrations: REQUIRED_EMMIWOOD_MIGRATIONS.slice(0, 2) }, /pending migrations.*must be exactly/i));
test('missing Twilio binding fails closed', () => expectFailure({ secretNames: REQUIRED_PRODUCTION_SECRETS.filter((name) => name !== 'TWILIO_AUTH_TOKEN') }, /TWILIO_AUTH_TOKEN/i));
test('missing restricted Twilio API key SID fails closed', () => expectFailure({ secretNames: REQUIRED_PRODUCTION_SECRETS.filter((name) => name !== 'TWILIO_API_KEY_SID') }, /TWILIO_API_KEY_SID/i));
test('missing processor Page binding fails closed', () => expectFailure({ secretNames: REQUIRED_PRODUCTION_SECRETS.filter((name) => name !== 'EMMIWOOD_NOTIFICATION_SECRET') }, /EMMIWOOD_NOTIFICATION_SECRET/i));
test('Resend secrets are not required for SMS-only v1 preflight', () => {
  assert.equal(REQUIRED_PRODUCTION_SECRETS.includes('RESEND_API_KEY'), false);
  assert.equal(REQUIRED_PRODUCTION_SECRETS.includes('EMAIL_FROM'), false);
  assert.deepEqual(validateReleaseState(READY).errors, []);
});
test('missing Actions processor secret fails closed', () => expectFailure({ actionSecretNames: [] }, /GitHub Actions secret/i));
test('missing scheduler variable fails closed', () => expectFailure({ actionVariables: {} }, /variable missing/i));
test('malformed scheduler workflow fails closed', () => expectFailure({ notificationWorkflow: 'name: incomplete' }, /workflow missing/i));
test('placeholder D1 binding fails closed', () => expectFailure({ resource: { ...EXPECTED_PRODUCTION_RESOURCE, databaseId: '00000000-0000-0000-0000-000000000000' } }, /databaseId/i));

test('deploy stage requires exact runtime, frozen writes, clean queue, roster, branch, and deployment source', () => {
  assert.deepEqual(validateReleaseState(DEPLOY_READY).errors, []);
  assert.match(validateReleaseState({ ...DEPLOY_READY, runtime: { ...DEPLOY_READY.runtime, environment: 'preview' } }).errors.join('\n'), /runtime environment/i);
  assert.match(validateReleaseState({ ...DEPLOY_READY, runtime: { ...DEPLOY_READY.runtime, publicOrigin: 'https://wrong.example' } }).errors.join('\n'), /public origin/i);
  assert.match(validateReleaseState({ ...DEPLOY_READY, runtime: { ...DEPLOY_READY.runtime, releaseSha: 'b'.repeat(40) } }).errors.join('\n'), /runtime release SHA/i);
  assert.match(validateReleaseState({ ...DEPLOY_READY, runtime: { ...DEPLOY_READY.runtime, bookingWrites: { configured: true, valid: true, enabled: true } } }).errors.join('\n'), /booking writes/i);
  assert.match(validateReleaseState({ ...DEPLOY_READY, pagesProductionBranch: 'review' }).errors.join('\n'), /production branch/i);
  assert.match(validateReleaseState({ ...DEPLOY_READY, deploymentSha: 'bbbbbbb' }).errors.join('\n'), /deployment source/i);
  assert.match(validateReleaseState({ ...DEPLOY_READY, outboxQueuedCount: 1 }).errors.join('\n'), /zero queued/i);
  assert.match(validateReleaseState({ ...DEPLOY_READY, workflowState: 'active' }).errors.join('\n'), /disabled_manually/i);
  assert.match(validateReleaseState({ ...DEPLOY_READY, actionVariables: { ...DEPLOY_READY.actionVariables, EMMIWOOD_NOTIFICATION_URL: 'https://example.test' } }).errors.join('\n'), /remain absent/i);
});

test('deployment provenance rejects abbreviated, malformed, and nonmatching SHAs', () => {
  for (const deploymentSha of [SHA.slice(0, 7), SHA.slice(0, 39), `${SHA}a`, 'g'.repeat(40), 'b'.repeat(40), '']) {
    assert.match(validateReleaseState({ ...DEPLOY_READY, deploymentSha }).errors.join('\n'), /exact 40-character approved SHA/);
  }
  assert.deepEqual(validateReleaseState({ ...DEPLOY_READY, deploymentSha: SHA }).errors, []);
});

test('readiness URLs fail closed before bearer transport for insecure or foreign targets', async () => {
  const approved = 'https://emmiwood.pages.dev/api/emmiwood/internal/notifications';
  let requests = 0;
  const transport = async () => { requests++; throw new Error('transport must not run'); };
  for (const readinessUrl of [
    approved.replace('https:', 'http:'),
    approved.replace('emmiwood.pages.dev', 'foreign.example'),
    approved.replace('https://', 'https://user:password@'),
    `${approved}?id=unexpected`, `${approved}#fragment`,
    'https://emmiwood.pages.dev/other', '/relative',
    'https://www.emmiwood.com/api/emmiwood/internal/notifications',
  ]) {
    await assert.rejects(fetchRuntimeReadiness({ stage: 'deploy', readinessUrl, secret: 'sentinel' }, transport), /readiness URL/);
  }
  await assert.rejects(fetchRuntimeReadiness({ stage: 'deploy', readinessUrl: approved, expectedOrigin: 'https://foreign.example', secret: 'sentinel' }, transport), /approved HTTPS origin/);
  assert.equal(requests, 0);
  assert.equal(validateReadinessTarget({ stage: 'deploy', readinessUrl: approved }), approved);
  assert.equal(validateReadinessTarget({ stage: 'cutover', readinessUrl: 'https://www.emmiwood.com/api/emmiwood/internal/notifications' }), 'https://www.emmiwood.com/api/emmiwood/internal/notifications');
});

test('readiness uses redirect:error and never sends bearer to a redirect destination', async () => {
  const calls = [];
  await assert.rejects(fetchRuntimeReadiness({
    stage: 'deploy', readinessUrl: 'https://emmiwood.pages.dev/api/emmiwood/internal/notifications', secret: 'sentinel',
  }, async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'error');
    throw new TypeError('fetch failed: unexpected redirect');
  }), /unexpected redirect/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://emmiwood.pages.dev/api/emmiwood/internal/notifications');
  assert.equal(calls[0].options.headers.authorization, 'Bearer sentinel');
});

test('readiness transport returns validated runtime evidence and rejects unsuccessful responses', async () => {
  const options = { stage: 'deploy', readinessUrl: 'https://emmiwood.pages.dev/api/emmiwood/internal/notifications', secret: 'sentinel' };
  const data = { environment: 'production', configuration: { publicOrigin: { value: DEPLOY_READY.runtime.publicOrigin }, bookingWrites: DEPLOY_READY.runtime.bookingWrites, release: { value: SHA } } };
  assert.deepEqual(await fetchRuntimeReadiness(options, async () => ({ ok: true, json: async () => ({ ok: true, data }) })), DEPLOY_READY.runtime);
  await assert.rejects(fetchRuntimeReadiness(options, async () => ({ ok: false, status: 503 })), /HTTP 503/);
  await assert.rejects(fetchRuntimeReadiness(options, async () => ({ ok: true, json: async () => ({ ok: false, data }) })), /did not report success/);
});

test('raw deployment metadata establishes full SHA from the exact successful production/main deployment', async () => {
  const options = { accountId: 'a'.repeat(32), apiToken: 'sentinel', deploymentId: '11111111-1111-4111-8111-111111111111' };
  const deployment = { id: options.deploymentId, project_name: 'emmiwood', environment: 'production', latest_stage: { status: 'success' }, deployment_trigger: { metadata: { branch: 'main', commit_hash: SHA } } };
  const project = { name: 'emmiwood', production_branch: 'main' };
  const responseFor = (url, patchedDeployment = deployment) => ({ ok: true, json: async () => ({ success: true, result: url.includes('/deployments/') ? patchedDeployment : project }) });
  const calls = [];
  const transport = async (url, request) => {
    calls.push({ url, request });
    return responseFor(url);
  };
  assert.deepEqual(await fetchProductionDeployment(options, transport), { deploymentSha: SHA, pagesProductionBranch: 'main', deploymentId: options.deploymentId });
  assert.equal(calls[0].url, `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/pages/projects/emmiwood`);
  assert.equal(calls[1].url, `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/pages/projects/emmiwood/deployments/${options.deploymentId}`);
  for (const call of calls) {
    assert.equal(call.request.redirect, 'error');
    assert.equal(call.request.headers.authorization, 'Bearer sentinel');
  }
  for (const patch of [{ id: 'wrong' }, { project_name: 'other' }, { environment: 'preview' }, { latest_stage: { status: 'failure' } }, { deployment_trigger: { metadata: { branch: 'other', commit_hash: SHA } } }]) {
    await assert.rejects(fetchProductionDeployment(options, async (url) => responseFor(url, { ...deployment, ...patch })), /exact successful/);
  }
  await assert.rejects(fetchProductionDeployment(options, async (url) => responseFor(url, { ...deployment, deployment_trigger: { metadata: { branch: 'main', commit_hash: SHA.slice(0, 7) } } })), /full 40-character/);
  for (const patch of [{ accountId: undefined }, { accountId: '../other' }, { apiToken: '' }, { deploymentId: '../other' }]) {
    await assert.rejects(fetchProductionDeployment({ ...options, ...patch }, () => { throw new Error('unexpected transport'); }), /requires/);
  }
  await assert.rejects(fetchProductionDeployment(options, async (_url, request) => { assert.equal(request.redirect, 'error'); throw new TypeError('unexpected redirect'); }), /unexpected redirect/);
});

test('raw project configuration rejects wrong or missing production branch before deployment lookup', async () => {
  const options = { accountId: 'a'.repeat(32), apiToken: 'sentinel', deploymentId: '11111111-1111-4111-8111-111111111111' };
  for (const project of [{ name: 'other', production_branch: 'main' }, { name: 'emmiwood', production_branch: 'preview' }, { name: 'emmiwood' }]) {
    let requests = 0;
    await assert.rejects(fetchProductionDeployment(options, async () => {
      requests++;
      return { ok: true, json: async () => ({ success: true, result: project }) };
    }), /configured production_branch main/);
    assert.equal(requests, 1);
  }
});

test('admin roster rejects placeholder, duplicate, missing, and unexpected active accounts', () => {
  assert.deepEqual(validateAdminRoster(ADMIN_ROSTER), []);
  assert.match(validateAdminRoster(ADMIN_ROSTER.map((admin, index) => index === 0 ? { ...admin, phone: '+16055550199' } : admin)).join('\n'), /placeholder/i);
  assert.match(validateAdminRoster(ADMIN_ROSTER.map((admin, index) => index === 1 ? { ...admin, phone: ADMIN_ROSTER[0].phone } : admin)).join('\n'), /unique/i);
  assert.match(validateAdminRoster(ADMIN_ROSTER.filter((admin) => admin.id !== 'admin-barro')).join('\n'), /admin-barro/i);
  assert.match(validateAdminRoster([...ADMIN_ROSTER, { id: 'unexpected', email: 'extra@example.com', role: 'staff', active: 1, phone: '+16055550104' }]).join('\n'), /exactly 2/i);
});

test('cutover stage additionally requires both domains and a SHA-bound backup receipt', () => {
  assert.deepEqual(validateReleaseState(CUTOVER_READY).errors, []);
  assert.match(validateReleaseState({ ...CUTOVER_READY, domains: ['emmiwood.com'] }).errors.join('\n'), /www\.emmiwood\.com/i);
  assert.match(validateReleaseState({ ...CUTOVER_READY, backupReceipt: { exists: false } }).errors.join('\n'), /backup receipt/i);
  assert.match(validateReleaseState({ ...CUTOVER_READY, backupReceipt: { ...CUTOVER_READY.backupReceipt, approvedSha: 'b'.repeat(40) } }).errors.join('\n'), /receipt SHA/i);
});

test('scheduler state gates distinguish configured, disabled, and enabled operation', () => {
  assert.deepEqual(validateReleaseState({ ...READY, schedulerState: 'configured' }).errors, []);
  assert.deepEqual(validateReleaseState({ ...READY, schedulerState: 'disabled' }).errors, []);
  assert.match(validateReleaseState({ ...READY, schedulerState: 'enabled' }).errors.join('\n'), /must be true/i);
  assert.deepEqual(validateReleaseState({
    ...READY,
    schedulerState: 'enabled',
    actionVariables: { [NOTIFICATION_SCHEDULER_VARIABLE]: 'true' },
  }).errors, []);
  assert.match(validateReleaseState({
    ...READY,
    schedulerState: 'disabled',
    actionVariables: { [NOTIFICATION_SCHEDULER_VARIABLE]: 'true' },
  }).errors.join('\n'), /must be false/i);
});

test('preflight command exits nonzero for a dirty fixture and zero for the exact fixture', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'emmiwood-preflight-test-'));
  const fixture = join(directory, 'fixture.json');
  const script = new URL('./release-preflight.mjs', import.meta.url).pathname;

  await writeFile(fixture, JSON.stringify({ ...READY, statusEntries: ['?? migrations/0018_emmiwood_booking_idempotency.sql'] }));
  const failed = spawnSync(process.execPath, [script, '--expected-sha', SHA, '--scheduler-state', 'disabled'], {
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', EMMIWOOD_PREFLIGHT_TEST_FIXTURE: fixture },
  });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /dirty|0018/i);

  await writeFile(fixture, JSON.stringify(READY));
  const passed = spawnSync(process.execPath, [script, '--expected-sha', SHA, '--scheduler-state', 'disabled'], {
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', EMMIWOOD_PREFLIGHT_TEST_FIXTURE: fixture },
  });
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /preflight=PASS/);
  assert.match(passed.stdout, /external_delivery=false/);
  assert.match(passed.stdout, /required_state=disabled/);
});

test('preflight command carries deploy and cutover fixture stages through validation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'emmiwood-preflight-stage-test-'));
  const fixture = join(directory, 'fixture.json');
  const script = new URL('./release-preflight.mjs', import.meta.url).pathname;

  for (const state of [DEPLOY_READY, CUTOVER_READY]) {
    await writeFile(fixture, JSON.stringify(state));
    const result = spawnSync(process.execPath, [script, '--stage', state.stage, '--expected-sha', SHA, '--scheduler-state', 'disabled'], {
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'test', EMMIWOOD_PREFLIGHT_TEST_FIXTURE: fixture },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`stage=${state.stage}`));
  }
});
