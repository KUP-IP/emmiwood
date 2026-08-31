# Cloud development and secret planes

Emmiwood develops and deploys from the cloud. A laptop is optional. Git hosting stays `KUP-IP/emmiwood`.

Handoff index (live topology, branch strategy, residuals): [`HANDOFF.md`](HANDOFF.md).

Live snapshot (2026-08-31, names and non-secret vars only):

| Pages project | Git | Domains | Vars |
|---|---|---|---|
| `emmiwood` | No (Direct Upload) | `emmiwood.pages.dev`, `emmiwood.com`, `www.emmiwood.com` | `ENVIRONMENT=production`, `EMMIWOOD_PUBLIC_ORIGIN=https://emmiwood.com`, writes `true`, notifications `true` |
| `emmiwood-barbers-preview` | No | `emmiwood-barbers-preview.pages.dev` | `ENVIRONMENT=preview`, origin `https://emmiwood-barbers-preview.pages.dev`, writes `true`, notifications `false` |

Pages secrets on both projects (values encrypted): `EMMIWOOD_NOTIFICATION_SECRET`, `EMMIWOOD_RELEASE_SHA`, `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.

`wrangler.toml` matches the production snapshot so a Git or CI deploy cannot freeze writes or rewrite origin. Local `npm run dev` overrides flags with `--binding`. Canonical apex-vs-www redirect remains a separate decision; do not “fix” origin to `www` in this file without an operator GO.

## Secret planes

| Plane | Owns | Does not own |
|---|---|---|
| **Cloudflare Pages** (runtime + build) | Twilio, `EMMIWOOD_NOTIFICATION_SECRET`, feature flags in `wrangler.toml`, D1 `DB`, Vite `VITE_*` **build** vars, `NODE_VERSION=22` | Operator PII, Cloudflare API tokens |
| **GitHub Actions** | Heartbeat `EMMIWOOD_NOTIFICATION_SECRET` + `EMMIWOOD_NOTIFICATION_URL` / `EMMIWOOD_NOTIFICATIONS_ENABLED`; deploy/migrate `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | Twilio |
| **Cursor Cloud Agents** | `CLOUDFLARE_API_TOKEN` (Runtime Secret), `CLOUDFLARE_ACCOUNT_ID`, `EMMIWOOD_NOTIFICATION_SECRET`, optional Maps key, optional admin-seed PII | Production Twilio (Functions already have it) |

`.dev.vars` and `.env` stay gitignored. Cloud start runs `npm run dev:vars` to materialize `.dev.vars` from env. `.dev.vars.example` lists names only.

Production readiness SHA: `EMMIWOOD_RELEASE_SHA` **or** Git-connected Pages `CF_PAGES_COMMIT_SHA` (40-char hex). Prefer Pages commit SHA so operators stop hand-setting the release secret on every deploy.

## Cursor Cloud Agent

1. Create an environment for `KUP-IP/emmiwood`. Committed [`.cursor/environment.json`](../.cursor/environment.json) is the **install/start/terminals template** (`npm ci`, Playwright Chromium, write `.dev.vars`, build, local D1, `npm run dev`). A Personal dashboard environment currently wins if Cursor recorded it that way (`environmentJsonPath` null) — keep the dashboard copy identical to this file.
2. Dashboard secrets (not git):

   **Runtime Secrets:** `CLOUDFLARE_API_TOKEN` (Pages + D1 edit), `EMMIWOOD_NOTIFICATION_SECRET`, admin seed `EMMIWOOD_OWNER_*` / `EMMIWOOD_BARRO_*` only if the agent will run the seed script.

   **Environment Variables:** `CLOUDFLARE_ACCOUNT_ID`, optional `VITE_GOOGLE_MAPS_API_KEY`.
3. Do not run `wrangler login`. Do not store Twilio in Cursor.
4. SMS **handset** proof (`chat.db`) is Mac-only. Cloud can prove D1 `sent` + Twilio `SM…`.

## Git-triggered Cloudflare deploys

Existing Pages projects are **Direct Upload**. Cloudflare cannot attach Git to them. Two paths:

### Path A — live SSOT (GitHub Actions Direct Upload)

`ci.yml` job `deploy` runs on `main` after `verify` when GitHub variable `EMMIWOOD_CLOUD_DEPLOY` is `true`. Secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, environment `production`, and `EMMIWOOD_CLOUD_DEPLOY=true` are **in place** (2026-08-31: `main` deploy of `919bff7` succeeded). PRs run `verify` only.

Disable this job after Path B is live so the site is not deployed twice.

### Path B — Git-connected Pages (operator dashboard)

Direct Upload cannot be converted in place. Create a **new** Git-connected project, then cut domains over:

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → `KUP-IP/emmiwood`.
2. Production branch `main`. Build command `npm ci && npm ci --prefix client && npm run build`. Output `client/dist`. Env `NODE_VERSION=22`. Optional build vars: `VITE_GOOGLE_MAPS_API_KEY`, `VITE_EMMIWOOD_PUBLIC_ORIGIN`.
3. Copy Pages secrets from `emmiwood` onto the new project (names above). Bind existing D1 `emmiwood-db` (`a79f099e-396f-4466-801c-2458a0c2b3e2`) for production and `emmiwood-standalone-preview-db` (`b4a10012-e0c8-40f0-b203-31474393fb2a`) for preview. Do not create a third database.
4. Enable preview deployments for non-`main` branches (`wrangler.toml` `[env.preview]`).
5. Prove a production deploy on the new `*.pages.dev` host (read-only catalog/slots). Then move `emmiwood.com` and `www.emmiwood.com` from Direct Upload `emmiwood` onto the Git project. Keep the old project as rollback until that is proven.
6. Git-connected Pages cannot switch back to Direct Upload. Pause automatic production deploys in Branch control if you need a freeze.

## D1 migrations

Code may auto-deploy. Schema does not. Apply remotes only through:

- GitHub Actions workflow **D1 remote migrations** (`workflow_dispatch`, confirmation phrase `APPLY-REMOTE-MIGRATIONS`)
- Or a Cloud Agent / operator command: `npm run db:migrate:remote:preview` / `npm run db:migrate:remote:production` after an explicit GO

## GitHub environments and secrets (live)

Names confirmed 2026-08-31 by job behavior (this Cloud Agent token cannot list Actions secrets). Do not recreate.

| Name | Where |
|---|---|
| `EMMIWOOD_CLOUD_DEPLOY` | GitHub Actions **variable** `true` — Path A deploy runs |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret (Pages + D1 edit); same token as Cursor |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secret or variable (`99ca43ae6713b1fc6be0c77047bc06d7`) |
| Environment `production` | Used by `deploy` and production D1 migrate (no required-reviewer rules yet) |
| Environment `preview` | Preview D1 migrate |
| Heartbeat | secret `EMMIWOOD_NOTIFICATION_SECRET`; vars `EMMIWOOD_NOTIFICATION_URL`, `EMMIWOOD_NOTIFICATIONS_ENABLED` (process-queue step runs — treat as **enabled**) |
