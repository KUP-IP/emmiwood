# Emmiwood notification heartbeat (Cloudflare Worker)

Replaces the GitHub Actions schedule in `.github/workflows/notifications.yml`
with a Cloudflare Cron Trigger, so the heartbeat stops depending on GitHub
Actions under the local-first model.

Every 5 minutes the Worker:

1. **Probes** production notification readiness:
   `GET $EMMIWOOD_NOTIFICATION_URL` with `Authorization: Bearer
   $EMMIWOOD_NOTIFICATION_SECRET` and
   `User-Agent: emmiwood-notifications-heartbeat/1`. The run fails unless
   the response is HTTP 200 with `ok=true`, `data.ready=true`,
   `data.environment="production"`, and `data.sms.testMode` matching the
   Worker var `EXPECT_TEST_MODE`.
2. **Processes the queue** only when the Worker's `PROCESS_QUEUE` var is
   `"true"`: `POST` to the same URL. The run fails if any processed
   notification comes back `retrying` or `failed`. Expired and
   `skipped_test_mode` rows are expected skips and do not fail the run.

This mirrors the Actions workflow's failure behavior: a failed probe or a
failed notification turns the run red (the cron handler throws). The
handler awaits that work so Cloudflare records the exception and the
structured log lines.

There is no `fetch` handler and `workers_dev` stays false. The Worker has
no public HTTP surface.

`PROCESS_QUEUE` ships as `"false"` (probe-only). Do not flip it without
Isaiah's GO.

## Why overlap is now safe

`processQueuedNotifications` claims each row (`status='sending'`) before
Twilio or Resend is called. A booking-time flush and the cron cannot both
deliver the same row. A `sending` row older than 10 minutes is reaped
back to `queued` and counted as an attempt.

Because of that claim, Actions and the Worker can overlap briefly during
cutover without a double-send. The old "one move, two flips" fragility is
gone. Still flip one processor at a time when you can; overlap is a
safety net, not the happy path.

## Test mode

Pages vars:

- `SMS_TEST_ALLOWLIST`: comma-separated E.164 numbers
- `EMAIL_TEST_ALLOWLIST`: comma-separated email addresses

When an allowlist is set and non-empty, only those recipients are sent.
Every other live SMS or email row is left `queued` and unclaimed
(`skipped_test_mode`) so real customer rows are not consumed. Booking-time
flush does the same: non-allowlisted numbers stay on the queue. Preview
and development treat test mode as on even when the allowlist is empty, so
a forgotten list skips live sends instead of texting real customers.

Readiness includes `data.sms.testMode`, `data.sms.testAllowlistCount`,
and the same fields on `data.email`.

Worker var `EXPECT_TEST_MODE` (`"true"` / `"false"`) must match
`data.sms.testMode`. A forgotten production allowlist fails the probe
loudly.

Local `npm run dev` binds `SMS_TEST_ALLOWLIST=+15555550100` so local
Functions stay in test mode. That number is a fixture, not a real handset.

## Logging

Every error path logs HTTP status, `errorName` (`TimeoutError`,
`TypeError`, `CloudflareChallenge`, `NonJsonBody`, ...), and the first
200 characters of a non-JSON body. HTML 403/503 responses set
`cf_challenge=true`. If that appears, add a WAF skip for
`/api/emmiwood/internal/*` with the Bearer header, or switch the Worker
to a Service Binding to the Pages project.

Queue runs also log counts: `processed`, `sent`, `retrying`, `failed`,
`expired`, `suppressed`.

## Deploy (operator, from a machine with Cloudflare credentials)

Do not run these during this draft PR. Each production step needs its own
Isaiah GO.

```sh
cd workers/notifications-heartbeat
npx wrangler secret put EMMIWOOD_NOTIFICATION_SECRET   # same value as the Pages and Actions secret
npx wrangler deploy
```

Confirm `EMMIWOOD_NOTIFICATION_URL` in `wrangler.toml` before deploying.
Watch it run with `npx wrangler tail`.

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

This Worker has no `fetch` handler and no authenticated test-send route.
`workers_dev` stays false. Do not add a public HTTP entry just to smoke.

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

## Verification plan (separate GO per deploy step)

1. **Local / CI (no GO).** `npm run test:unit`,
   `npm test --prefix workers/notifications-heartbeat`,
   `npx wrangler deploy --dry-run --config workers/notifications-heartbeat/wrangler.toml`.
   CI green on the PR. No production data change.
2. **Preview (no production GO).** Deploy the Pages preview with
   `SMS_TEST_ALLOWLIST` set to Isaiah's test number. Create one synthetic
   booking on preview using that number. Process with `?id=`. Confirm a
   Twilio `SM...` SID. Ask Isaiah to prove the handset on a Mac.
3. **Prod Pages deploy (Isaiah GO #1).** Deploy Pages with
   `SMS_TEST_ALLOWLIST` set to the test number only, during closed hours,
   while the outbox has no due customer rows. Real customer SMS in this
   window stays queued. Keep the window short.
   Alternative with no test-mode skip: skip test mode in prod and rely
   on step 2 plus the claim and stale guards.
4. **Worker deploy (Isaiah GO #2).** Dispatch
   `.github/workflows/deploy-notifications-worker.yml` with the current
   `origin/main` SHA and confirmation `DEPLOY WORKER <sha>`, or
   `npx wrangler secret put EMMIWOOD_NOTIFICATION_SECRET` then
   `npx wrangler deploy` with `PROCESS_QUEUE="true"` and
   `EXPECT_TEST_MODE` matching step 3. Watch `npx wrangler tail` for 3
   cron ticks: `readiness_probe ready=true`, processed counts, no errors.
   Do not deploy from this draft PR without that GO.
5. **Synthetic prod check.** Staff-created test booking on the test
   number (not a customer). Confirm the confirmation SMS and the T-30m
   reminder arrive within 5 minutes of due time.
6. **Remove allowlist (Isaiah GO #3).** Clear `SMS_TEST_ALLOWLIST` and
   set Worker `EXPECT_TEST_MODE="false"`. Watch 24h: no `queued` row
   older than 10 minutes
   (`SELECT count(*) FROM emmiwood_notification_outbox WHERE status='queued' AND available_at < unixepoch()-600`).
7. **Phase C (later PR).** Delete `.github/workflows/notifications.yml`
   after 48h of clean Worker processing. This PR does not touch that
   workflow.

## Rollback

Set Worker `PROCESS_QUEUE="false"` and redeploy. Set the GitHub repo var
`EMMIWOOD_NOTIFICATIONS_ENABLED=true` so Actions processes again. The
atomic claim means both processors can overlap briefly without
double-send.

Do not run `db:migrate:remote:production` for this change. Status values
`sending` and `expired` need no CHECK-constraint migration. Test-mode
skips do not write a new status.

## Tests

```sh
npm test   # node --test, fetch stubbed. No network, no secrets
```
