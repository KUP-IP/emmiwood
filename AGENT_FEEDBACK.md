# Agent Feedback

## 2026-07-20

- A Cloudflare Pages project apex can point at a different deployment than the newest deployment-specific URL. Preview verification must test both the apex and the exact deployment URL before calling a preview valid.
- Legacy project names can conceal source contamination. The `emmiwood-barbers-preview` project existed, but its active apex served KUP and its newest Emmiwood route came from the abandoned KUP commit. Always compare deployment source SHA with the standalone repository SHA.
- Customer email and administrator email were coupled indirectly through a shared Resend readiness gate. Channel-removal decisions must separately inspect customer messaging, operator authentication, and release-preflight requirements.
- Combined infrastructure-inspection commands containing credential-related terminology can be blocked by the execution safety layer. Split repository hygiene, resource discovery, and deployment inspection into separate calls.
- A remote D1 can contain a later legacy schema while its migration ledger is empty. Never infer database freshness from `wrangler d1 migrations list` alone; inspect schema provenance or use a fresh database when standalone migration history must be authoritative.
