# Twilio number split — 605 Good Dog vs Emmiwood

**As of 2026-08-15** (single KUP Twilio account `AC49a825…` / “My First Twilio Account”).

## Numbers

| Business | Number | Friendly name | Role |
|----------|--------|---------------|------|
| **605 Good Dog** | **+1 (605) 800-4499** | `605 Good Dog - Business Line` | Reserved **business / ops line** (voice + future 605GD SMS). **Not** Emmiwood appointment FROM. **Not** published on 605good.dog (NAP: no public `tel:`). |
| **Emmiwood Barbers** | **+1 (605) 250-3489** | `Emmiwood Barbers - Appointment SMS` | Dedicated **appointment / OTP SMS** sender. Bound to Emmiwood preview `TWILIO_FROM_NUMBER`. |

## Messaging / A2P

| Resource | Value | Notes |
|----------|--------|------|
| Brand | `BN74f922…` Sole Proprietor **APPROVED** / identity **VERIFIED**; Trust Hub `brand_name` = **KUP Solutions** | One brand on this account for now |
| Messaging Service | `MG89702f…` “Sole Proprietor A2P Messaging Service” | Emmiwood campaign host |
| Service phone members | **only** `+16052503489` | 605-800 is **detached** from this service |
| Campaign | `QE2c6890…` Sole Proprietor Usa2p | **IN_PROGRESS** as of 2026-08-15 same-SID resubmit (empty `errors[]`). Prior state was **FAILED 30908**. Awaiting TCR **VERIFIED**. |

## Design notes

- **Not a 5-digit short code.** Short codes are a separate, high-cost product. Emmiwood uses a normal **10-digit local (605)** number reserved only for booking SMS / admin OTP.
- **605 Good Dog** holds `(605) 800-4499` for internal/ops use only under NAP (no public `tel:` on site or GBP). A separate 605GD A2P campaign (or subaccount) can be planned when that product sends SMS at scale; Sole Proprietor is limited (typically one campaign / tight number rules).
- App still sends with **From = `TWILIO_FROM_NUMBER`** secret (Emmiwood’s 250-3489), not the Good Dog number.

## Campaign / privacy (updated 2026-08-15)

1. Privacy + SMS terms hardened for TCR **30908** (non-sharing of mobile/consent for marketing; frequency; Msg&Data rates; STOP/HELP). Privacy names KUP Solutions as the booking/SMS technology operator.
2. **Static HTML** under `client/public/emmiwood/{privacy,sms-terms,opt-in-evidence}/` so crawlers see content without JS (React SPA `/book` is not crawlable).
3. Canonical live URLs (www; do not cite pages.dev in `message_flow`):
   - https://www.emmiwood.com/emmiwood/privacy
   - https://www.emmiwood.com/emmiwood/sms-terms
   - https://www.emmiwood.com/emmiwood/opt-in-evidence/
   - https://www.emmiwood.com/emmiwood/book
4. Same campaign SID `QE2c6890…` only — **do not delete/recreate**. 2026-08-12 resubmit went IN_PROGRESS then **FAILED 30908**. 2026-08-15 same-SID edit+resubmit cites opt-in-evidence and KUP-as-operator.
5. **After VERIFIED:** retest OTP + booking SMS from **+16052503489** (exact-ID processor smoke). Scheduler and `EMMIWOOD_NOTIFICATION_URL` stay unset until that smoke + spend GO. If **FAILED** on **30914/30918**, stop and register a Standard/Low-Volume brand with EIN — do not recreate this SID first.
6. 605 Good Dog public site still follows NAP (no public `tel:`); internal line documented in `605-good-dog/docs/brand/nap.md`.
