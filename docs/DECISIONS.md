# Emmiwood Decision Ledger

Last updated: 2026-07-20

## Locked decisions

1. Preview uses the Cloudflare Pages temporary `*.pages.dev` hostname until production-domain setup is complete.
2. Production uses a dedicated Emmiwood domain. The intended hostname is `emmiwood.com`, pending successful registration.
3. Cloudflare resources live in a separate Emmiwood-owned account. KUP administers that account for the client through named user access.
4. The production owner administrator uses an Emmiwood-owned mailbox. The inherited KUP address is development-only.
5. KUP receives permanent read-only `kup_support` access. That role must remain excluded from all mutation operations.
6. Messaging uses an Emmiwood-authenticated Resend sender and a dedicated Emmiwood Twilio number. Delivery remains disabled until a controlled synthetic test passes.
7. The GitHub organization will be upgraded so private-branch protection can require pull requests, the `verify` check, linear history, and blocks on force pushes and deletion.
8. GitHub Code Security is deferred. Private-repository CodeQL remains disabled until a later explicit purchase decision; the existing CI security tests and root/client high-severity dependency-audit gates remain required.

## Open consequential decisions

None.

## Implementation details

- Register and verify the final production domain.
- Create the Emmiwood Cloudflare account and recovery identity.
- Add named KUP administrators.
- Create the Emmiwood owner mailbox.
- Provision the Twilio number and Resend sender.
- Upgrade GitHub and apply the branch rule.
