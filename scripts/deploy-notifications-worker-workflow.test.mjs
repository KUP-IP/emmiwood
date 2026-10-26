import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

test('empty test_allowlist omits SMS_TEST_ALLOWLIST from wrangler vars and sets EXPECT_TEST_MODE false', () => {
  assert.match(source, /echo "expect_test_mode=true"/);
  assert.match(source, /echo "expect_test_mode=false"/);
  assert.match(
    source,
    /if \[ -n "\$trimmed" \]; then\n(?:.*\n)*?\s+echo "expect_test_mode=true"/,
  );
  assert.match(
    source,
    /else\n(?:.*\n)*?\s+echo "expect_test_mode=false"/,
  );
  assert.match(source, /wrangler_vars<<EOF/);
  assert.match(
    source,
    /echo "EXPECT_TEST_MODE"\n\s+if \[ -n "\$trimmed" \]; then\n\s+echo "SMS_TEST_ALLOWLIST"/,
  );
  assert.match(source, /vars:\s*\$\{\{\s*steps\.vars\.outputs\.wrangler_vars\s*\}\}/);
  assert.doesNotMatch(
    source,
    /vars:\s*\|\n\s+PROCESS_QUEUE\n\s+EXPECT_TEST_MODE\n\s+SMS_TEST_ALLOWLIST/,
  );
});

test('prepare-vars script omits SMS_TEST_ALLOWLIST when the allowlist is empty', () => {
  const prepare = (allowlist) => execFileSync(
    'bash',
    ['-lc', `
      set -euo pipefail
      TEST_ALLOWLIST=${JSON.stringify(allowlist)}
      trimmed="$(printf '%s' "$TEST_ALLOWLIST" | tr -d '[:space:]')"
      if [ -n "$trimmed" ]; then
        echo "expect_test_mode=true"
      else
        echo "expect_test_mode=false"
      fi
      echo "PROCESS_QUEUE"
      echo "EXPECT_TEST_MODE"
      if [ -n "$trimmed" ]; then
        echo "SMS_TEST_ALLOWLIST"
      fi
    `],
    { encoding: 'utf8' },
  );

  const empty = prepare('');
  assert.match(empty, /^expect_test_mode=false$/m);
  assert.match(empty, /^PROCESS_QUEUE$/m);
  assert.match(empty, /^EXPECT_TEST_MODE$/m);
  assert.doesNotMatch(empty, /SMS_TEST_ALLOWLIST/);

  const set = prepare('+15555550100');
  assert.match(set, /^expect_test_mode=true$/m);
  assert.match(set, /^SMS_TEST_ALLOWLIST$/m);
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
