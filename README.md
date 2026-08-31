# Emmiwood

Standalone Emmiwood Barbers booking website and Cloudflare Pages Functions application.

This repository was extracted from the abandoned `KUP-IP/kup.solutions` PR #92 at source commit `1ca43dc4db0d102eec3adebea741788d4142f1e5`. It has an independent application shell, package manifests, deployment name, D1 namespace, and migration sequence.

Cloud-first: develop from Cursor Cloud Agents, keep secrets in Cloudflare / GitHub / Cursor, deploy from `main` after CI. See [`docs/CLOUD.md`](docs/CLOUD.md).

## Verify

```bash
npm ci
npm ci --prefix client
npm test
npm run db:migrate:local
npm run dev
```

`npm run dev` serves Functions with preview-like bindings on port 8788 (local D1 under `.wrangler/state`). Twilio unset → mock SMS. Optional `npm run dev:vars` writes gitignored `.dev.vars` from the environment (names in `.dev.vars.example`).

Production `wrangler.toml` matches the live shop (`https://emmiwood.com`, booking writes and notifications enabled). Do not replace those vars with frozen-launch defaults. Production credentials never belong in git. D1 remotes are gated — see [`docs/CLOUD.md`](docs/CLOUD.md) and [`docs/RELEASE.md`](docs/RELEASE.md).
