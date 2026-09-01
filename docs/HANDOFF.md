# Emmiwood client handoff

Single index for what is live, where truth lives, and what is still residual. Operational detail stays in [`CLOUD.md`](CLOUD.md), [`RELEASE.md`](RELEASE.md), and [`DECISIONS.md`](DECISIONS.md). If those files disagree with this page on a **live** fact, this page plus Cloudflare/GitHub win until the ledger is amended.

**Recon date:** 2026-08-31. **Operator lock 2026-09-01:** Path A (GitHub Actions Direct Upload) is the handoff deploy SSOT. Path B (new Git-connected Pages project) stays residual.

## Live shop

| Surface | Value |
|---|---|
| Git | `KUP-IP/emmiwood`, default branch `main` |
| Production Pages | `emmiwood` — Direct Upload, Git Provider **No** |
| Production domains | `emmiwood.com`, `www.emmiwood.com`, `emmiwood.pages.dev` (all 200; **no** apex→www redirect) |
| Runtime origin | `EMMIWOOD_PUBLIC_ORIGIN=https://emmiwood.com` |
| Production D1 | `emmiwood-db` `a79f099e-396f-4466-801c-2458a0c2b3e2` — migrations `0001`–`0010` applied |
| Preview Pages | `emmiwood-barbers-preview` — Direct Upload, `*.pages.dev` only |
| Preview D1 | `emmiwood-standalone-preview-db` `b4a10012-e0c8-40f0-b203-31474393fb2a` — `0001`–`0010` applied |
| Writes / notifications (Pages production) | both `true` |
| SMS | Twilio From `+16052503489`; public brand **KUP Solutions** |
| Canonical production SHA (recon) | `919bff7` on Pages deploy `cd658fb8` |

A2P filings and opt-in evidence URLs cite `https://www.emmiwood.com`. That host is live on the same production project. Do not add an apex→www redirect without a separate GO.

## Branch and deploy

```text
PR  -->  GitHub Actions job verify  (no Pages deploy)
main -->  verify, then deploy Direct Upload to Pages project emmiwood
          (only when vars.EMMIWOOD_CLOUD_DEPLOY == true)
```

- There is no Git-connected preview per PR. Cloudflare preview project `emmiwood-barbers-preview` is a separate Direct Upload target (last recon: branch name `review` on Cloudflare, not a git branch).
- D1 schema does **not** ride with code deploy. Remote migrate: workflow **D1 remote migrations** with phrase `APPLY-REMOTE-MIGRATIONS`, or `npm run db:migrate:remote:*` after an explicit GO.
- Local Cloud Agent: `npm run dev` on `127.0.0.1:8788` with preview bindings and mock SMS unless Twilio is in `.dev.vars`.

## Secret planes

Never commit values. Names only:

| Plane | Owns |
|---|---|
| Cloudflare Pages | Twilio, `EMMIWOOD_NOTIFICATION_SECRET`, `EMMIWOOD_RELEASE_SHA`, feature flags (also in `wrangler.toml`), D1 bind, Vite **build** vars |
| GitHub Actions | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, heartbeat `EMMIWOOD_NOTIFICATION_SECRET`, vars `EMMIWOOD_CLOUD_DEPLOY`, `EMMIWOOD_NOTIFICATION_URL`, `EMMIWOOD_NOTIFICATIONS_ENABLED`; environments `production` and `preview` |
| Cursor Cloud Agents | Runtime Secrets: `CLOUDFLARE_API_TOKEN`, `EMMIWOOD_NOTIFICATION_SECRET`; env `CLOUDFLARE_ACCOUNT_ID`; optional Maps key and admin-seed PII. **No Twilio** |

`.dev.vars` / `.env` are gitignored. Cloud start runs `scripts/write-dev-vars-from-env.mjs`.

## Development environment

- **Effective** Cursor Cloud environment for recon: Personal dashboard [`b46d7d23-a550-11f1-a7d1-d6b4613131ce`](https://cursor.com/dashboard/cloud-agents/environments/e/b46d7d23-a550-11f1-a7d1-d6b4613131ce) (not repo-file managed).
- **Template in git:** [`.cursor/environment.json`](../.cursor/environment.json) (`npm ci`, Playwright Chromium, start writes `.dev.vars` + build + local D1, terminal `npm run dev`). Keep this file identical to the dashboard install/start/terminals so the two sources do not drift.
- No `.mcp.json` in this repo. Product work does not require The Bridge. Cloud Agents use dashboard MCP/plugins (GitHub `gh`, Cloudflare via Wrangler token). Mac-only: handset `chat.db`, Keychain.

## Verify

```bash
npm ci && npm ci --prefix client
npm test
npm run test:e2e:isolated
```

Do not run `db:migrate:remote:production` or live SMS processor POSTs without an explicit GO.

## Residual (out of this handoff SSOT)

- **Shop-admin SMS fanout:** code is behind `EMMIWOOD_SHOP_ADMIN_SMS_FANOUT` (default/missing `false`). Do not set production to `true` without an explicit GO plus preview exact-id or production synthetic smoke.
- **Path B:** new Git-connected Pages project + domain cutover (`docs/CLOUD.md`). Do not attach Git to existing Direct Upload projects.
- Apex→www canonical redirect.
- Cursor environment: switch Personal dashboard → repo-managed `.cursor/environment.json` (operator dashboard).
- Cloudflare preview-slot leftover origin `https://www.emmiwood.com` on project `emmiwood-barbers-preview` (unused slot; live preview-slot of that project is pages.dev).
- Open product issues: [#17](https://github.com/KUP-IP/emmiwood/issues/17) admin login evidence, [#49](https://github.com/KUP-IP/emmiwood/issues/49) brand mark, [#50](https://github.com/KUP-IP/emmiwood/issues/50) UI audit. [#45](https://github.com/KUP-IP/emmiwood/issues/45) is likely addressed by `919bff7` (main CI green). [#46](https://github.com/KUP-IP/emmiwood/issues/46) CodeQL comments-only — no CodeQL workflow is in `.github/workflows` (decision 8).
- Dependabot PR [#51](https://github.com/KUP-IP/emmiwood/pull/51) Wrangler 4.125 → 4.127.
- Wrangler API token lacks User Details Read (whoami email missing; Pages/D1 still work).
