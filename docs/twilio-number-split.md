# Twilio number split — 605 Good Dog vs Emmiwood

**As of 2026-08-11** (single KUP Twilio account `AC49a825…` / “My First Twilio Account”).

## Numbers

| Business | Number | Friendly name | Role |
|----------|--------|---------------|------|
| **605 Good Dog** | **+1 (605) 800-4499** | `605 Good Dog - Business Line` | Intended **business / public line** (voice + future 605GD SMS). **Not** used as Emmiwood appointment FROM. |
| **Emmiwood Barbers** | **+1 (605) 250-3489** | `Emmiwood Barbers - Appointment SMS` | Dedicated **appointment / OTP SMS** sender. Bound to Emmiwood preview `TWILIO_FROM_NUMBER`. |

## Messaging / A2P

| Resource | Value | Notes |
|----------|--------|------|
| Brand | `BN74f922…` Sole Proprietor **APPROVED** (kup.solutions) | One brand on this account for now |
| Messaging Service | `MG89702f…` “Sole Proprietor A2P Messaging Service” | Emmiwood campaign host |
| Service phone members | **only** `+16052503489` | 605-800 was **detached** from this service |
| Campaign | Status **FAILED** (error **30908** — privacy policy not verifiable) | Must rework privacy page + resubmit before US delivery works |

## Design notes

- **Not a 5-digit short code.** Short codes are a separate, high-cost product. Emmiwood uses a normal **10-digit local (605)** number reserved only for booking SMS / admin OTP.
- **605 Good Dog** can keep `(605) 800-4499` for the public business line. A separate 605GD A2P campaign (or subaccount) can be planned when that product sends SMS at scale; Sole Proprietor is limited (typically one campaign / tight number rules).
- App still sends with **From = `TWILIO_FROM_NUMBER`** secret (now Emmiwood’s 250-3489), not the Good Dog number.

## Campaign / privacy (updated 2026-08-11)

1. Privacy + SMS terms hardened for TCR **30908** (non-sharing of mobile/consent for marketing; frequency; Msg&Data rates; STOP/HELP).
2. Failed campaign deleted; **new Sole Proprietor campaign resubmitted** on service `MG89702f…` with Emmiwood number **250-3489** attached — status starts **IN_PROGRESS**.
3. Wait for campaign **VERIFIED**, then retest OTP + booking SMS from **+16052503489**.
4. 605 Good Dog public site still follows NAP (no public `tel:`); internal line documented in `605-good-dog/docs/brand/nap.md`.
