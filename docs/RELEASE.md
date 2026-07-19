# Standalone Emmiwood Release Runbook

## Safety invariants
- Repository: KUP-IP/emmiwood only.
- Pages project: emmiwood only.
- D1 database: emmiwood-db only.
- Do not run standalone release commands against KUP production resources.
- Keep notifications disabled until the controlled delivery gate.

## Decision gates
Resolve private issues #1-#3 before production provisioning.

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
