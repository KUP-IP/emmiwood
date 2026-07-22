# Standalone Emmiwood Release Runbook

## Safety invariants
- Repository: `KUP-IP/emmiwood` only.
- Preview Pages project: `emmiwood-barbers-preview` only.
- Preview D1 database: `emmiwood-standalone-preview-db` only.
- Production resources must use dedicated Emmiwood names even though KUP owns and administers the account.
- Keep notification processing disabled until the controlled delivery gate.

## Decision gates
The operating decisions are recorded in `docs/DECISIONS.md`.

Production provisioning remains blocked until:
- a production D1 database and Pages target exist;
- SMS administrator authentication (allowlisted phones) is implemented;
- the KUP-managed Twilio account and dedicated Emmiwood sender exist;
- public-repository branch protection is active.

Customer email and Resend are out of scope for version one.
`emmiwood.com` remains deferred and does not block preview or SMS-first production provisioning.
The temporary Pages `*.pages.dev` hostname is preview-only and must not become the canonical production origin.

## Preview
1. Require green CI on `main`.
2. Use `wrangler.preview.toml` and the KUP-owned preview resources.
3. Apply migrations `0001`–`0006` to `emmiwood-standalone-preview-db`.
4. Deploy the standalone build to `emmiwood-barbers-preview`.
5. Verify the project apex serves Emmiwood—not KUP—and that metadata, assets, and APIs are standalone.
6. Keep all real notification delivery disabled.

## Production
1. Record a D1 backup and rollback bookmark.
2. Verify required configuration names without exposing values.
3. Keep scheduled processing disabled.
4. Deploy the approved commit.
5. Run readiness checks without processing deliveries.
6. Process exactly one approved synthetic SMS.
7. Verify the Twilio message ID and terminal database state.

## Rollback
- Disable notification processing.
- Re-deploy the last known-good Pages commit.
- Restore D1 from the recorded bookmark when required.
