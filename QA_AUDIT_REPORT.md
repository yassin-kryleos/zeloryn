# QA Readiness Audit — Kryleos Forge (Cross-Platform)

**Prepared by:** QA / Security / Performance Lead (automated audit)
**Date:** 2026-06-10
**Branch audited:** `qa/full-test-audit`
**Scope:** `Web-app/`, `Desktop-app/`, `Mobile-app/` (project folder only; no production credentials used; no third-party systems contacted; no destructive commands run)
**Status of this document:** Pre-test inspection audit. **No test files were created or modified** — awaiting your approval before authoring the test system.

---

## 0. Important note on the existing audit

A prior file at [`qa/reports/QA_AUDIT_REPORT.md`](qa/reports/QA_AUDIT_REPORT.md) is marked **"Approved & Signed Off — READY FOR RELEASE — 9.5/10."** My fresh inspection **does not support that conclusion.** Several of its claims are either outdated or describe work as "Resolved/Audited" that I could not verify from the code, and it overlooks repository-structure and security issues that materially affect release readiness. This document is an independent, evidence-based re-audit. I have **not overwritten** the prior file — I'm surfacing the discrepancy for your decision.

My current assessment: **not release-ready as-is.** Provisional readiness score **5.5 / 10** (detailed scoring in §11). The codebase is in good shape functionally and tests pass, but there are blocking repo-hygiene and security items.

---

## 1. Architecture summary (as detected)

Three independent applications under one parent folder:

| Module | Stack | Entry / role |
| :-- | :-- | :-- |
| **Desktop-app** | Electron ^42 + React 19 + Vite + TypeScript; Express ^5 backend via `tsx`; `ws` WebSocket | Local agent workspace. Backend `src/backend/server.ts` (~106 KB) on port **3001**: file parsing, sandboxed shell exec, JSON-file "DB", LLM provider clients (Google/OpenAI/Anthropic/DeepSeek/OpenRouter/Ollama), Stripe billing, companion hub. |
| **Web-app** | React 19 + Vite + TypeScript | Marketing/companion dashboard (`src/App.tsx` ~65 KB), voice-input hook. |
| **Mobile-app** | Expo ^56 + React Native 0.85 | Companion app (`App.tsx`), PII redaction util, voice. |

Companion devices (Web/Mobile) pair to the desktop backend over WebSocket using a pairing code, and can remotely approve/reject commands and stop workflows.

---

## 2. Tech stack & tooling detected

- **Test runner:** Vitest ^4.1.8 in all three apps.
- **Lint:** ESLint ^10 (flat config) in Web + Desktop.
- **Build:** `tsc -b && vite build` (Web, Desktop); Expo (Mobile).
- **Billing:** Stripe ^22.
- **Crypto:** Electron `safeStorage` with an AES-256-CBC fallback; RSA-2048 command-approval signing.

---

## 3. Test execution results (this audit ran the suites)

All suites **pass** today:

| App | Command | Result |
| :-- | :-- | :-- |
| Desktop-app | `npm test` (vitest run) | **24 files / 161 tests passed** |
| Web-app | `npm test` | **2 files / 13 tests passed** |
| Mobile-app | `npm test` | **2 files / 9 tests passed** |
| **Total** | | **28 files / 183 tests, 0 failures** |

`npm audit` reported **0 known vulnerabilities** in all three apps (dev + prod).

> Note: the prior report states "152 tests / 24 files." The Desktop count is now 161; treat hardcoded counts in older docs as stale.

### What the existing tests actually cover
Unit + some integration only, concentrated in the Desktop backend: password hashing/login, sync/merge, diff3, sandbox limits, command security, secret scanner, billing webhook (mocked), cost guard, agent parsing, planningV2. Web/Mobile have thin unit coverage (voice hook, PII redaction, a `functional.test.ts` each).

### What is **claimed but not real**
- **End-to-end:** `qa/scripts/run-e2e-checks.mjs` is a bespoke WebSocket script, **not** a real E2E harness (no Playwright/Electron driver, no UI automation). No browser/Electron/mobile E2E exists.
- **UI/UX & Accessibility:** No component tests, no axe/a11y checks, no rendering tests. The "screenshots" are **mockups**, not captured app output.
- **Load/Stress:** `k6-load-test.js` and `node-load-test.mjs` exist but there is **no evidence they were executed**; results files appear to be authored, not generated.
- **Cross-platform:** No automated matrix; claims about macOS `safeStorage` / NSIS / Expo builds are untested assertions.

---

## 4. 🔴 Blocking findings (must fix before release)

### B1 — Nested git repositories break the QA/CI model — **Critical**
`Desktop-app/` and `Mobile-app/` each contain their **own `.git`** (Desktop on branch `qa/full-test-audit`, Mobile on `master`). The root repo (`qa/full-test-audit`) therefore tracks **only** `qa/`, `Web-app/`, `Project-Documents/` — it sees `Desktop-app/` and `Mobile-app/` as a single untracked `??` entry and cannot version their source.
- **Impact:** The CI snippet in the old audit (`npm ci` + `npm test` at root) cannot work. Any "monorepo QA pipeline" assumption is invalid. Source of the two largest apps is not under the audit branch's version control.
- **Fix:** Decide on a structure — either convert to git **submodules**, consolidate into a true monorepo (remove nested `.git`), or run CI per-app with explicit working directories. Document the chosen layout before building the test system. **Severity: Critical (blocks a coherent test/CI system).**

### B2 — `.env` committed to Desktop-app history + dirty trees — **High**
`Desktop-app/.env` is **tracked** in the nested repo (added in commit `7b6b338`) and is currently modified. At `HEAD` it holds only non-secret config (`PORT`, `NODE_ENV`, `KRYLEOS_DB_PATH`, `KRYLEOS_DATA_DIR`), and a history scan found **no live API keys committed** — good. But committing `.env` at all is a footgun: the next person who adds a real key leaks it.
- Working trees are also dirty (deleted `scratch/*`, `app_testing.ts`, `implementation_plan.md` staged as deletions; modified `projects.json`, `package-lock.json`).
- **Fix:** `git rm --cached .env`, confirm `.gitignore` covers it (root `.gitignore` does; verify the nested repo's does too), commit a clean state, add a `.env.example` with key names only. **Severity: High.**

### B3 — Weak fallback encryption key — **High**
`Desktop-app/src/backend/electron.cjs` derives the AES-256 fallback key from `OS_FINGERPRINT`, which defaults to the **hardcoded constant** `'kryleos-fallback-key-9988'` with a **static salt `'salt'`** when the env var is unset. On any machine where Electron `safeStorage` is unavailable, all "encrypted" secrets are protected by a key that is identical across installs and present in source.
- **Impact:** Stored provider API keys are effectively recoverable by anyone with the source + the ciphertext file.
- **Fix:** Derive the fallback key from a per-install random secret stored via OS-protected means, use a random per-record salt, and fail closed (refuse to persist secrets) if no real keychain is available rather than silently using a constant. **Severity: High.**

### B4 — Companion pairing code is guessable & unthrottled — **High**
`companionHub.ts` generates the pairing code with `Math.floor(100000 + Math.random()*900000)` — a **6-digit, non-cryptographic** value (1,000,000 space), and `verifyPairingCode` is a plain string compare with **no attempt limit, no lockout, no expiry**. Combined with B5 (backend listens on all interfaces), a LAN attacker can brute-force pairing and gain remote command-approval / workflow-control rights.
- **Fix:** Use `crypto.randomInt`, lengthen the code, expire it after one successful pair / short TTL, and add attempt throttling + lockout. **Severity: High.**

### B5 — Backend binds to all network interfaces — **High**
`server.listen(PORT, …)` in `server.ts:2849` passes **no host**, so Node binds `0.0.0.0`/`::` — the Express backend and WebSocket gateway are reachable from the **LAN**, not just localhost. The origin-check middleware also **exempts** `/api/telemetry`, `/api/companion/ws`, and `/api/billing/webhook` from origin restrictions, and sends `Access-Control-Allow-Origin: *` when no `Origin` header is present.
- **Impact:** Remote reachability of a backend that can run shell commands on the host (gated only by pairing code B4) is a serious exposure.
- **Fix:** `server.listen(PORT, '127.0.0.1')` unless remote access is an explicit, secured feature; tighten the exemption list and the no-origin fallback. **Severity: High.**

---

## 5. 🟠 Major findings

### M1 — Hardcoded OAuth "master" secret & plaintext password fallback — **Medium-High**
`sync.ts` `verifyPassword` treats `password === 'google-oauth-flow-secret'` / `'apple-oauth-flow-secret'` as a valid login when the stored hash equals that literal, and ends with `return storedHash === password` (legacy **plaintext** comparison fallback). PBKDF2 (100k, SHA-512, timing-safe) is otherwise correct. The shared OAuth literal and plaintext path are auth-bypass risks if any account is ever seeded with those values.
- **Fix:** Remove plaintext fallback; replace simulated-OAuth literals with a proper token exchange or clearly gate behind a non-production flag. **Severity: Medium-High.**

### M2 — Stripe production safety hinges solely on `NODE_ENV` — **Medium**
The webhook (`server.ts:206`) only enforces signature verification when `NODE_ENV === 'production'`. If that var is unset/misconfigured in a real deployment, the endpoint accepts **unsigned** JSON and will mutate subscription tiers by email. Defaults `stripeSecretKey='sk_test_mock_key'` / `stripeWebhookSecret='whsec_mock_secret'` are the bypass triggers.
- **Fix:** Fail closed by default; require explicit opt-in for the mock path; never infer prod-safety from a single env var. **Severity: Medium.**

### M3 — Secret scanner has narrow coverage — **Medium**
`secretScanner.ts` matches OpenAI/Anthropic/Google/private-key/generic-assignment patterns only. **Misses** AWS access keys (`AKIA…`), GitHub tokens (`ghp_/gho_`), Slack tokens, GCP service-account JSON, Stripe live keys (`sk_live_`), JWTs, etc. Marketed as a commit/sync guard, so gaps matter.
- **Fix:** Expand ruleset (consider gitleaks rules), add entropy heuristic, unit-test each pattern. **Severity: Medium.**

### M4 — No rate limiting / security headers anywhere — **Medium**
No `helmet`, no `express-rate-limit`, no login/pairing attempt throttling found in `src/backend`. Login and pairing are brute-forceable.
- **Fix:** Add helmet + rate limiting on auth/pairing/webhook routes. **Severity: Medium.**

### M5 — File-based "database" concurrency — **Medium**
History/accounts persist to JSON files. The old audit lists "50 concurrent writes" as a planned stress test but provides no executed result. Concurrent writes to a JSON file risk lost updates / corruption.
- **Fix:** Validate with an actual concurrency test; consider write-locking or SQLite. **Severity: Medium (needs measurement).**

---

## 6. 🟡 Minor findings

- **MN1** Runtime/state files (`projects.json`, `dev.log`, `grid_layout.svg`, `chat_history.performance.json`) live in the Desktop-app working tree; ensure all transient state is git-ignored (test/perf history files already are).
- **MN2** `console.log` of pairing/connection events and command text — review for sensitive data in logs before release.
- **MN3** Web/Mobile have almost no test coverage relative to their UI surface (App.tsx is 65 KB on Web).
- **MN4** No dependency-license / SBOM check; no `npm audit` gate in any CI.
- **MN5** Mobile-app uses `overrides` to pin `uuid`/`xml2js`/`xmldom` — document why (likely transitive CVE pinning) and keep monitored.

---

## 7. High-risk modules (where to concentrate testing)

1. **`tools.ts` — command sandbox.** Blacklist is regex-based (`rm -rf /…`, `kill`, `shutdown`, `format`, etc.) plus tier/RBAC prefix blocks. Regex blacklists are **bypassable** (quoting, env indirection, alternate binaries). 30s timeout / 10 MB buffer confirmed. Needs adversarial/negative tests.
2. **`electron.cjs` / `security.ts` — crypto.** Fallback key (B3) + RSA approval signing (`SHA256`, looks correct).
3. **`companionHub.ts` — remote control.** Pairing entropy/throttle (B4), message handling, file write to `.kryleos/scratchbook.txt` from `SYNC_PLANNING_NOTES` (path traversal? workspaceRoot-joined — verify).
4. **`server.ts` — Stripe webhook + CORS + bind host** (B5, M2).
5. **`sync.ts` — auth** (M1).

---

## 8. Proposed test strategy (preview — to build after approval)

| Layer | Tool | Targets |
| :-- | :-- | :-- |
| Unit | Vitest (existing) | Expand Web/Mobile; add secretScanner pattern tests, sandbox bypass tests, crypto fallback tests. |
| Integration | Vitest + supertest | Express routes: webhook (signed/unsigned), auth, companion pairing rejection. |
| E2E | Playwright (web) + Playwright-Electron (desktop) | Real UI flows: pairing, command approval, plan→flow. |
| Mobile | Jest + React Native Testing Library / Expo | Component render + redaction + offline queue. |
| A11y | axe-core / Playwright-axe | WCAG AA on key screens. |
| Security | Custom Vitest + dependency scan (gitleaks/npm audit gate) | Brute-force pairing, origin bypass, auth bypass. |
| Load/Stress | k6 / autocannon | Backend endpoints + JSON-DB concurrency, actually executed with captured output. |

Each test case will carry an explicit pass/fail assertion; each finding a severity + recommended fix, per your rules.

---

## 9. Cross-platform matrix (to be exercised, not assumed)

| Platform | Target | Priority |
| :-- | :-- | :-- |
| Windows 10/11 | NSIS EXE + sandbox | High |
| macOS | DMG + `safeStorage` | High |
| Web (Chrome/Firefox) | Vite static + WS companion | Medium |
| iOS / Android | Expo companion | Medium |

---

## 10. Security summary (full report to follow as `SECURITY_AUDIT_REPORT.md`)

| ID | Finding | Severity |
| :-- | :-- | :-- |
| B3 | Hardcoded fallback encryption key + static salt | High |
| B4 | Guessable, unthrottled pairing code | High |
| B5 | Backend binds all interfaces; CORS exemptions | High |
| M1 | OAuth literal + plaintext password fallback | Med-High |
| M2 | Stripe prod-safety depends only on NODE_ENV | Medium |
| M3 | Narrow secret-scanner coverage | Medium |
| M4 | No rate limiting / security headers | Medium |
| B2 | `.env` tracked in git | High (hygiene) |

No live secrets found committed in scanned history. `npm audit`: 0 known CVEs.

---

## 11. Release readiness score

### **Provisional score: 5.5 / 10 — NOT release-ready**

| Dimension | Score | Notes |
| :-- | :-- | :-- |
| Functional correctness | 8/10 | 183 tests pass; core flows covered. |
| Unit/integration depth | 6/10 | Strong on Desktop backend; thin on Web/Mobile UI. |
| E2E | 2/10 | No real E2E; custom WS script only. |
| Cross-platform | 3/10 | Asserted, not exercised. |
| UI/UX & Accessibility | 2/10 | No a11y tests; mockups not real captures. |
| Security | 4/10 | Multiple High items (B3–B5, M1). |
| Dependency/secret hygiene | 5/10 | 0 CVEs, but `.env` tracked + scanner gaps. |
| Performance/load | 3/10 | Scripts unexecuted. |
| Repo/CI structure | 2/10 | Nested repos break the QA/CI model (B1). |
| Crash/freeze resilience | — | Not yet assessed. |

The prior "9.5/10 / READY" rating is not defensible against the above evidence.

---

## 12. Recommended next steps (in order)

1. **You decide on repo structure** (B1) — submodules vs. monorepo vs. per-app CI. This shapes the whole test system.
2. Approve the test-system build; I then create: `TEST_STRATEGY.md`, automated test files, `SECURITY_AUDIT_REPORT.md`, `PERFORMANCE_TEST_PLAN.md`, `RELEASE_QA_REPORT.md`, and rerun commands.
3. Fix B2–B5 / M1–M2 (small, high-value security fixes).
4. Re-score after the test system runs green and the High items are closed.

---

**Awaiting your approval before generating or modifying any test files.** Per your rules I have made no code changes and created no tests in this pass — this audit document only.
