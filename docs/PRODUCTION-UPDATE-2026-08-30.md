# Approved code-only production update

This contract supersedes the initial frozen-launch sequence for this deployment
only. The operator approved the reviewed UI, waived the unavailable Bridge
dependency, and explicitly approved push/PR, merge after required checks pass,
and deployment while preserving existing production settings.

## Scope

- Approved EWB assets, UI/UX recovery work, and the seven mobile inspection edits.
- Keep production Pages `emmiwood`, D1 `emmiwood-db`, existing secrets,
  compatibility settings, domain attachments, and current runtime variables.
- Live inspection found booking writes and notifications enabled, with runtime
  public origin `https://emmiwood.com`. Preserve those values for this update.
- All migrations 0001–0010 are already applied. No migrations, seed, database
  writes, real SMS/OTP tests, workflow changes, or domain redirects are authorized
  by this code-only update. Canonical redirect reconciliation remains separate.
- No backend runtime Functions or notification workflow changes are in the candidate
  relative to the current production source base.

## Release gate

1. Commit the reviewed source, push the review branch, and open a PR.
2. Require the protected-branch `verify` check to pass; never bypass protection.
3. Merge and update the local checkout to the exact upstream `main` SHA.
4. Build the merged source, retain an artifact fingerprint, and deploy it using
   a fresh downloaded production configuration in an isolated staging directory.
   **Do not deploy with the repository's frozen first-launch defaults.**
5. Compare the live production configuration before and after deployment, verify
   the exact deployment SHA and success status through Cloudflare metadata, and
   read-check both domains, new asset bytes, booking catalog/availability, and
   public routes. No synthetic production booking or message send is included.
6. Retain the previous deployment ID as the code rollback target. Roll back only
   this code update if verification fails; preserve operational settings and data.

The earlier local receipt for `268edb1` predates operator feedback. The updated
candidate has a transparent wordmark, one mobile logo/navigation row, removed
redundant hero copy/link, and single-line mobile labels. Its local verification
passed 62 Chromium cases, eight Firefox/WebKit cases, 85 unit/release tests,
four brand tests, application/browser typechecks, and the production build.

Cross-browser contrast measurement now waits for finite entrance animations to
settle, matching the full suite. The earlier transient-opacity failure remains
in local evidence rather than being presented as a clean first attempt.

This deployment is not a full operational-launch closeout: administrator OTP,
exact-ID SMS reconciliation, canonical redirects, and remaining issue-closure
requirements retain their own evidence and approval boundaries.

Initial PR CI exposed an existing date-dependent fixture: the staff-SMS test
selected a Saturday for John on the UTC runner. It now chooses a shared
Mon/Wed/Fri date and tests fixture selection across all seven runner weekdays.
This changes test code only, not production scheduling or SMS behavior.

Linux CI then passed all 62 Chromium cases but exposed a compressor-dependent
wordmark assertion. Provenance now compares every decoded RGBA pixel against
the source recipe; shipped asset bytes are still checked against the committed
asset hash. No approved image or production code changed for this correction.
