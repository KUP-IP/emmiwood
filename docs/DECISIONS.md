# Emmiwood Decision Ledger

Last updated: 2026-07-22

## Locked decisions

1. KUP owns and administers the Emmiwood Cloudflare account, domain registration, Pages project, D1 resources, and deployment credentials as a managed client service.
2. Preview uses the existing KUP Cloudflare project `emmiwood-barbers-preview` and database `emmiwood-standalone-preview-db` until production-domain setup is complete.
3. The intended production domain is `emmiwood.com`, but purchase is deferred until availability and ownership verification are complete.
4. The GitHub repository is public so branch protection can be enforced without a paid private-repository plan.
5. Version one is SMS-only for customer communication. Customer email is not collected in booking or operator-created appointments, and Resend provisioning is deferred.
6. SMS delivery will use a dedicated Emmiwood Twilio sender under a **KUP-managed Twilio account**. Delivery remains disabled until account setup, sender compliance, and one controlled synthetic test are complete.
7. KUP receives permanent read-only `kup_support` access. That role must remain excluded from all mutation operations.
8. GitHub CodeQL remains deferred by explicit decision. Existing CI security tests and root/client high-severity dependency-audit gates remain required.
9. Canonical product home (identity consolidation, 2026-07-21):
   - Local checkout: `/Users/keepup/Developer/emmiwood`
   - GitHub: `KUP-IP/emmiwood` (do not rename the repo or local folder to include `.com` while the domain is unpurchased)
   - The Vite-only husk `/Users/keepup/Developer/emmiwood-release-remediation` is retired and must not be treated as a second Emmiwood home
   - `emmiwood.com` remains the deferred production domain target only — not a live owned origin and not a substitute for the repo/folder name until a separate domain cutover contract says otherwise
   - Intentional alias residue (do not “fix” by renaming in this slice): npm `emmiwood` / `emmiwood-client`; Wrangler name `emmiwood`; Cloudflare preview `emmiwood-barbers-preview`; Notion FOCUS title “Emmiwood / OBK Website + Booking System”
10. Production administrator authentication for v1 is **SMS one-time codes to allowlisted administrator phone numbers** (E.164). Email OTP / Resend is not used for admin sign-in in v1.
11. Production notification readiness for v1 requires only the processor secret and Twilio SMS credentials. Resend / `EMAIL_FROM` remain deferred and must not block SMS readiness.

## Deferred

- Purchase and configure `emmiwood.com` after verification.
- Resend and customer-facing email support until a later product version.
- GitHub CodeQL until a later explicit decision.

## Implementation details

- Deploy standalone `main` to the KUP-owned preview project and bind `emmiwood-standalone-preview-db`.
- Remove customer email collection from the public and operator booking forms.
- Create the KUP-managed Twilio account and dedicated Emmiwood sender when the operator supplies required identity, verification, and billing inputs (see `docs/twilio-human-packet.md`).
- Make the GitHub repository public and apply enforceable branch protections.
- Replace production admin email OTP with SMS OTP to allowlisted phones (Issue #17).
- Decouple Resend from `notificationReadiness` / release preflight for SMS-only v1.
