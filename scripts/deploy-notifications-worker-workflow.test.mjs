import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workflowPath = resolve(root, '.github/workflows/deploy-notifications-worker.yml');
const source = readFileSync(workflowPath, 'utf8');
const workerSource = readFileSync(resolve(root, 'workers/notifications-heartbeat/src/index.js'), 'utf8');

test('deploy-notifications-worker is dispatch-only with SHA and confirmation gates', () => {
  assert.match(source, /^name:\s*Deploy notifications Worker/m);
  assert.match(source, /^on:\n {2}workflow_dispatch:/m);
  assert.doesNotMatch(source, /\nschedule:/);
  assert.doesNotMatch(source, /\npush:/);
  assert.doesNotMatch(source, /\npull_request:/);
  assert.match(source, /release_sha:/);
  assert.match(source, /confirmation:/);
  assert.match(source, /DEPLOY WORKER <release_sha>/);
  assert.match(source, /process_queue:/);
  assert.match(source, /default:\s*"false"/);
  assert.match(source, /test_allowlist:/);
  assert.match(source, /send_one_test:/);
  assert.match(source, /environment:\s*production/);
  assert.match(source, /uses:\s*cloudflare\/wrangler-action@v4/);
  assert.match(source, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(source, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(source, /workingDirectory:\s*workers\/notifications-heartbeat/);
  assert.match(source, /command:\s*deploy --config wrangler.toml/);
  assert.match(source, /SMS_TEST_ALLOWLIST/);
  assert.match(source, /Print deployment and version id/);
  assert.match(source, /WRANGLER_OUTPUT_FILE_PATH/);
  assert.match(source, /origin\/main/);
  assert.match(source, /github\.repository == 'KUP-IP\/emmiwood'/);
  assert.match(source, /cancel-in-progress:\s*false/);
});

test('Worker has no authenticated test-send route so the workflow only documents one-row cron', () => {
  assert.doesNotMatch(workerSource, /async fetch\s*\(/);
  assert.match(workerSource, /async scheduled\(/);
  assert.doesNotMatch(workerSource, /test-send|test_send|sendOneTest/);
  assert.match(source, /no authenticated test-send route/);
  assert.match(source, /no fetch handler/);
  assert.match(source, /notifications\.yml/);
  assert.match(source, /Does not send/);
});
