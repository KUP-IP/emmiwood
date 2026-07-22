# Twilio human packet (KUP-managed Emmiwood sender)

**Status:** Blocked on operator inputs  
**Decision:** KUP-managed Twilio account + dedicated Emmiwood sender (locked 2026-07-22)  
**Issue:** [#18](https://github.com/KUP-IP/emmiwood/issues/18)

## Operator must supply

Fill these before KUP can finish account/sender provisioning. Do not put secrets in GitHub issues.

| Field | Value | Notes |
|---|---|---|
| Legal business name | | As filed for A2P / 10DLC |
| Business type | | LLC / sole prop / etc. |
| Business address | | Street, city, state, ZIP |
| Business website | | Preview URL OK until `emmiwood.com` |
| Authorized representative name | | |
| Authorized representative email | | |
| Authorized representative phone | | Mobile for Twilio verification |
| Billing contact / payment method | | KUP-managed account billing owner |
| Preferred area code / number | | Shop locale preference (e.g. 605) |
| SMS use case summary | | “Appointment confirmations, reminders, and admin sign-in codes for Emmiwood Barbers” |
| Sample message copy | | Use existing templates in `renderSms` |
| Opt-out language | | Already: “Reply STOP to opt out.” |
| Admin allowlist phones (E.164) | | Owner + any managers for SMS OTP. Preview seed uses `+16055550199` for `admin-isaiah` — replace via D1 before production. |

## KUP completes after inputs

1. Create / confirm KUP-managed Twilio account ownership and login recovery.
2. Complete phone verification and business identity.
3. Purchase dedicated Emmiwood sender number.
4. Start A2P / 10DLC brand + campaign registration; record status (even if pending).
5. Set production Page secrets (names only in docs): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `EMMIWOOD_NOTIFICATION_SECRET`.
6. Keep `EMMIWOOD_NOTIFICATIONS_ENABLED=false` until controlled synthetic SMS passes.
7. Record evidence: account SID (redacted), From number, compliance status, date.

## Explicitly out of this packet

- Resend / customer email
- Domain purchase (`emmiwood.com`)
- Enabling scheduled notification processing before smoke tests
