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
  parseActionVariables,
  parseNameColumn,
  parsePendingMigrations,
  parseSecretNames,
  validateNotificationWorkflow,
  validateReleaseState,
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
      EMMIWOOD_NOTIFICATION_URL: https://emmiwood.example/api/emmiwood/internal/notifications
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
  resource: { ...EXPECTED_PRODUCTION_RESOURCE },
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
test('different production pending set fails closed', () => expectFailure({ pendingMigrations: REQUIRED_EMMIWOOD_MIGRATIONS.slice(0, 2) }, /pending migrations must be exactly/i));
test('missing Twilio binding fails closed', () => expectFailure({ secretNames: REQUIRED_PRODUCTION_SECRETS.filter((name) => name !== 'TWILIO_AUTH_TOKEN') }, /TWILIO_AUTH_TOKEN/i));
test('missing processor Page binding fails closed', () => expectFailure({ secretNames: REQUIRED_PRODUCTION_SECRETS.filter((name) => name !== 'EMMIWOOD_NOTIFICATION_SECRET') }, /EMMIWOOD_NOTIFICATION_SECRET/i));
test('missing Actions processor secret fails closed', () => expectFailure({ actionSecretNames: [] }, /GitHub Actions secret/i));
test('missing scheduler variable fails closed', () => expectFailure({ actionVariables: {} }, /variable missing/i));
test('malformed scheduler workflow fails closed', () => expectFailure({ notificationWorkflow: 'name: incomplete' }, /workflow missing/i));
test('wrong D1 binding fails closed', () => expectFailure({ resource: { ...EXPECTED_PRODUCTION_RESOURCE, databaseId: 'wrong' } }, /databaseId/i));

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
