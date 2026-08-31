# Preview SMS exact-ID smoke (Wave 2)

**Gates:** **Preview** Pages notifications stay `false`; non-production processor **requires** `?id=`; never bulk-process on preview. Production GitHub heartbeat scheduler is **already enabled** (see `docs/HANDOFF.md`) — this smoke does not flip production.

## Prerequisites

1. Pages secrets on `emmiwood-barbers-preview` (names only; set via `wrangler pages secret put`):
   - `EMMIWOOD_NOTIFICATION_SECRET`
   - `TWILIO_ACCOUNT_SID` — Account SID (`AC…`) for the API path
   - `TWILIO_AUTH_TOKEN` — classic Auth Token **or** API Key secret
   - `TWILIO_FROM_NUMBER` — E.164 sender
   - Optional: `TWILIO_API_KEY_SID` — when set (`SK…`), basic auth uses API Key SID + `TWILIO_AUTH_TOKEN` secret (recommended for vaulted API keys)
2. Admin allowlist phone is a real E.164 (not `+16055550199`).
3. Deployed code includes manage-link SMS + exact-ID processor gate.

## Set secrets (operator; values never committed)

```bash
cd /Users/keepup/Developer/emmiwood   # Cloud Agent: /workspace
# Generate processor secret once; store in password manager.
openssl rand -hex 32 | npx wrangler pages secret put EMMIWOOD_NOTIFICATION_SECRET --project-name emmiwood-barbers-preview
npx wrangler pages secret put TWILIO_ACCOUNT_SID --project-name emmiwood-barbers-preview
npx wrangler pages secret put TWILIO_AUTH_TOKEN --project-name emmiwood-barbers-preview
npx wrangler pages secret put TWILIO_FROM_NUMBER --project-name emmiwood-barbers-preview
```

Redeploy after secrets if Functions do not pick them up immediately.

## Readiness

```bash
export EMMIWOOD_NOTIFICATION_SECRET='…'   # same value as Pages secret
curl -sS -H "authorization: Bearer $EMMIWOOD_NOTIFICATION_SECRET" \
  'https://emmiwood-barbers-preview.pages.dev/api/emmiwood/internal/notifications' | jq .
# Expect ok:true, sms.provider twilio, exactIdOnly:true
```

## Exact-ID smoke (preferred)

1. Book once with SMS consent to **your** test phone (or use admin UI), note outbox id from D1:

```bash
npx wrangler d1 execute emmiwood-standalone-preview-db --remote --config wrangler.preview.toml --command \
  "SELECT id,template,status,recipient,provider FROM emmiwood_notification_outbox ORDER BY created_at DESC LIMIT 5;"
```

2. Process **only** that id:

```bash
curl -sS -X POST -H "authorization: Bearer $EMMIWOOD_NOTIFICATION_SECRET" \
  "https://emmiwood-barbers-preview.pages.dev/api/emmiwood/internal/notifications?id=OUTBOX_UUID" | jq .
```

3. Verify D1 `status=sent`, `provider_message_id` set, and phone received manage link.

## Admin OTP smoke

```bash
curl -sS -X POST -H 'content-type: application/json' -H 'origin: https://emmiwood-barbers-preview.pages.dev' \
  -d '{"phone":"+1XXXXXXXXXX"}' \
  'https://emmiwood-barbers-preview.pages.dev/api/emmiwood/admin/auth/request-code'
```

Preview may still return `previewCode` in JSON when `ENVIRONMENT=preview`; live Twilio should also deliver when secrets are bound.

**Do not treat `ok: true` or `previewCode` as handset proof.** PASS requires D1 `status=sent` + `provider_message_id` `SM…` and Messages/`chat.db` body match.

## Wave C+ suite — five unique paths + self-verify

Automated Preview suite (post–Red Team). Proves five distinct SMS paths with D1 + Twilio SID + `~/Library/Messages/chat.db` fingerprints. Guest booking/manage calls hit `https://emmiwood-barbers-preview.pages.dev` (override with `EMMIWOOD_SUITE_BOOKING_ORIGIN` if needed)—not production `www` after cutover.

| Send | Case | Template |
|------|------|----------|
| 1 | T1 | `booking_confirmation` (&lt;24h book) |
| 2 | T2 | `cancellation_confirmation` (same appt) |
| 3 | T3 | `reschedule_confirmation` (confirmation quarantined) |
| 4 | T4 | `appointment_reminder` (confirmation quarantined; `available_at` forced) |
| 5 | T5 | `admin_login_code` (immediate admin path) |

**Spend GO (required):**

```bash
cd /Users/keepup/Developer/emmiwood
node scripts/sms-self-verify-suite.mjs --spend-go "OK to send 5 intentional SMS to +15078485517; abort on any extra."
```

Bearer: env `EMMIWOOD_NOTIFICATION_SECRET` or Keychain `api_key:emmiwood-notification` / `EMMIWOOD_NOTIFICATION_SECRET`.

**Rules hard-coded in the harness:**

- Scheduler stays off; exact-ID only for T1–T4; one POST per case; **no retry** on timeout.
- T3/T4 quarantine sibling confirmation rows before send; inventory must be exactly one target `queued` UUID.
- T5: preview `emmiwood_admins` must already include the test E.164; API `ok`/`previewCode` ignored.
- Cleanup cancels open suite appts and auto-quarantines leftover `queued` rows (never processes them).
- Receipt under `scripts/.sms-receipts/` (gitignored).

**Non-claims:** not Prod-GO; not scheduler enablement; T4 does **not** prove T−24h reminder scheduling (forced `available_at` only).

Helpers: [`scripts/sms-self-verify-lib.mjs`](sms-self-verify-lib.mjs), runner [`scripts/sms-self-verify-suite.mjs`](sms-self-verify-suite.mjs).

## Explicitly out of this smoke

- Flipping `EMMIWOOD_NOTIFICATIONS_ENABLED=true`
- Bulk POST without `?id=`
- Production Pages/D1 cutover
- Claiming reminder timing or Prod-GO from this suite
