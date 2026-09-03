# Admin access security audit

**Date:** 2026-09-03. **Scope:** design only — no patches, migrations, D1 writes, live SMS, or [`DECISIONS.md`](DECISIONS.md) amendment in this pass.

**Finding in one sentence:** `/emmiwood/admin` looks like anyone can join. In code, **nobody becomes an admin from that page**. The page only proves you already have an allowlisted phone. There is **no super-admin approval UI**. Isaiah’s “super admin” today is **Cloudflare + D1**, not a product workflow.

Related: [`RELEASE.md`](RELEASE.md) (production seed), [`DECISIONS.md`](DECISIONS.md) #7 and #10, [`HANDOFF.md`](HANDOFF.md).

---

## How it actually works

```text
Anyone opens /emmiwood/admin
        |
        v
POST /api/emmiwood/admin/auth/request-code  { phone }
        |
        v
D1: active emmiwood_admins row with that E.164?
   |                          |
  yes                         no
   |                          |
Twilio OTP to SIM        no SMS, no challenge
   |                          |
   +-----------+--------------+
               |
               v
     Always { ok: true }  (production omits previewCode)
               |
               v
POST /api/emmiwood/admin/auth/verify  { phone, code }
               |
      valid hashed challenge --> HttpOnly session cookie (8h)
               |                        |
               |                        v
               |              GET /api/emmiwood/admin/dashboard
               v
      no challenge / wrong code --> 401 invalid_code
```

### Become admin (data plane only)

- A row in `emmiwood_admins` with `active=1` and a unique E.164 (`migrations/0001_booking.sql`, `migrations/0006_admin_phone.sql`).
- Production roster is seeded once by [`scripts/seed-production-admins.mjs`](../scripts/seed-production-admins.mjs) (`--execute --confirm PRODUCTION-ADMIN-SEED`). It **refuses** if the roster is no longer the placeholder owner.
- There is **no** HTTP route to INSERT/UPDATE admins. Shop resources in [`functions/lib/emmiwood-admin.js`](../functions/lib/emmiwood-admin.js) are only `barbers`, `services`, `availability`, `blocks`, `eligibility`.

Live production already has `admin-isaiah` (`owner`) and `admin-barro` (`manager`) with real phones. Do **not** re-run the seed. Change a phone with a gated D1 `UPDATE`, not the seed script. Confirm last four digits privately; never commit or paste full E.164s.

### Sign in (allowlist OTP)

- Lookup: `shop_id + phone + active=1` in `requestCode`. Unknown numbers still get `{ ok: true }` (anti-enumeration). Production does **not** return `previewCode`.
- Verify: SHA-256 of a 6-digit code, 10-minute TTL, 5 failed tries lock **that challenge**, then cookie `emmiwood_admin_session` (`HttpOnly`, `SameSite=Strict`, `Secure` when `ENVIRONMENT=production`, `Path=/api/emmiwood/admin`, `Max-Age=28800`).
- Decision lock: SMS OTP to allowlisted phones; no email OTP ([`DECISIONS.md`](DECISIONS.md) #7, #10). Exactly two **seeded** logins; no third support account.

### What “super admin” is today

| Layer | Who | Can add an admin? |
|---|---|---|
| Product `owner` (Isaiah) | Shop UI | **No** (barbers / eligibility only) |
| Product `manager` (Barrow) | Shop UI | **No** |
| Cloudflare / Wrangler / D1 | KUP operator token | **Yes** — this is the real super-admin |
| GitHub preflight | CI | Read roster only; does not write |

There is **no approval process** in the app. “Approval” is operational: an operator with `CLOUDFLARE_API_TOKEN` writes D1.

The public footer **Staff sign in** is discovery, not a signup hole.

---

## What is already solid

- Arbitrary phones cannot receive codes or create sessions.
- Production omits `previewCode`; Twilio is required (mock in production fails closed).
- Per-account request cap (5 / 10 min in production) and per-IP source cap (20 / 10 min).
- Cookie is not readable by JS; mutations call `requireSameOrigin` when `Origin` is present ([`functions/lib/emmiwood-core.js`](../functions/lib/emmiwood-core.js)).
- Manager cannot change the barber roster on the **API** (`ROSTER_ROLES = ['owner']`).
- Release preflight **asserts** exactly two active unique E.164s in [`scripts/release-preflight-lib.mjs`](../scripts/release-preflight-lib.mjs) `validateAdminRoster` — **at check time**, not at every login.

---

## Vulnerabilities (ranked)

**High (if more than two trusted people ever exist) / Medium (today’s two-person roster)** — plaintext OTP in dashboard JSON. Tracked: [#59](https://github.com/KUP-IP/emmiwood/issues/59).

- Login stores `{ code }` in `emmiwood_notification_outbox.payload_json` (`requestCode` in [`functions/lib/emmiwood-admin.js`](../functions/lib/emmiwood-admin.js)).
- `dashboard()` does `SELECT *` on outbox and returns it to **any** signed-in role, including future `staff` / `kup_support`.
- The Texts UI does not show the body, but `GET /api/emmiwood/admin/dashboard` does. A manager who captures the owner’s code in the 10-minute window can mint an **owner** session.

**Medium** — SMS-only auth. SIM swap, SS7, or a stolen handset **is** shop admin (PII, cancel/book; owner also roster). No second factor, no IP allowlist, no step-up for roster edits.

**Medium (process)** — no runtime cap of two admins. Extra D1 rows can log in. No in-app disable, no revoke-all-sessions, no access-review receipt. GitHub #17 closed without production OTP evidence.

**Low–Medium** — `staff` is a hidden powerful editor (same writes as manager except roster). Easy to create by a mistaken D1 insert. `kup_support` cannot mutate shop setup but still sees **all** customer/outbox data.

**Low** — `verifyCode` has no timing floor (production `requestCode` does). Per-challenge lockout is reset by a new request-code (bounded by rate limits). `requireSameOrigin` **returns early when `Origin` is missing**. Logout 401 leaves the cookie. 6-digit OTP (~20 bits) is acceptable only with tight try limits. Preview environments return `previewCode` in JSON.

**Informational** — public repo seeds `isaiah@kup.solutions`. Cloudflare token is more powerful than any product role.

---

## Recommended patches (deferred)

Not implemented in this pass.

1. **Strip secrets from dashboard.** Never return `payload_json` for `admin_login_code` (redact or omit). Prefer storing OTP hash only in `login_challenges` and a delivery id in outbox, not the live code. Issue [#59](https://github.com/KUP-IP/emmiwood/issues/59).
2. **Scope dashboard by role.** `kup_support` (if ever used) must not see full outbox payloads or customer phones unless that is an explicit decision.
3. **Account-level lockout** after N failed verifies across challenges; revoke all sessions on `active=0`.
4. **Timing floor on verify** in production; do not trust `x-forwarded-for` off Cloudflare (prefer `cf-connecting-ip` only).
5. **Fail closed on missing Origin** for cookie-authenticated POSTs, or add a CSRF token. Keep Bearer for non-browser tools behind a tighter path if needed.
6. **Runtime roster invariant (optional):** production login refuses if active admin count ≠ 2, *or* explicitly drop the “exactly two” rule when invite ships.
7. **Owner step-up** for roster changes (re-OTP or confirm) so a stolen 8-hour manager session cannot become owner via outbox (patch 1 is the real fix).
8. **Operational:** last-four phone review; do not re-run seed; change phones with a gated D1 UPDATE.

---

## Proposed super-admin approval (deferred product)

Would amend [`DECISIONS.md`](DECISIONS.md) #7. Not implemented in this pass. Today Isaiah cannot “approve Barrow” in the UI because Barrow is already in D1.

**Invite (simpler)**  
Owner enters name, E.164, role (`manager` or `staff`). Row is `active=0` / `pending`. Invitee requests a code; first successful verify sets `active=1`. Owner can revoke (`active=0` + revoke sessions). Still SMS-only; owner mistake = extra admin.

**Dual-control (stronger)**  
Owner proposes; second existing admin (Barrow) must approve from **their** session before the invitee’s OTP works. Matches “approve through super admin” without giving Cloudflare to the shop owner. Needs a pending-admin status, audit events, and an amendment to “exactly two admins.”

**Keep ops-only (current doctrine)**  
No third login. Adding anyone remains a KUP D1 write after an explicit GO. Shop owners never get an Add Admin button. This is the least attack surface.

**Do not do:** public “register as admin,” shared passwords, or email magic links (decisions 5 and 10).

---

## What to tell Barrow

The staff page is a **locked door with a hidden key list**, not a join form. His phone is already on the list. Random numbers get the same “code on the way” message and **no text**. He cannot add another administrator; Isaiah cannot either **in the app**. Only KUP with D1 can.
