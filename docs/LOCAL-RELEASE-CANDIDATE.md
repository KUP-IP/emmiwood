# Local release candidate — 2026-08-30

## Contract and delivery boundary

Scope: the operator-approved Emmiwood launch plan, implemented on
`codex/emmiwood-release-candidate`. This report is **local evidence**, not a
production launch receipt. Nothing here authorizes a push, PR, merge, deployment,
production database change, domain transfer, OTP/SMS send, or scheduler activation.

The project-bounded `web-dev` v3.3.0 alternate execution contract is local
exact-artifact work only. This run supplies behavioral evidence for later SKILLS
review; it does not promote or modify the skill. Review followed its D1/D2/D3
inventory, critique, correction, and independent re-audit protocol.

Fresh Bridge receipt: `551430A5-954A-4A4D-92F4-EA35472B4D9F`,
2026-08-30T12:57:41Z, COMPLETE / FULL, doctrine v7.3.0, integrity VERIFIED.
Telemetry reference: `C07D3767-0010-492D-92C5-C6F5FAA081B5`.

## Inventory and verification lanes

| Surface family | States and requirements covered |
| --- | --- |
| Public | Header/footer EWB marks, hero lockup, navigation/skip focus, service/barber content, shop hours/next opening, visit, chair rental, legal and consent-evidence pages |
| Guest booking | Choices, eligibility, day/time tabs and keyboard order, selected time, pending/empty/failed availability, retry, guest validation, consent, review, conflict, pending submission, confirmation |
| Catalog transitions | Empty/replaced catalog, late barber removal in details/review, service replacement during a failed pending booking; customer details preserved |
| Management | Missing/expired private access, transient token-exchange retry, fragment removal/HttpOnly session, reschedule conflict, cancellation dialog, Escape/focus restoration, cancelled success |
| Staff | Phone/code entry, dashboard loading/failure/retry, successful OTP followed by dashboard failure, Today/Book/Shop, Hours/Closures/Team/Services/Customers/Texts, empty states, editors, pending saves, duplicate submissions, logout failure |
| Brand channels | Source/crop fidelity, private masters/exports, runtime dimensions and file allowlist, artifact byte equality, header/app/favicons/maskable/touch/social assets, install manifest, canonical metadata |

Rubric: task hierarchy, clear choices, consistent navigation and language, feedback,
error recovery, keyboard/focus behavior, readable contrast, responsive reflow,
touch controls, reduced motion, brand consistency, and honest loading/empty states.
Widths: 320, 430, 768, and 1440 CSS pixels, plus the standard desktop/mobile suite.
Chromium runs the complete local suite; Firefox and WebKit run critical read-only
smoke. Automated Axe checks reject serious/critical findings. These do not alone
prove full WCAG conformance or every assistive-technology experience.

## Findings corrected in this candidate

- P1: clipped/distorted EWB marks; replaced reconstructed app letterforms with
  pixel-verified source crops and deterministic resizes.
- P1: availability callback identity restarted searches; day changes/refreshes
  could retain stale selected times. Added stable callbacks, invalidation,
  keyboard tabs, unique relationships, and regressions.
- P1: staff all-day closures submitted invalid zero-length/empty foreign-key
  values. All-day closures now use 0–1440 minutes and a null shop-wide barber.
- P1: abbreviated deployment hashes were accepted as release provenance. Require
  the exact full SHA from authenticated raw deployment metadata.
- P1: readiness credentials could be directed to unvalidated URLs. Enforce exact
  approved HTTPS endpoint/origin, reject credentials in URLs and redirects.
- P2: legal presentation/metadata inconsistency; alias privacy retention parity;
  public next-opening outage incorrectly resembled a fully booked week.
- P2: booking progress, period counts, and unavailable-selected tab contrast.
- P2: late catalog changes could erase the active booking stage; return to usable
  choices while preserving details, and reconcile after pending mutations.
- P2: duplicate asynchronous submissions, stale reused editors, missing editor
  focus, input snapshots after disabling, and unclear staff failure feedback.
- P2: a successful OTP followed by dashboard failure stranded the consumed-code
  form. Retry now loads the dashboard without sending or consuming another code.
- P2: 320px staff header clipped Sign out despite a passing document-width check;
  wrap the account row and assert control bounds. The short workspace navigation
  no longer stretches to fill spare vertical space.
- P2: cancelling the confirmation dialog failed to return keyboard focus; restore
  the connected, enabled trigger explicitly after the dialog unmounts.

P3 retained: John's initial-based profile placeholder; no approved portrait was
provided. Do not substitute an invented person or photograph.

## Evidence custody

`scripts/prepare-e2e-artifact.mjs` builds the site, copies static assets/functions
into `.deploy/pages`, records source HEAD/branch/dirty state and SHA-256 per file,
and migrates only a fresh isolated local D1. It does not copy production secrets.
Browser writes in the integration suite affect this disposable database only;
additional audit suites intercept synthetic API traffic. Notification processing
is disabled throughout the local lane.

- Exact artifact identity: `.deploy/pages/artifact-manifest.json`.
- Earlier-pass comparison screenshots: `test-results/emmiwood-*/` (unprefixed
  desktop/mobile directories retained separately from the final Chromium lane).
- Chromium screenshots/traces: `test-results/chromium/`.
- Cross-browser screenshots/traces: `test-results/cross-browser/`.
- HTML reports: `playwright-report/emmiwood/` and
  `playwright-report/emmiwood-cross-browser/`.
- CI retains reports and the artifact manifest for 14 days with an always-run
  evidence upload step. CI itself remains unproven until the push/PR gate.

Reproduce the machine gates from a clean checkout:

```sh
npm test
npm run test:e2e:live:contract
npm run test:brand
npm run test:e2e:isolated
node scripts/brand-assets-check.mjs .deploy/pages/static
npm run test:e2e:cross-browser
./scripts/verify-migrations.sh
npm audit --audit-level=high
npm audit --prefix client --audit-level=high
```

Playwright requires its pinned Chromium, Firefox, and WebKit revisions. The
matching Firefox/WebKit test binaries were added to the local cache with garbage
collection disabled; older versions were preserved. These are test dependencies,
not changes to the user's installed browsers or production.

The migration rehearsal applied 0001–0010, repeated migration application without
changes, backed up, deliberately changed the disposable shop, restored, and
matched dump SHA-256
`1c70f0c1cc11bd54ee5888eca1f1d3bcef4b3a6af2553788c623d248634dfc64`.
This is **not** a production D1 backup receipt or a deployed-code rollback proof.

## Remaining proof and approval gates

- Native browser zoom has not been proven. The in-app browser's zoom shortcut
  did not change viewport/DPR/scale; the temporary tab was restored and closed.
  Narrow-width reflow is verified separately, never relabeled as native zoom.
- Operator review remains necessary for visual acceptance and any newly discovered
  P2 exception. Do not mark exhaustive UI acceptance complete from test counts.
- External map rendering, actual install/home-screen behavior and platform social
  preview caches require their corresponding environment checks.
- Push/PR and CI; merge; production provisioning/migrations/two-admin seed;
  domain cutover; booking writes; exact administrator OTP recipients; exact-ID
  synthetic SMS; scheduler activation are separate Ship Gates.
- Neither production nor preview has been changed by this local run. Remote main,
  deployed SHA, D1, domains, recipient delivery, heartbeat and project status must
  be read live at their gate. No issue is closed and the project is not Done.

The production runbook is `docs/RELEASE.md`. Reconcile every remaining gate and
attach merged/live receipts before closing #17, #45, #46, #49, or #50.
