# Emmiwood notification heartbeat (Cloudflare Worker)

Replaces the GitHub Actions schedule in `.github/workflows/notifications.yml`
with a Cloudflare Cron Trigger, so the heartbeat stops depending on GitHub
Actions under the local-first model.

Every 5 minutes the Worker:

1. **Probes** production notification readiness —
   `GET $EMMIWOOD_NOTIFICATION_URL` with `Authorization: Bearer
   $EMMIWOOD_NOTIFICATION_SECRET`; the run fails unless the response is
   HTTP 200 with `ok=true`, `data.ready=true`, `data.environment="production"`.
2. **Processes the queue** — only when the Worker's `PROCESS_QUEUE` var is
   `"true"`: `POST` to the same URL; the run fails if any processed
   notification comes back `retrying` or `failed`.

This mirrors the Actions workflow's semantics, including its failure
behavior: a failed probe or a failed notification turns the run red
(here: the cron invocation throws and is marked failed in Cloudflare).

## Deploy (operator, from a machine with Cloudflare credentials)

```sh
cd workers/notifications-heartbeat
npx wrangler secret put EMMIWOOD_NOTIFICATION_SECRET   # same value as the Actions secret
npx wrangler deploy
```

Confirm `EMMIWOOD_NOTIFICATION_URL` in `wrangler.toml` matches the repo
variable of the same name before deploying. Watch it run with
`npx wrangler tail`.

`PROCESS_QUEUE` ships as `"false"` (probe-only) on purpose. See the
cutover protocol. Do not flip it early.

## GitHub Actions deploy (operator GO only)

`.github/workflows/deploy-notifications-worker.yml` is `workflow_dispatch`
only. It does not run on push or schedule. Do not start it from this PR.

Inputs:

- `release_sha`: full 40-character SHA. Must equal the current `origin/main`
  tip.
- `confirmation`: exactly `DEPLOY WORKER <release_sha>`.
- `process_queue`: `"false"` (default) or `"true"`.
- `test_allowlist`: optional comma-separated E.164 list. The workflow sets
  Worker vars `SMS_TEST_ALLOWLIST` and `EXPECT_TEST_MODE=true` when the
  list is non-empty. Pages `SMS_TEST_ALLOWLIST` is still what filters
  sends. The Worker probe fails if `EXPECT_TEST_MODE` does not match
  Pages readiness.
- `send_one_test`: prints the one-row procedure below. It does not send.

The job uses the `production` GitHub environment, `CLOUDFLARE_API_TOKEN`,
and `CLOUDFLARE_ACCOUNT_ID` through `cloudflare/wrangler-action`. It
deploys `workers/notifications-heartbeat` with `--config wrangler.toml`
and writes the Wrangler version id to the job summary.

## Send one test

This Worker has a liveness-only `fetch` handler and no authenticated
test-send route. `workers_dev` stays false. The liveness JSON does not
process the queue or send SMS.

To send one dedicated test SMS after a GO deploy:

1. Set Pages `SMS_TEST_ALLOWLIST` to the single test E.164.
2. Queue one synthetic outbox row for that number only. Keep
   `available_at` due now. Note the outbox `id`.
3. Dispatch the deploy workflow with `process_queue=true` and
   `test_allowlist` set to that number.
4. Wait for the next 5-minute cron. The Worker POSTs the queue. Only the
   allowlisted row should send.
5. Confirm D1 `status=sent` and a Twilio `SM...` SID. Handset proof stays
   Mac-only.

Exact-id alternative that bypasses the Worker: run
`.github/workflows/notifications.yml` with `process=true` and that
`notification_id`. That POSTs Pages `?id=` with the Bearer secret.

## Cutover protocol

The outbox processor (`processQueuedNotifications`) selects queued rows
and sends them **without an atomic claim**, so two live processors can
double-send the same text. The handoff is therefore sequential, never
overlapping:

- **Phase A — probe parity (safe in parallel).** Deploy the Worker with
  `PROCESS_QUEUE="false"`. Actions keeps probing *and* processing. For
  ~24h, compare the Worker's probe logs (`wrangler tail` / dashboard)
  against the Actions heartbeat runs: same cadence, same readiness
  verdicts.
- **Phase B — processing handoff (one move, two flips).** Set the
  Actions repo variable `EMMIWOOD_NOTIFICATIONS_ENABLED` to `"false"`
  (Actions keeps probing, stops processing) **and** set the Worker's
  `PROCESS_QUEUE` to `"true"` + redeploy. The Worker is now the sole
  processor. Watch processed counts and per-notification results for at
  least a few hours, including one real booking text. Rollback is the
  same two flips in reverse.
- **Phase C — retire Actions.** With Phase B proven, delete
  `.github/workflows/notifications.yml` in a PR. The Worker is the
  heartbeat. (The manual exact-ID delivery smoke from the old workflow
  remains available as a direct authenticated call to the internal
  endpoint: `POST $EMMIWOOD_NOTIFICATION_URL?id=<id>` with the Bearer
  secret.)

## Tests

```sh
npm test   # node --test, fetch stubbed — no network, no secrets
```
