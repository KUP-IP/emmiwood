# Emmiwood Decision Ledger

Last updated: 2026-08-31

## Locked decisions

1. KUP owns and administers the Emmiwood Cloudflare account, domain registration, Pages project, D1 resources, and deployment credentials as a managed client service.
2. Preview / A2P host project is KUP Cloudflare Pages `emmiwood-barbers-preview` and D1 `emmiwood-standalone-preview-db` until a separate full production project is provisioned.
3. Domain **`emmiwood.com` is owned** (Namecheap). **Apex and www are both attached and HTTPS-live** on Pages project `emmiwood-barbers-preview`. **A2P and public policy URLs still use `https://www.emmiwood.com`** as the canonical origin (no pages.dev in live submissions).
4. The GitHub repository is public so branch protection can be enforced without a paid private-repository plan.
5. Version one is SMS-only for customer communication. Customer email is not collected in booking or operator-created appointments, and Resend provisioning is deferred.
6. SMS delivery will use a dedicated Emmiwood Twilio sender under a **KUP-managed Twilio account**. Delivery remains disabled until account setup, sender compliance, and one controlled synthetic test are complete.
7. Production administration uses two individual SMS-OTP accounts: Isaiah is the primary `owner`; Barro is `manager` with full administration access. Both handle support through their own accounts. No shared or third support login is seeded. The optional `kup_support` role remains read-only if introduced later.
8. GitHub CodeQL remains deferred by explicit decision. No CodeQL workflow is kept while it is deferred: a comments-only workflow is not a valid disabled workflow and creates a zero-job failure on every `main` push. Existing CI security tests and root/client high-severity dependency-audit gates remain required. Reintroducing CodeQL requires a later explicit decision and a complete, runnable workflow.
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
    - Campaign `QE2c6890…` (registry `CMcd97283…`): edit/resubmit **same SID only** (no delete/recreate). Sole Prop brand on file is **KUP Solutions**.
    - **Public SMS identity is KUP Solutions** (KUP Direct). Shop names are appointment payload, not a second messaging brand. Consent, samples, `renderSms`, and legal pages must say KUP Solutions — not Emmiwood as the From brand.
    - Campaign website / SMS privacy / SMS terms: **`https://kup.solutions/sms`**, **`https://kup.solutions/sms/privacy`**, **`https://kup.solutions/sms/terms`** (not The Bridge `/privacy`). Opt-in evidence: **`https://www.emmiwood.com/emmiwood/opt-in-evidence/`**. Book URL is cited only as the location of the control.
    - Consent version **`kup-appointment-texts-v1`**. Processor does not enqueue `appointment-texts-v1`.
    - **2026-08-21:** pre-POST inspect: campaign **FAILED** (not `IN_PROGRESS`); Usa2p has no title field; `brand_name` KUP Solutions; first/last Isaiah Peters. Same-SID POST → **IN_PROGRESS**, empty `errors[]`. Receipt: `docs/a2p-resubmit-receipt-2026-08-21.json`.
    - Live SMS retest only after campaign **VERIFIED**, exact-ID processor, From `+16052503489`, under spend GO. Scheduler stays **false** until that smoke.
    - If the next failure is **30914** requiring the legal name in **message bodies**, Sole Prop Direct is the wrong vehicle — EIN → Low-Volume Standard with the same KUP Solutions identity, not another Emmiwood filing.

15. **A2P host origin (amended 2026-08-15):** Custom domains **`emmiwood.com` and `www.emmiwood.com`** are attached and **active** on Pages project `emmiwood-barbers-preview`. Canonical public origin remains **`https://www.emmiwood.com`**. Google Workspace MX (`smtp.google.com`) and site verification TXT stay at Namecheap.

16. **Cloud-native development (2026-08-31):** Primary workspace is Cursor Cloud Agents. Secrets live in three planes — Cloudflare Pages (runtime/build), GitHub Actions (heartbeat + deploy/migrate token), Cursor Runtime Secrets (Wrangler token, processor secret). No local `.env` as source of truth. Production Pages `emmiwood` is Direct Upload with domains on that project; Git cannot be attached in place. `main` deploys via GitHub Actions after CI until an operator creates a **new** Git-connected Pages project and cuts domains over (`docs/CLOUD.md`). Live vars snapshot: origin `https://emmiwood.com`, booking writes `true`, notifications `true`. Apex-vs-www canonical redirect remains separate. D1 migrations stay gated. SMS handset proof stays Mac-only.

17. **Handoff SSOT (2026-08-31 recon):** Path A is the locked deploy model for client handoff. Index: [`docs/HANDOFF.md`](HANDOFF.md). Amends older lines that still described pre-cutover topology:
    - **#2 / #3 / #15 / #9 cutover sentence:** Custom domains `emmiwood.com` and `www.emmiwood.com` are attached to Pages project **`emmiwood`**, not `emmiwood-barbers-preview`. Preview project is `*.pages.dev` only. Dedicated production Pages + D1 already exist.
    - **Runtime origin:** `https://emmiwood.com` (`wrangler.toml` + live Pages production vars). A2P citations and opt-in evidence may keep `https://www.emmiwood.com` (same project; both hosts 200). Apex→www redirect remains a **separate GO** (do not “fix” in this amendment).
    - **#13 / #14 scheduler:** Production Pages `EMMIWOOD_NOTIFICATIONS_ENABLED=true`. GitHub Actions heartbeat **does** run the scheduled process-queue step (variable inferred `true` on 2026-08-31). Local `npm run dev` still binds notifications `false` and mock SMS. Non-production processor stays exact-`?id=` only. Do not disable the live scheduler in this amendment.
    - **Implementation “launch gates” paragraph:** Processor URL and scheduler are **set** on production; remaining gates are D1 remote migrate, live SMS POST, Path B, and apex redirect — each still needs its own GO.
    - **Cursor Cloud:** Effective environment may be a Personal dashboard snapshot; git [`.cursor/environment.json`](../.cursor/environment.json) is the install/start/terminals template and must stay in lockstep.

## Deferred

- Git-connected Pages project + domain cutover from Direct Upload `emmiwood` (Path B, operator dashboard; see `docs/CLOUD.md`). Out of handoff SSOT. Dedicated production Pages/D1 already exist.
- Resend and customer-facing email support until a later product version.
- GitHub CodeQL until a later explicit decision.
- Google Calendar synchronization with bookings.
- Inbound SMS keyword cancel (reply CANCEL).

## Implementation details

- Cloudflare Pages project `emmiwood` currently serves `emmiwood.com` / `www.emmiwood.com` (Direct Upload). Preview project `emmiwood-barbers-preview` is pages.dev only until Path B (`docs/CLOUD.md`, decision 17).
- Customer email collection is removed from public and operator booking forms.
- KUP-managed Twilio account and dedicated Emmiwood sender `+16052503489` are live (see `docs/twilio-number-split.md`).
- GitHub repository is public with enforceable branch protections.
- Production admin auth is SMS OTP to the two allowlisted individual phones (Issue #17 remaining: production login evidence).
- Resend is decoupled from `notificationReadiness` / release preflight for SMS-only v1.
- Production notification heartbeat and scheduler variables are live (decision 17). D1 remote migrate, live SMS POST, Path B, and apex→www redirect stay GO-gated.
