# Standalone Emmiwood Release Runbook

Cloud-first operations: Cursor Cloud Agents, GitHub Actions, and Cloudflare Pages. See [`docs/CLOUD.md`](CLOUD.md). Do not deploy from a laptop with frozen-launch `wrangler.toml` defaults — live production vars are committed.

## Safety invariants

- Repository: `KUP-IP/emmiwood` only.
- Preview Pages project: `emmiwood-barbers-preview` only (Direct Upload until Git-connected cutover).
- Preview D1 database: `emmiwood-standalone-preview-db` only.
- Production Pages project: `emmiwood` only.
- Production D1 database: `emmiwood-db` only.
- Production must have `ENVIRONMENT=production`, an exact 40-character release SHA (`EMMIWOOD_RELEASE_SHA` or Pages `CF_PAGES_COMMIT_SHA`), and an HTTPS `EMMIWOOD_PUBLIC_ORIGIN` with no path.
- `EMMIWOOD_BOOKING_WRITES_ENABLED` must be exactly `true` or `false`; missing and invalid values stay closed in production. Live production (2026-08-31) has writes and notifications **enabled** with origin `https://emmiwood.com`; `wrangler.toml` matches that snapshot.
- Preview can be frozen with `EMMIWOOD_BOOKING_WRITES_ENABLED=false` without changing read-only catalog, slot, or dashboard access.
- Code deploys from `main` after CI `verify` when `EMMIWOOD_CLOUD_DEPLOY=true` (GitHub Actions Direct Upload, until a Git-connected Pages project exists). D1 migrations stay gated (`workflow_dispatch` confirmation `APPLY-REMOTE-MIGRATIONS`).
- Live preflight from a Cloud Agent uses `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `EMMIWOOD_PREFLIGHT_NOTIFICATION_SECRET` (env). Do not use `wrangler login` or paste secrets into command arguments.
- Every external mutation below requires its own Ship Gate. A prior gate does not authorize a later phase.

Customer email and Resend are out of scope for version one. The operating decisions are recorded in `docs/DECISIONS.md`.

## Local candidate verification

Run from a clean candidate whose `HEAD` and upstream equal the exact approved SHA:

```bash
npm ci
npm ci --prefix client
npm test
npm audit --audit-level=high
npm audit --prefix client --audit-level=high
```

The pre-provision fixture expects migrations `0001`–`0010` to be pending on a new production D1 database:

```bash
npm run release:preflight -- \
  --stage provision \
  --expected-sha "$APPROVED_SHA" \
  --scheduler-state disabled
```

## Production administrator seed

Production requires exactly two active, phone-unique individual accounts:

- `admin-isaiah`: owner
- `admin-barro`: manager (full administration and support visibility)

Isaiah and Barro handle support through their own accounts; production does not seed a shared or third support login. Real emails and E.164 phones are supplied only through the four `EMMIWOOD_OWNER_*` and `EMMIWOOD_BARRO_*` environment inputs. Never commit them, paste them into a gate, or store them in a migration. Dry-run validation masks all identities and performs no provider call:

```bash
node scripts/seed-production-admins.mjs
```

The mutating form is reserved for an exact Production Admin Seed Ship Gate:

```bash
node scripts/seed-production-admins.mjs \
  --execute \
  --confirm PRODUCTION-ADMIN-SEED \
  --database emmiwood-db \
  --env production
```

The tool refuses unless the D1 roster is still the untouched migration seed, stores transient SQL only in a mode-`0600` temporary file, executes it through D1's atomic file-import path, deletes it, then verifies the role-isolated roster without printing full identities.

## Deploy readiness

Provision dedicated resources, apply migrations, seed administrators, bind a distinct restricted Twilio API key, and deploy the approved SHA only after a Ship Gate. Start with:

- `EMMIWOOD_PUBLIC_ORIGIN=https://emmiwood.pages.dev`
- `EMMIWOOD_BOOKING_WRITES_ENABLED=false`
- `EMMIWOOD_RELEASE_SHA=<exact approved SHA>`
- notification workflow disabled and processor URL absent

Then run the authenticated, read-only live preflight from a Cloud Agent or any machine with env credentials. Supply the notification secret through `EMMIWOOD_PREFLIGHT_NOTIFICATION_SECRET`; never place it in command arguments:

Live deploy/cutover preflight also requires `CLOUDFLARE_ACCOUNT_ID` and a read-authorized `CLOUDFLARE_API_TOKEN` in the environment. It reads the exact deployment ID from Wrangler, then requests raw project and deployment metadata from the Cloudflare API to verify the configured project production branch is `main`, the full 40-character commit SHA, project `emmiwood`, production environment, deployment source branch `main`, and successful deployment. Wrangler's abbreviated `Source` display is not accepted as full-SHA evidence. Missing credentials or provenance fail closed; do not paste credential values into logs or release receipts.

The credential-bearing readiness URL must be the exact notification endpoint on `https://emmiwood.pages.dev` for deploy or `https://www.emmiwood.com` for cutover. Redirects, embedded credentials, query strings, and other origins are refused before following them.

```bash
npm run release:preflight -- \
  --stage deploy \
  --expected-sha "$APPROVED_SHA" \
  --scheduler-state disabled \
  --readiness-url https://emmiwood.pages.dev/api/emmiwood/internal/notifications
```

Deploy readiness requires: exact runtime SHA, production environment, pages.dev origin, frozen writes, `main` Pages branch, matching deployment source, no pending migrations, exactly two valid administrators, zero queued notifications, workflow manually disabled, and no processor URL variable.

## Cutover readiness

Immediately before domain transfer:

1. Re-read preview future bookings and queued notifications.
2. Set preview booking writes to `false` and prove all guest and admin appointment mutations return `503 booking_paused` without changing D1.
3. Export preview and production D1 databases.
4. Record a JSON backup receipt containing `approvedSha`, `previewSha256`, and `productionSha256`.
5. Change production public origin to `https://www.emmiwood.com` while production writes remain disabled.
6. Attach `emmiwood.com` and `www.emmiwood.com` to production, with apex redirecting to `www` while preserving the route and query string.

Run:

```bash
npm run release:preflight -- \
  --stage cutover \
  --expected-sha "$APPROVED_SHA" \
  --scheduler-state disabled \
  --readiness-url https://www.emmiwood.com/api/emmiwood/internal/notifications \
  --backup-receipt /absolute/path/to/backup-receipt.json
```

Only after HTTPS, origin, authentication cookies, catalog, slots, D1, and domain ownership verify may a separate gate enable production booking writes.

## Staff / barber SMS

Assigned barbers with `emmiwood_barbers.phone` receive operational SMS (`barber_booking_notice`, `barber_cancellation_notice`, `barber_reschedule_notice`, `barber_reminder_15m` at T−15m ±5m). Guest consent does not gate staff rows. Before enabling the notification scheduler: inventory due `queued=0`, A2P staff GO recorded, and exact-ID smoke complete. See `docs/a2p-staff-schedule-sms-go-2026-08-25.md`.

## Delivery and automation

Use separate gates for:

1. One tagged synthetic booking and cancellation with SMS consent off; restore the freeze and verify no queued notification remains.
2. One exact-ID production SMS; reconcile its provider SID to a terminal Twilio status before considering another send.
3. Notification activation: set the processor URL and matching GitHub secret, enable the workflow, set `EMMIWOOD_NOTIFICATIONS_ENABLED=true`, and observe the readiness heartbeat and first scheduled run.

## Rollback

- Disable the workflow, set the scheduler variable `false`, remove the processor URL, and freeze production writes.
- Before any real production booking, domains may be returned to the preserved preview deployment and preview writes re-enabled only after its D1 is rechecked.
- After any production booking, freeze both environments and reconcile data before moving domains; never restore preview blindly.
- Re-deploy the exact last-known-good SHA or restore D1 only from the SHA-bound, checksum-verified backup receipt.
