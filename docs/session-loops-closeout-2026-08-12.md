# Session loops closeout — 2026-08-12

## CLOSED (evidence this session)
- **www host for Emmiwood:** `https://www.emmiwood.com` serves app + static privacy (200).
- **Apex host (edge):** CF zone active; apex CNAME → Pages; privacy 200 via public CF resolvers.
- **Mail preserved:** MX `smtp.google.com` intact on CF DNS.
- **Public origin:** Pages `EMMIWOOD_PUBLIC_ORIGIN=https://www.emmiwood.com` (+ `wrangler.preview.toml`).
- **A2P package resubmit:** same SID `QE2c6890…`, message_flow on www URLs (no pages.dev / no trailing-dot trap).
- **Brand:** APPROVED / VERIFIED.
- **Static compliance assets:** privacy, sms-terms, opt-in-evidence under `client/public/`.

## BLOCKED (named dependency)
- **A2P terminal status:** still `IN_PROGRESS` (~4h). Wait TCR → VERIFIED or FAILED. No edit while in progress.
- **SMS smoke:** after VERIFIED + spend GO · From `+16052503489` only.

## DEFERRED
- **DNS resolver lag:** some resolvers (e.g. 1.1.1.1 / local) may not resolve apex until NS fully propagates; use www as canonical.
- **Twilio refund ticket:** draft in `docs/a2p-support-refund-draft-2026-08-12.txt` — submit only on explicit GO.
- **Full prod D1 / separate Pages project:** not required for domain host cutover.
- **Bridge auth packet:** separate product track.
