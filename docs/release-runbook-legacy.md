# Emmiwood Production Release Runbook

Status: prepared only. Every production merge, migration, deployment, external delivery, destructive recovery action, and scheduler activation requires its own explicit GO.

## Release contract

- Approved PR: `#92`.
- Approved release SHA: supplied verbatim by the final Ship Gate as `RELEASE_SHA` and enforced by preflight.
- Production application rollback source: `af83a4627b0fee5ff95912b563f55aa2991516d8`.
- Production Pages rollback deployment: `c7bfd5e7-4a07-41b3-9de3-2deb197b4ecc`.
- Approved production migrations, in order:
  1. `0013_emmiwood_booking.sql`
  2. `0014_emmiwood_launch_copy.sql`
  3. `0015_emmiwood_production_hardening.sql`
  4. `0016_emmiwood_auth_source_limits.sql`
  5. `0017_emmiwood_pricing_and_copy.sql`
- Migration `0018` and every later Emmiwood migration are outside this release.
- Request-level idempotency work is outside this release.
- There are no down migrations. Application rollback leaves the additive schema in place.

## Notification release contract

Production Pages Functions require these names:

- `EMMIWOOD_NOTIFICATION_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `ENVIRONMENT=production` as a non-secret Pages variable

GitHub Actions requires:

- repository secret `EMMIWOOD_NOTIFICATION_SECRET`, with the same value as the Pages secret
- repository variable `EMMIWOOD_NOTIFICATIONS_ENABLED`
- `.github/workflows/emmiwood-notifications.yml`

The heartbeat runs every five minutes. It always performs an authenticated readiness probe. Scheduled queue processing occurs only when `EMMIWOOD_NOTIFICATIONS_ENABLED` is exactly `true`. Keep the variable `false` through source review, release deployment, and the separately approved synthetic delivery smoke.

The processor supports an exact outbox selector, `POST /api/emmiwood/internal/notifications?id=<outbox-id>`, for a bounded manual smoke. A scheduled run without `id` processes at most 50 due records. Production processing fails with HTTP `503` before any attempt when the processor, SMS, or email configuration is incomplete.

## Secure configuration preparation

Secret values must never be printed, committed, written to shell history, or copied into an issue or workflow log.

Generate the shared processor secret once, pass it to both systems from a mode-`600` temporary file, and remove the file immediately:

```bash
umask 077
processor_secret_file="$(mktemp)"
trap 'rm -f "$processor_secret_file"' EXIT
openssl rand -base64 48 | tr -d '\n' > "$processor_secret_file"
npx wrangler pages secret put EMMIWOOD_NOTIFICATION_SECRET \
  --project-name kup-solutions < "$processor_secret_file"
gh secret set EMMIWOOD_NOTIFICATION_SECRET \
  --repo KUP-IP/kup.solutions < "$processor_secret_file"
rm -f "$processor_secret_file"
trap - EXIT
```

Set the scheduler to the safe state:

```bash
gh variable set EMMIWOOD_NOTIFICATIONS_ENABLED \
  --repo KUP-IP/kup.solutions \
  --body false
```

Provision Twilio values only from an approved provider account or approved secret store. Use Wrangler's hidden prompt, one name at a time:

```bash
npx wrangler pages secret put TWILIO_ACCOUNT_SID --project-name kup-solutions
npx wrangler pages secret put TWILIO_AUTH_TOKEN --project-name kup-solutions
npx wrangler pages secret put TWILIO_FROM_NUMBER --project-name kup-solutions
```

Do not use placeholders. Confirm names only:

```bash
npx wrangler pages secret list --project-name kup-solutions
gh secret list --repo KUP-IP/kup.solutions --app actions
gh variable list --repo KUP-IP/kup.solutions
```

Cloudflare binding changes must be present before the approved production deployment that consumes them.

## Gate 0 — clean exact-SHA preflight

Run only from a dedicated clean worktree whose upstream is the PR branch. Never run this sequence from a worktree containing uncommitted or untracked files.

```bash
export RELEASE_SHA='<full SHA approved at Ship Gate>'
npm run emmiwood:release-preflight -- \
  --expected-sha "$RELEASE_SHA" \
  --scheduler-state disabled
```

The read-only preflight fails unless:

- `HEAD`, upstream, and `RELEASE_SHA` are identical.
- The worktree is clean.
- The committed and production-pending migration sets are exactly `0013`–`0017`.
- No `0018` or later Emmiwood migration is visible.
- All six production Page secret names exist; values are never read.
- The GitHub Actions processor secret name exists.
- `EMMIWOOD_NOTIFICATIONS_ENABLED` exists and is `false` for this gate.
- The notification heartbeat contains the exact production URL, five-minute cron, readiness probe, scheduled variable gate, manual processing gate, and exact-ID selector.
- Pages and D1 remain `kup-solutions` / `kup-solutions-db` / `0d7f70d4-9799-4671-92d9-59f12420beb2`.

Stop on any failure. Do not bypass or weaken the preflight.

## Gate 1 — capture backup and recovery anchors

After explicit production GO, create a durable SQL export and capture the current D1 Time Travel bookmark before applying a migration:

```bash
mkdir -p artifacts/emmiwood-production-release
npx wrangler d1 export kup-solutions-db --remote --env production \
  --output artifacts/emmiwood-production-release/kup-solutions-db-pre-emmiwood.sql
shasum -a 256 artifacts/emmiwood-production-release/kup-solutions-db-pre-emmiwood.sql
npx wrangler d1 time-travel info kup-solutions-db --json
```

Record the export path, SHA-256, bookmark, and current production row counts. Stop if export or bookmark capture fails.

## Gate 2 — apply only the approved additive migrations

List first:

```bash
npx wrangler d1 migrations list kup-solutions-db --remote --env production
```

The pending set must still be exactly `0013`–`0017`. Then apply and list again:

```bash
npx wrangler d1 migrations apply kup-solutions-db --remote --env production
npx wrangler d1 migrations list kup-solutions-db --remote --env production
```

Stop if the first list differs, application fails, or the second list still reports a pending migration.

## Gate 3 — verify D1 before merge

```bash
npx wrangler d1 execute kup-solutions-db --remote --env production --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'emmiwood_%' ORDER BY name;"
npx wrangler d1 execute kup-solutions-db --remote --env production --command \
  "SELECT id,name,price_cents,duration_minutes,buffer_minutes,active FROM emmiwood_services ORDER BY sort_order;"
npx wrangler d1 execute kup-solutions-db --remote --env production --command \
  "SELECT id,name,active FROM emmiwood_barbers ORDER BY sort_order;"
npx wrangler d1 execute kup-solutions-db --remote --env production --command \
  "SELECT id,email,role,active FROM emmiwood_admins ORDER BY id;"
npx wrangler d1 execute kup-solutions-db --remote --env production --command \
  "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_emmiwood_appointments_schedule','idx_emmiwood_time_claims_appointment','idx_emmiwood_login_challenges_admin_created','idx_emmiwood_notification_outbox_delivery','idx_emmiwood_auth_rate_limits_window') ORDER BY name;"
npx wrangler d1 execute kup-solutions-db --remote --env production --command \
  "PRAGMA table_info(emmiwood_login_challenges); PRAGMA table_info(emmiwood_customers); PRAGMA table_info(emmiwood_appointments); PRAGMA table_info(emmiwood_notification_outbox);"
```

Required invariants:

- 15 Emmiwood tables, including `emmiwood_auth_rate_limits`.
- Five active services priced at `3500 / 5000 / 2500 / 1500 / 3000` cents in sort order.
- Two active barbers.
- One active owner account.
- All five named indexes above.
- Login challenge fields `failed_attempts`, `locked_at`.
- Consent fields `sms_consent_version`, `sms_consent_at`.
- Appointment field `manage_token_expires_at`.
- Notification fields `attempt_count`, `last_attempt_at`, `provider_message_id`.

Do not merge while any invariant is missing.

## Gate 4 — merge and observe

Merge PR `#92` only after Gates 0–3 are recorded and the user gives explicit merge GO. Successful main CI triggers the Pages production deployment.

```bash
gh pr checks 92 --watch
gh run list --workflow CI --commit "$RELEASE_SHA"
gh run list --workflow "Cloudflare Pages Deploy" --commit "$RELEASE_SHA"
npx wrangler pages deployment list --project-name kup-solutions
```

Stop if CI fails, deployment lineage cannot be tied to the approved release, or Cloudflare reports failure. Keep `EMMIWOOD_NOTIFICATIONS_ENABLED=false`.

## Gate 5 — read-only production smoke

```bash
curl -fsS https://kup.solutions/api/health
curl -fsS https://kup.solutions/api/emmiwood/catalog
curl -I https://kup.solutions/emmiwood/
curl -I https://kup.solutions/emmiwood/admin/
```

Inspect desktop and Pixel 5: public page, Barro photo, catalog, grouped availability, booking details, management recovery, and admin request-code screen. Do not request a real login code.

Verify authenticated notification readiness without processing:

```bash
# Use a local secure credential source. Do not place the value in shell history.
curl --fail-with-body \
  -H "Authorization: Bearer $EMMIWOOD_NOTIFICATION_SECRET" \
  https://kup.solutions/api/emmiwood/internal/notifications
```

Expected: HTTP `200`, `data.ready=true`, processor/SMS/email ready, providers `twilio` and `resend`. The response contains readiness and missing-name metadata only, never secret values.

## Gate 6 — separately approved controlled delivery smoke

This gate is not authorized by the release GO. Obtain a separate explicit GO naming the channel, test recipient, and exact synthetic outbox ID before any production D1 insert or provider request.

Prerequisites:

- the approved production source and migrations are live
- Gate 5 readiness is green
- scheduler variable remains `false`
- recipient is owned or controlled by the tester
- no real customer record or appointment is used

Create one due synthetic outbox record with `appointment_id=NULL`, then dispatch only that exact ID:

```bash
export SMOKE_ID='emmiwood-notification-smoke-<unique-suffix>'
# Production D1 INSERT is intentionally omitted here until the separate GO supplies
# the approved recipient and channel.
gh workflow run emmiwood-notifications.yml \
  --repo KUP-IP/kup.solutions \
  --ref main \
  -f process=true \
  -f notification_id="$SMOKE_ID"
```

Verify:

- provider accepted the request and returned a stable provider message ID
- the exact row moved `queued → sent`, `attempt_count=1`, `sent_at` and `last_attempt_at` are set
- no other queued row changed
- GitHub run summary reports one exact ID without recipient data
- admin outbox visibility shows provider, status, attempts, provider ID, and any bounded error
- provider rejection/timeout retry behavior remains the tested sequence: retry after 60 seconds, then 120 seconds, then terminal `failed` on attempt 3

Do not activate scheduled processing merely because the accepted smoke passed. Review provider delivery state and any opt-out/provider-account requirements first.

## Gate 7 — scheduler activation

After a separate scheduler activation GO:

```bash
gh variable set EMMIWOOD_NOTIFICATIONS_ENABLED \
  --repo KUP-IP/kup.solutions \
  --body true
npm run emmiwood:release-preflight -- \
  --expected-sha "$RELEASE_SHA" \
  --scheduler-state enabled
```

Observe at least two five-minute heartbeat runs. Confirm due queue processing, zero unexpected records, bounded retries, and operational visibility.

## Rollback and worst-case containment

- Before migrations: stop with no application or D1 change.
- Scheduler disabled: heartbeat may fail visibly, but no scheduled POST occurs.
- Incomplete production notification configuration: processor returns `503` before an outbox attempt or provider request.
- Manual smoke: exact-ID selection limits processing to one due synthetic row.
- Rapid customer changes: unsent appointment SMS records are marked `cancelled`; only the newest lifecycle update remains queued.
- Provider failure: attempt count and bounded error are retained; retries are capped at three.
- Rows queued while configuration was incomplete resolve the provider from current complete bindings before processing.
- After migrations but before merge: leave additive schema in place and forward-fix. Do not delete tables.
- Application unhealthy but D1 healthy: roll Pages back to deployment `c7bfd5e7-4a07-41b3-9de3-2deb197b4ecc` and verify source `af83a4627b0fee5ff95912b563f55aa2991516d8` is serving. Set `EMMIWOOD_NOTIFICATIONS_ENABLED=false` before or during rollback.
- Suspected provider misrouting: set the scheduler variable to `false`, do not invoke manual processing, and rotate the processor secret if exposure is suspected.
- D1 corruption: stop writes and request a separate destructive recovery GO before using the captured Time Travel bookmark:

```bash
npx wrangler d1 time-travel restore kup-solutions-db --bookmark BOOKMARK --env production
```

The SQL export is an audit and recovery artifact, not an automatic down migration. Once real bookings exist, restoring the pre-release bookmark would delete them and cannot be reconciled automatically.
