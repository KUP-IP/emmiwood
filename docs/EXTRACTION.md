# Repository extraction record

- Source repository: `KUP-IP/kup.solutions`
- Source candidate: `1ca43dc4db0d102eec3adebea741788d4142f1e5`
- Contaminated PR: `KUP-IP/kup.solutions#92`
- Extraction date: 2026-07-19
- Production changes performed: none

## Boundary

Copied only the Emmiwood customer/admin frontend, `/api/emmiwood` Pages Functions, `functions/lib/emmiwood-*`, tests, notification workflow, and release documentation. The KUP website shell, portal, billing, analytics, shared navigation, and KUP deployment scripts were excluded.

## Migration remap

- `0013_emmiwood_booking.sql` → `0001_booking.sql`
- `0014_emmiwood_launch_copy.sql` → `0002_launch_copy.sql`
- `0015_emmiwood_production_hardening.sql` → `0003_production_hardening.sql`
- `0016_emmiwood_auth_source_limits.sql` → `0004_auth_source_limits.sql`
- `0017_emmiwood_pricing_and_copy.sql` → `0005_pricing_and_copy.sql`
