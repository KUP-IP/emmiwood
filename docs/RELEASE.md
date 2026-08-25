# Standalone Emmiwood Release Runbook

## Safety invariants

- Repository: `KUP-IP/emmiwood` only.
- Preview Pages project: `emmiwood-barbers-preview` only.
- Preview D1 database: `emmiwood-standalone-preview-db` only.
- Production Pages project: `emmiwood` only.
- Production D1 database: `emmiwood-db` only.
- Production must have `ENVIRONMENT=production`, an exact 40-character `EMMIWOOD_RELEASE_SHA`, and an HTTPS `EMMIWOOD_PUBLIC_ORIGIN` with no path.
- Production appointment writes default closed. `EMMIWOOD_BOOKING_WRITES_ENABLED` must be exactly `true` or `false`; missing and invalid values stay closed.
- Preview can be frozen with `EMMIWOOD_BOOKING_WRITES_ENABLED=false` without changing read-only catalog, slot, or dashboard access.
- Keep the GitHub notification workflow manually disabled, `EMMIWOOD_NOTIFICATIONS_ENABLED=false`, and `EMMIWOOD_NOTIFICATION_URL` absent until the final activation gate.
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

The pre-provision fixture expects migrations `0001`–`0009` to be pending on a new production D1 database:

```bash
npm run release:preflight -- \
  --stage provision \
  --expected-sha "$APPROVED_SHA" \
  --scheduler-state disabled
```

## Production administrator seed

Production requires exactly three active, phone-unique accounts:

- `admin-isaiah`: owner
- `admin-recovery`: manager
- `admin-kup-support`: read/support-only `kup_support`

Real emails and E.164 phones are supplied only through the six `EMMIWOOD_OWNER_*`, `EMMIWOOD_RECOVERY_*`, and `EMMIWOOD_SUPPORT_*` environment inputs. Never commit them, paste them into a gate, or store them in a migration. Dry-run validation masks all identities and performs no provider call:

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

Then run the authenticated, read-only live preflight. Supply the notification secret through `EMMIWOOD_PREFLIGHT_NOTIFICATION_SECRET`; never place it in command arguments:

```bash
npm run release:preflight -- \
  --stage deploy \
  --expected-sha "$APPROVED_SHA" \
  --scheduler-state disabled \
  --readiness-url https://emmiwood.pages.dev/api/emmiwood/internal/notifications
```

Deploy readiness requires: exact runtime SHA, production environment, pages.dev origin, frozen writes, `main` Pages branch, matching deployment source, no pending migrations, exactly three valid administrators, zero queued notifications, workflow manually disabled, and no processor URL variable.

## Cutover readiness

Immediately before domain transfer:

1. Re-read preview future bookings and queued notifications.
2. Set preview booking writes to `false` and prove all guest and admin appointment mutations return `503 booking_paused` without changing D1.
3. Export preview and production D1 databases.
4. Record a JSON backup receipt containing `approvedSha`, `previewSha256`, and `productionSha256`.
5. Change production public origin to `https://emmiwood.com` while production writes remain disabled.
6. Attach `emmiwood.com` and `www.emmiwood.com` to production.

Run:

```bash
npm run release:preflight -- \
  --stage cutover \
  --expected-sha "$APPROVED_SHA" \
  --scheduler-state disabled \
  --readiness-url https://emmiwood.com/api/emmiwood/internal/notifications \
  --backup-receipt /absolute/path/to/backup-receipt.json
```

Only after HTTPS, origin, authentication cookies, catalog, slots, D1, and domain ownership verify may a separate gate enable production booking writes.

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
