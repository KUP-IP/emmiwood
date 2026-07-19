# Emmiwood

Standalone Emmiwood Barbers booking website and Cloudflare Pages Functions application.

This repository was extracted from the abandoned `KUP-IP/kup.solutions` PR #92 at source commit `1ca43dc4db0d102eec3adebea741788d4142f1e5`. It has an independent application shell, package manifests, deployment name, D1 namespace, and migration sequence.

## Local verification

```bash
npm install
npm --prefix client install
npm test
npm run db:migrate:local
npm run dev
```

The zero UUID in `wrangler.toml` is intentionally non-deployable. Replace it only after creating the dedicated Emmiwood D1 database. Production credentials and deployment remain gated.
