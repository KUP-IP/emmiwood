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
| Campaign | `QE2c6890…` Sole Proprietor Usa2p | **IN_PROGRESS** as of 2026-08-21 KUP Direct same-SID resubmit (empty `errors[]`). Public identity **KUP Solutions**. Prior **FAILED 30908**. Awaiting TCR **VERIFIED**. |

## Design notes

- **Not a 5-digit short code.** Short codes are a separate, high-cost product. Emmiwood uses a normal **10-digit local (605)** number reserved only for booking SMS / admin OTP.
- **605 Good Dog** holds `(605) 800-4499` for internal/ops use only under NAP (no public `tel:` on site or GBP). A separate 605GD A2P campaign (or subaccount) can be planned when that product sends SMS at scale; Sole Proprietor is limited (typically one campaign / tight number rules).
- App still sends with **From = `TWILIO_FROM_NUMBER`** secret (Emmiwood’s 250-3489), not the Good Dog number.

## Campaign / privacy (updated 2026-08-21)

1. Public messaging brand is **KUP Solutions**. Shop names are appointment details. SMS legal pages live on **kup.solutions/sms***.
2. **Static HTML** at `https://kup.solutions/sms`, `/sms/privacy`, `/sms/terms` (keywords in raw HTML, no JS). Shop aliases stub/redirect reviewers to that program. Opt-in evidence: `https://www.emmiwood.com/emmiwood/opt-in-evidence/`.
3. Canonical live URLs (no trailing-dot trap; do not cite pages.dev; do not cite `https://kup.solutions/privacy`):
   - https://kup.solutions/sms
   - https://kup.solutions/sms/privacy
   - https://kup.solutions/sms/terms
   - https://www.emmiwood.com/emmiwood/opt-in-evidence/
   - https://www.emmiwood.com/emmiwood/book (control location only; SPA)
4. Same campaign SID `QE2c6890…` only — **do not delete/recreate**. 2026-08-21 same-SID rewrite uses KUP Solutions description/message_flow/samples. Receipt: `docs/a2p-resubmit-receipt-2026-08-21.json`.
5. **After VERIFIED:** retest OTP + booking SMS from **+16052503489** (exact-ID processor smoke). Enqueue only `kup-appointment-texts-v1`. Scheduler and `EMMIWOOD_NOTIFICATION_URL` stay unset until that smoke + spend GO. If **FAILED** because message bodies must be the legal name (**30914**), stop Sole Prop Direct and file EIN → Low-Volume Standard — do not recreate this SID first.
6. 605 Good Dog public site still follows NAP (no public `tel:`); internal line documented in `605-good-dog/docs/brand/nap.md`.
