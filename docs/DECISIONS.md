# Emmiwood Decision Ledger

Last updated: 2026-08-15

## Locked decisions

1. KUP owns and administers the Emmiwood Cloudflare account, domain registration, Pages project, D1 resources, and deployment credentials as a managed client service.
2. Preview / A2P host project is KUP Cloudflare Pages `emmiwood-barbers-preview` and D1 `emmiwood-standalone-preview-db` until a separate full production project is provisioned.
3. Domain **`emmiwood.com` is owned** (Namecheap). **Apex and www are both attached and HTTPS-live** on Pages project `emmiwood-barbers-preview`. **A2P and public policy URLs still use `https://www.emmiwood.com`** as the canonical origin (no pages.dev in live submissions).
4. The GitHub repository is public so branch protection can be enforced without a paid private-repository plan.
5. Version one is SMS-only for customer communication. Customer email is not collected in booking or operator-created appointments, and Resend provisioning is deferred.
6. SMS delivery will use a dedicated Emmiwood Twilio sender under a **KUP-managed Twilio account**. Delivery remains disabled until account setup, sender compliance, and one controlled synthetic test are complete.
7. KUP receives permanent read-only `kup_support` access. That role must remain excluded from all mutation operations.
8. GitHub CodeQL remains deferred by explicit decision. Existing CI security tests and root/client high-severity dependency-audit gates remain required.
9. Canonical product home (identity consolidation, 2026-07-21):
   - Local checkout: `/Users/keepup/Developer/emmiwood`
   - GitHub: `KUP-IP/emmiwood` (do not rename the repo or local folder to include `.com`; alias residue is intentional)
   - The Vite-only husk `/Users/keepup/Developer/emmiwood-release-remediation` is retired and must not be treated as a second Emmiwood home
   - `emmiwood.com` (apex) and `www.emmiwood.com` are live on Pages. A dedicated production Pages/D1 stack remains separate cutover work.
   - Intentional alias residue (do not “fix” by renaming in this slice): npm `emmiwood` / `emmiwood-client`; Wrangler name `emmiwood`; Cloudflare preview `emmiwood-barbers-preview`; Notion FOCUS title “Emmiwood / OBK Website + Booking System”
10. Production administrator authentication for v1 is **SMS one-time codes to allowlisted administrator phone numbers** (E.164). Email OTP / Resend is not used for admin sign-in in v1.
11. Production notification readiness for v1 requires only the processor secret and Twilio SMS credentials. Resend / `EMAIL_FROM` remain deferred and must not block SMS readiness.
12. **Barro review / v1 shop policy (2026-07-23 walkthrough; codified 2026-08-11):**
    - Minimum booking notice: **0** (any open future slot; past starts rejected).
    - Customer cancel/reschedule: allowed **until appointment start** (`change_cutoff_minutes = 0`).
    - Appointment windows: **9:00–12:00** and **17:00–19:00**; walk-in / no online booking **12:00–17:00**.
    - Menu/durations/prices per migrations `0007`–`0009` and seed defaults (Kids Cut, hot-towel $5 add-on copy).
    - Customer cancel-via-text for launch means a **manage link in SMS** (absolute origin URL), not inbound keyword CANCEL.
    - Google Calendar sync remains **out of launch scope** until a separate decision.
    - Preview D1 already applied `0007`–`0009` on 2026-07-24; git must keep those migrations so new environments reproduce.
13. **SMS Wave 2 (2026-08-11):**
    - Confirmation/reminder/reschedule SMS include **when + service + barber** and absolute **Manage/cancel** URL from `EMMIWOOD_PUBLIC_ORIGIN`.
    - Twilio is selected whenever all three Twilio secrets are present (including preview for controlled smoke). Without secrets, non-production stays mock; production fails closed.
    - Non-production notification **processor requires exact `?id=`** — bulk process is production-only.
    - Scheduler `EMMIWOOD_NOTIFICATIONS_ENABLED` remains **false** until an approved exact-ID synthetic smoke is recorded.
    - Admin OTP allowlist uses a real owner E.164 (seed `+16055550199` replaced). Preview D1 owner is `admin-isaiah`.
14. **Twilio number split + A2P (2026-08-12):**
    - Emmiwood appointment/OTP From is **`+16052503489`** only (Messaging Service `MG89702f…`).
    - 605 Good Dog holds **`+16058004499`** as an **internal** business line; public NAP remains **no `tel:`** on 605good.dog / GBP.
    - A2P Sole Prop brand **APPROVED** / identity **VERIFIED**.
    - Campaign `QE2c6890…` (registry `CMcd97283…`): edit/resubmit **same SID only** (no delete/recreate). Sole Prop brand on file is **KUP Solutions**; public SMS identity is **Emmiwood Barbers**, with KUP named as technology operator in `message_flow` / privacy.
    - Message flow and samples use **`https://www.emmiwood.com/emmiwood/{book,privacy,sms-terms,opt-in-evidence}`** (no trailing-dot URL trap; no pages.dev in live submission).
    - Static crawler HTML for privacy/sms-terms/opt-in-evidence is required for TCR **30908/30909**.
    - Live SMS retest only after campaign **VERIFIED**, exact-ID processor, From `+16052503489`, under spend GO. Scheduler stays **false** until that smoke.
    - **2026-08-15:** campaign was **FAILED / 30908**. Same-SID POST resubmit accepted (`IN_PROGRESS`, empty `errors[]`). Stronger `message_flow` cites opt-in-evidence + labeled Privacy/SMS terms + KUP-as-operator (no trailing-dot URLs). If the next failure is **30914/30918** (identity), stop and register a Standard/Low-Volume brand with EIN — do not delete/recreate this SID first.
15. **A2P host origin (amended 2026-08-15):** Custom domains **`emmiwood.com` and `www.emmiwood.com`** are attached and **active** on Pages project `emmiwood-barbers-preview`. Canonical public origin remains **`https://www.emmiwood.com`**. Google Workspace MX (`smtp.google.com`) and site verification TXT stay at Namecheap.

## Deferred

- Dedicated production Pages project + D1 (separate from `emmiwood-barbers-preview`).
- Resend and customer-facing email support until a later product version.
- GitHub CodeQL until a later explicit decision.
- Google Calendar synchronization with bookings.
- Inbound SMS keyword cancel (reply CANCEL).

## Implementation details

- Standalone `main` deploys to KUP-owned preview project `emmiwood-barbers-preview` with D1 `emmiwood-standalone-preview-db`.
- Customer email collection is removed from public and operator booking forms.
- KUP-managed Twilio account and dedicated Emmiwood sender `+16052503489` are live (see `docs/twilio-number-split.md`).
- GitHub repository is public with enforceable branch protections.
- Production admin auth is SMS OTP to allowlisted phones (Issue #17 remaining: production login after A2P VERIFIED; recovery/second phone).
- Resend is decoupled from `notificationReadiness` / release preflight for SMS-only v1.
- Launch gates (hardened): **Preview-GO** (code+policy on preview, SMS smoke with exact outbox ID) is separate from **Prod-GO** (dedicated prod Pages/D1, secrets, origin) and **Commercial-GO**. Scheduler and `EMMIWOOD_NOTIFICATION_URL` stay unset until VERIFIED + spend GO.
