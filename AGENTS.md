# AGENTS.md

Emmiwood is a Cloudflare Pages + Pages Functions app with a Vite client and D1. Git hosting is `KUP-IP/emmiwood` only.

## Verify before claiming done

- `npm test` — unit, release-safety, typecheck, production build
- `npm run test:e2e:isolated` — exact-artifact Playwright against local Pages
- Do not run `db:migrate:remote:production` or live SMS suites without an explicit operator GO

## Cursor Cloud specific instructions

Cloud agents run on Ubuntu. There is no macOS Keychain and no `~/Library/Messages/chat.db`.

1. Secrets belong in the Cursor Cloud Agents dashboard (Runtime Secrets for tokens). Never put values in `.cursor/environment.json`.
2. On start, `scripts/write-dev-vars-from-env.mjs` writes gitignored `.dev.vars` from env. `npm run dev` binds preview-like flags so local Functions do not use production origin.
3. Local D1 persist is `.wrangler/state`. Twilio unset → mock SMS. That is expected.
4. Wrangler remote ops need `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (Cursor Runtime Secret / env). Do not run `wrangler login`.
5. `EMMIWOOD_NOTIFICATION_SECRET` is required for readiness/SMS suite processor calls. Keychain is Mac-only.
6. Handset proof (`chat.db`) is Mac-only. In cloud, stop after D1 `status=sent` + Twilio `SM…` SID; ask the operator to prove the handset on a Mac.
7. Production D1 migrations are gated: GitHub Actions `D1 remote migrations` workflow_dispatch, or `npm run db:migrate:remote:production` only after an explicit GO. Preview remote migrate is `npm run db:migrate:remote:preview`.
8. Do not deploy with frozen-launch defaults. Live production vars are in `wrangler.toml` (`https://emmiwood.com`, writes and notifications enabled). `EMMIWOOD_SHOP_ADMIN_SMS_FANOUT` stays `false` until an explicit GO. See `docs/CLOUD.md`.
9. Client handoff index: `docs/HANDOFF.md`. Effective Cursor Cloud environment may be a Personal dashboard snapshot; keep `.cursor/environment.json` identical to that dashboard install/start/terminals.
