# Emmiwood Decision Ledger

Last updated: 2026-07-20

## Locked decisions

1. KUP owns and administers the Emmiwood Cloudflare account, domain registration, Pages project, D1 resources, and deployment credentials as a managed client service.
2. Preview uses the existing KUP Cloudflare project `emmiwood-barbers-preview` and database `emmiwood-standalone-preview-db` until production-domain setup is complete.
3. The intended production domain is `emmiwood.com`, but purchase is deferred until availability and ownership verification are complete.
4. The GitHub repository is public so branch protection can be enforced without a paid private-repository plan.
5. Version one is SMS-only for customer communication. Customer email is not collected in booking or operator-created appointments, and Resend provisioning is deferred.
6. SMS delivery will use a dedicated Emmiwood Twilio account and number. Delivery remains disabled until account setup, sender compliance, and one controlled synthetic test are complete.
7. KUP receives permanent read-only `kup_support` access. That role must remain excluded from all mutation operations.
8. GitHub CodeQL remains deferred by explicit decision. Existing CI security tests and root/client high-severity dependency-audit gates remain required.

## Open consequential decision

Production administrator authentication currently uses email one-time codes through Resend. An SMS-only v1 requires selecting a replacement production admin-auth method before launch.

## Deferred

- Purchase and configure `emmiwood.com` after verification.
- Resend and customer-facing email support until a later product version.
- GitHub CodeQL until a later explicit decision.

## Implementation details

- Deploy standalone `main` to the KUP-owned preview project and bind `emmiwood-standalone-preview-db`.
- Remove customer email collection from the public and operator booking forms.
- Create the Twilio account and dedicated sender when the operator supplies required identity, verification, and billing inputs.
- Make the GitHub repository public and apply enforceable branch protections.
- Replace production admin email OTP after the authentication decision is locked.
