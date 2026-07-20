# Standalone Emmiwood Release Runbook

## Safety invariants
- Repository: KUP-IP/emmiwood only.
- Pages project: emmiwood only.
- D1 database: emmiwood-db only.
- Do not run standalone release commands against KUP production resources.
- Keep notifications disabled until the controlled delivery gate.

## Decision gates
The operating decisions are recorded in `docs/DECISIONS.md`.

Production provisioning remains blocked until:
- the final production domain is registered and verified;
- the Emmiwood-owned Cloudflare account and recovery identity exist;
- the Emmiwood owner mailbox exists;
- the approved Twilio and Resend sender identities exist;
- the GitHub plan upgrade and private-branch protection are complete.

The temporary Pages `*.pages.dev` hostname is preview-only and must not become the canonical production origin.

## Preview
1. Require green CI on main.
2. Create dedicated Pages and D1 resources.
3. Bind the dedicated D1 ID in wrangler.toml.
4. Set the approved public origin.
5. Apply migrations 0001-0005.
6. Deploy preview and run browser/accessibility verification.

## Production
1. Record a D1 backup and rollback bookmark.
2. Verify required configuration names without exposing values.
3. Keep scheduled processing disabled.
4. Deploy the approved commit.
5. Run readiness checks without processing deliveries.
6. Process exactly one approved synthetic notification.
7. Verify the provider message ID and terminal database state.

## Rollback
- Disable notification processing.
- Re-deploy the last known-good Pages commit.
- Restore D1 from the recorded bookmark when required.
