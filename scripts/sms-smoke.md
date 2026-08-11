# Preview SMS exact-ID smoke (Wave 2)

**Gates:** notifications scheduler stays `EMMIWOOD_NOTIFICATIONS_ENABLED=false`. Non-production processor **requires** `?id=`. Never bulk-process on preview.

## Prerequisites

1. Pages secrets on `emmiwood-barbers-preview` (names only; set via `wrangler pages secret put`):
   - `EMMIWOOD_NOTIFICATION_SECRET`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM_NUMBER`
2. Admin allowlist phone is a real E.164 (not `+16055550199`).
3. Deployed code includes manage-link SMS + exact-ID processor gate.

## Set secrets (operator; values never committed)

```bash
cd /Users/keepup/Developer/emmiwood
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

## Explicitly out of this smoke

- Flipping `EMMIWOOD_NOTIFICATIONS_ENABLED=true`
- Bulk POST without `?id=`
- Production Pages/D1 cutover
