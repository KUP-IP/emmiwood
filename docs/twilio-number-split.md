# Twilio number split — 605 Good Dog vs Emmiwood

**As of 2026-08-12** (single KUP Twilio account `AC49a825…` / “My First Twilio Account”).

## Numbers

| Business | Number | Friendly name | Role |
|----------|--------|---------------|------|
| **605 Good Dog** | **+1 (605) 800-4499** | `605 Good Dog - Business Line` | Reserved **business / ops line** (voice + future 605GD SMS). **Not** Emmiwood appointment FROM. **Not** published on 605good.dog (NAP: no public `tel:`). |
| **Emmiwood Barbers** | **+1 (605) 250-3489** | `Emmiwood Barbers - Appointment SMS` | Dedicated **appointment / OTP SMS** sender. Bound to Emmiwood preview `TWILIO_FROM_NUMBER`. |

## Messaging / A2P

| Resource | Value | Notes |
|----------|--------|------|
| Brand | `BN74f922…` Sole Proprietor **APPROVED** (kup.solutions) | One brand on this account for now |
| Messaging Service | `MG89702f…` “Sole Proprietor A2P Messaging Service” | Emmiwood campaign host |
| Service phone members | **only** `+16052503489` | 605-800 is **detached** from this service |
| Campaign | `QE2c6890…` Sole Proprietor Usa2p | **IN_PROGRESS** as of 2026-08-12 (empty `errors[]`). Awaiting TCR **VERIFIED**. Prior failure was **30908** (SPA privacy not crawler-readable). |

## Design notes

- **Not a 5-digit short code.** Short codes are a separate, high-cost product. Emmiwood uses a normal **10-digit local (605)** number reserved only for booking SMS / admin OTP.
- **605 Good Dog** holds `(605) 800-4499` for internal/ops use only under NAP (no public `tel:` on site or GBP). A separate 605GD A2P campaign (or subaccount) can be planned when that product sends SMS at scale; Sole Proprietor is limited (typically one campaign / tight number rules).
- App still sends with **From = `TWILIO_FROM_NUMBER`** secret (Emmiwood’s 250-3489), not the Good Dog number.

## Campaign / privacy (updated 2026-08-12)

1. Privacy + SMS terms hardened for TCR **30908** (non-sharing of mobile/consent for marketing; frequency; Msg&Data rates; STOP/HELP).
2. **Static HTML** published under `client/public/emmiwood/privacy/` and `…/sms-terms/` so carrier crawlers see content without JS (React SPA alone failed 30908).
3. Live preview URLs return **200** with non-share language:
   - https://emmiwood-barbers-preview.pages.dev/emmiwood/privacy/
   - https://emmiwood-barbers-preview.pages.dev/emmiwood/sms-terms/
4. Failed campaign deleted; **new Sole Proprietor campaign** `QE2c6890…` on service `MG89702f…` with Emmiwood number **250-3489** only — status **IN_PROGRESS**.
5. **After VERIFIED:** retest OTP + booking SMS from **+16052503489** (exact-ID processor smoke). If **FAILED** again, inspect `errors[]` for 30908/30882 and strengthen static terms (HELP/STOP wording) before recreate.
6. 605 Good Dog public site still follows NAP (no public `tel:`); internal line documented in `605-good-dog/docs/brand/nap.md`.
