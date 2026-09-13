# Security Audit Report — Kryleos Forge

**Date:** 2026-06-10 · **Branch:** `qa/full-test-audit` · **Auditor:** Security/QA Lead
**Method:** static review of backend, crypto, IPC, WS pairing, billing; `npm audit`; git-history secret scan; targeted automated tests. No production credentials used; no third-party systems contacted; no exploit run against live infrastructure.

---

## Summary

| Metric | Result |
| :-- | :-- |
| Dependency CVEs (`npm audit`, all 3 apps) | **0** (incl. new helmet/express-rate-limit) |
| Live secrets committed to scanned history | **None found** |
| High-severity findings | 5 original + B3b → **all RESOLVED** |
| Medium-severity findings | M1–M4 **RESOLVED**; **M5 open** (concurrency unmeasured) |
| Overall security posture | All High/Medium code findings closed; remaining gaps are coverage (UI/E2E/a11y) + M5 measurement |

\*M1 is rated Medium-High; counted with Highs for prioritization.

### Remediation status (updated 2026-06-10, post-fix)

| ID | Status | What changed |
| :-- | :-- | :-- |
| SEC-B5 | ✅ Resolved | Backend binds `127.0.0.1` by default; LAN via explicit `KRYLEOS_BIND_HOST` opt-in. |
| SEC-B4 | ✅ Resolved | `crypto.randomInt` code, 10-min TTL, 5-attempt lockout, constant-time compare. Tests assert expiry + lockout. |
| SEC-B3 | ✅ Resolved | `electron.cjs` fallback now uses a per-install random key (0600) with legacy-decrypt migration. |
| SEC-B3b | ✅ Resolved | `db.ts` JSON-DB key now per-install random (0600) with legacy-key fallback; existing data decrypts and is re-encrypted on next write. |
| SEC-B2 | ✅ Resolved | `.env` untracked (`git rm --cached`), gitignored, `.env.example` added. |
| SEC-M1 | ✅ Resolved | Plaintext-equality fallback removed (fails closed); OAuth sim disabled in production. Tests added. |
| SEC-M2 | ✅ Resolved | Stripe webhook fails closed: real keys always verified; production never accepts unsigned; mock-unsigned path is dev-only. |
| SEC-M3 | ✅ Resolved | Scanner now detects AWS, GitHub, Stripe-live, Slack, and JWT; coverage tests flipped from gap-markers to assertions. |
| SEC-M4 | ✅ Resolved | `helmet` security headers + `express-rate-limit` (30/15min) on auth & billing routes. |
| SEC-M5 | ✅ Resolved | `ChatDatabase` now serializes mutating ops; new `db.concurrency.test.ts` proves 50 concurrent writes all persist (no lost updates). |

**Verification:** 28 Desktop test files pass (199 + 1 tracked gap); `npm run lint` clean; `npm run build` passes; live E2E pairing succeeds; full load/stress test **PASSES all 5 thresholds**; `npm audit` 0 CVEs after adding helmet/express-rate-limit.

**Also fixed (pre-existing build blocker, not security):** `db.ts` `decipher.update(buffer, 'hex', ...)` was a TypeScript error breaking `npm run build`; corrected to pass no input encoding for the Buffer.

Severity scale: **Critical** (immediate compromise) · **High** (compromise under realistic conditions) · **Medium** (weakens defenses / conditional) · **Low** (hardening).

---

## Findings

### SEC-B3 — Hardcoded fallback encryption key + static salt — **High**
**Where:** `Desktop-app/src/backend/electron.cjs:9-14`
**Detail:** When Electron `safeStorage` is unavailable, AES-256-CBC keys derive from `OS_FINGERPRINT`, defaulting to the literal `'kryleos-fallback-key-9988'` with static salt `'salt'`. The key is then identical across every install and present in source; stored provider API keys become recoverable by anyone with the ciphertext file.
**Pass/fail test condition:** fallback ciphertext from two installs with no `OS_FINGERPRINT` env must NOT be decryptable with the in-source constant. Currently it is.
**Fix:** generate a per-install random key, store it via OS-protected means (DPAPI/Keychain/libsecret); use a random per-record salt; **fail closed** (refuse to persist secrets) when no real keychain exists rather than silently using a constant.

### SEC-B4 — Guessable, non-expiring, unthrottled pairing code — **High**
**Where:** `Desktop-app/src/backend/companionHub.ts:27-42`
**Detail:** Pairing code is `Math.floor(100000 + Math.random()*900000)` — non-CSPRNG, 10⁶ space — and `verifyPairingCode` is a plain compare with no expiry, no rotation, and no attempt limit. The load test paired **20/20 concurrent sockets** with one code, confirming no throttle.
**Automated evidence:** `companionHub.security.test.ts` ("code never expires or rotates", "no lockout after many failed attempts").
**Pass/fail test condition:** code must expire after first successful pair or short TTL, and verification must lock out after N failures. Currently neither holds.
**Fix:** `crypto.randomInt`, longer code, TTL + rotate-on-pair, attempt throttling/lockout.

### SEC-B5 — Backend binds all interfaces; broad CORS exemptions — **High**
**Where:** `Desktop-app/src/backend/server.ts:2849` (`server.listen(PORT)` with no host), `:172-204` (CORS).
**Detail:** With no host argument Node binds `0.0.0.0`/`::`, exposing the command-executing backend + WS gateway to the LAN. The origin middleware exempts `/api/telemetry`, `/api/companion/ws`, `/api/billing/webhook`, and sends `Access-Control-Allow-Origin: *` when no `Origin` header is present. Combined with B4, a LAN attacker can pair and drive remote command approvals.
**Pass/fail test condition:** a request from a non-loopback interface to the backend must be refused unless remote access is an explicit, authenticated feature. Currently reachable.
**Fix:** `server.listen(PORT, '127.0.0.1')`; narrow exemptions; remove the `*` no-origin fallback.

### SEC-B2 — `.env` tracked in Desktop-app git history — **High (hygiene)**
**Where:** `Desktop-app/.env` (added in commit `7b6b338`).
**Detail:** `.env` is committed (currently only non-secret config: `PORT`, `NODE_ENV`, `KRYLEOS_DB_PATH`, `KRYLEOS_DATA_DIR`; history scan found no live keys). Tracking it guarantees a future key leak.
**Pass/fail test condition:** `git ls-files` must not list any `.env`. Currently it does (in the nested repo).
**Fix:** `git rm --cached .env`, confirm ignore rules, commit, add `.env.example` (key names only).

### SEC-M1 — OAuth literal + plaintext password fallback — **Medium-High**
**Where:** `Desktop-app/src/backend/sync.ts:13-31`
**Detail:** `verifyPassword` accepts `password === 'google-oauth-flow-secret'`/`'apple-oauth-flow-secret'` as valid when the stored hash equals that literal, and falls back to `storedHash === password` (plaintext) for legacy records. PBKDF2 (100k/SHA-512/timing-safe) is otherwise correct.
**Pass/fail test condition:** no account may authenticate via a shared in-source literal or plaintext comparison.
**Fix:** remove plaintext fallback; replace simulated-OAuth literals with a real token exchange or gate strictly behind a non-production flag.

### SEC-M2 — Stripe webhook production safety hinges only on `NODE_ENV` — **Medium**
**Where:** `Desktop-app/src/backend/server.ts:206-229`
**Detail:** Signature verification is enforced only when `NODE_ENV === 'production'`. If unset/misconfigured in a real deployment, the endpoint accepts **unsigned** JSON and mutates subscription tiers by email. Mock defaults (`sk_test_mock_key`/`whsec_mock_secret`) are the bypass triggers.
**Fix:** fail closed by default; require explicit opt-in for the mock path; never infer prod-safety from a single env var.

### SEC-M3 — Secret scanner coverage gaps — **Medium**
**Where:** `Desktop-app/src/backend/secretScanner.ts`
**Detail:** Detects OpenAI/Anthropic/Google/PEM/generic-assignment only. Misses AWS (`AKIA…`), GitHub (`ghp_…`), **Stripe live (`sk_live_…`)** — notable since the app ships Stripe — Slack (`xoxb-…`), and JWTs.
**Automated evidence:** `secretScanner.coverage.test.ts` (5 tracked `it.fails` gaps).
**Fix:** expand ruleset (consider gitleaks rules) + entropy heuristic + per-pattern unit tests.

### SEC-M4 — No rate limiting / security headers — **Medium**
**Where:** `Desktop-app/src/backend` (no `helmet`, no `express-rate-limit`, no login/pairing throttle found).
**Fix:** add `helmet` and rate limiting on auth/pairing/webhook routes.

### SEC-M5 — File-based JSON store concurrency — **Medium**
**Where:** sync/history persistence.
**Detail:** Concurrent JSON-file writes risk lost updates/corruption. Load test did 50 **sequential** writes cleanly (1.32 ms avg); concurrent-write safety remains unmeasured.
**Fix:** write-locking or SQLite; add a concurrent-write integrity test.

### Low / hardening
- **SEC-L1** Pairing/connection events and command text are `console.log`-ged — review for sensitive data in logs.
- **SEC-L2** No SBOM / license gate in CI.
- **SEC-L3** Mobile `overrides` pin transitive deps — document rationale and monitor.

---

## Positive controls (verified working)
- RSA-2048 command-approval signing with tamper detection (`security.ts`; `security.test.ts` rejects modified command/nonce).
- Path-traversal guard in the sandbox (`resolvePath` throws on `../`).
- Command blocklist stops destructive shells (`rm -rf /`, `shutdown`, `format`, …) before any spawn (`sandbox.blocklist.test.ts`).
- Electron `nodeIntegration:false` + `contextIsolation:true` + minimal `preload.cjs` bridge.
- PBKDF2 password hashing with timing-safe compare.
- 0 dependency CVEs across all apps.

---

## Remediation priority

| Order | Finding | Severity | Effort |
| :-- | :-- | :-- | :-- |
| 1 | B5 bind to loopback | High | Low |
| 2 | B4 pairing CSPRNG + TTL + lockout | High | Low-Med |
| 3 | B3 fallback key hardening / fail-closed | High | Med |
| 4 | B2 untrack `.env` | High | Low |
| 5 | M1 remove plaintext/OAuth-literal auth | Med-High | Low |
| 6 | M2 webhook fail-closed | Med | Low |
| 7 | M3 scanner patterns | Med | Low-Med |
| 8 | M4 helmet + rate limit | Med | Low |
| 9 | M5 concurrency safety | Med | Med |

Most High items are **small, localized changes**. The security posture can move from ~4/10 to ~8/10 with items 1–6.
