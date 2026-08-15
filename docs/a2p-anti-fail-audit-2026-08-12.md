# A2P anti-fail audit (updated 2026-08-15)

Campaign `QE2c6890da8086d771620e9b13fadeba0b` · 2026-08-15 POST → **IN_PROGRESS** (empty `errors[]`) · prior **FAILED / 30908** · brand **APPROVED** / identity **VERIFIED** (`brand_name` = KUP Solutions).

## Research basis
- Twilio **30908** (privacy): public policy, non-share statement for mobile/consent, collection/use, frequency + rates; link in `message_flow`.
- Twilio **30909** (message flow): describe opt-in path, privacy + terms links, frequency + rates, public verifiability.
- Identity mismatch risk: Sole Prop brand **KUP Solutions** vs public SMS **Emmiwood Barbers**. Mitigate in `message_flow` (KUP as service provider). Next failure **30914/30918** → Standard/EIN brand, not delete/recreate.

## Checklist vs live package (2026-08-15 resubmit)

| Check | Result |
|-------|--------|
| Privacy URL in message_flow | `https://www.emmiwood.com/emmiwood/privacy` (labeled, no trailing-dot trap) |
| Privacy static HTML 200 | Yes; non-share language matches Twilio pass example |
| Frequency + rates in privacy | Yes |
| SMS terms URL in message_flow | `https://www.emmiwood.com/emmiwood/sms-terms` |
| Opt-in evidence in message_flow | `https://www.emmiwood.com/emmiwood/opt-in-evidence/` |
| No trailing-dot URL trap | Yes |
| No pages.dev in live message_flow | Yes |
| Brand APPROVED / identity VERIFIED | Yes (KUP Solutions) |
| Samples brand name + STOP | Yes; manage links on www |
| KUP named as tech operator | Yes (message_flow + privacy page) |
| Use case SOLE_PROPRIETOR transactional | Yes |
| Book SPA not crawlable for checkbox | Residual **30909** risk; mitigated by opt-in-evidence URL |

## Do not
- Delete/recreate campaign (recharges ~$15).
- Smoke SMS until VERIFIED + spend GO.
- Enable GitHub scheduler / set `EMMIWOOD_NOTIFICATION_URL`.
- Start a Standard/EIN brand unless this resubmit fails on identity (30914/30918).
