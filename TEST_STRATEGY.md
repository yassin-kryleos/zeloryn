# Test Strategy — Kryleos Forge

**Date:** 2026-06-10 · **Branch:** `qa/full-test-audit` · **Owner:** QA Lead
**Companion docs:** [QA_AUDIT_REPORT.md](QA_AUDIT_REPORT.md) · [SECURITY_AUDIT_REPORT.md](SECURITY_AUDIT_REPORT.md) · [PERFORMANCE_TEST_PLAN.md](PERFORMANCE_TEST_PLAN.md) · [RELEASE_QA_REPORT.md](RELEASE_QA_REPORT.md)

---

## 1. Repository model (confirmed with stakeholder)

Per direction, the **existing folder structure is kept as-is**: three independent applications, each its own git repo / npm project.

| App | Path | Own `.git`? | Test runner |
| :-- | :-- | :-- | :-- |
| Desktop | `Desktop-app/` | Yes (`qa/full-test-audit`) | Vitest |
| Mobile | `Mobile-app/` | Yes (`master`) | Vitest |
| Web | `Web-app/` | No (tracked by root repo) | Vitest |

**Consequence for CI:** there is **no single root build**. Tests, lint, and build run **per app with an explicit working directory**. The CI matrix in §7 reflects this. Do not assume `npm ci` at the repo root.

---

## 2. Guiding principles

1. **Automated & repeatable** — every check runs from a command; no manual-only gates in the core suite.
2. **Explicit pass/fail** — each test asserts a concrete condition.
3. **Findings carry severity + fix** — tracked in the audit/security reports.
4. **Safe by construction** — no production credentials; test env uses `NODE_ENV=test`, `KRYLEOS_DATA_DIR=qa-db*`, `chat_history.test.json`; destructive shell commands are only ever asserted as *blocked* (never executed).
5. **Gaps are tracked, not hidden** — known weaknesses are encoded as Vitest `it.fails` markers, so the suite stays green **and** flips red the moment a gap is closed (signalling the test must be updated). This keeps `npm test` clean while making every gap a living assertion.

---

## 3. Test pyramid & ownership

```
        ╱ E2E / cross-platform (manual + scripted) ╲      ← thin, high-value flows
      ╱  Integration (server routes, WS pairing)     ╲
    ╱  Unit (logic: crypto, sandbox, redaction, scan)  ╲   ← bulk of coverage
```

| Layer | Tooling | Status |
| :-- | :-- | :-- |
| Unit | Vitest (all 3 apps) | ✅ In place + expanded this audit |
| Integration | Vitest; `qa/scripts/run-e2e-checks.mjs` (live server + WS) | ⚠️ Script-level only; server not unit-importable (see §6) |
| E2E (UI) | Playwright (web) + Playwright-Electron (desktop) — **recommended, not yet added** | ❌ Gap |
| Mobile component | RN Testing Library / Expo — **recommended** | ❌ Gap (logic-only today) |
| A11y | axe-core / Playwright-axe — **recommended** | ❌ Gap |
| Load/Stress | `qa/scripts/performance-test-scripts/*` (node, k6) | ✅ Runnable; node script executed this audit |
| Dependency/secret | `npm audit` + `secretScanner` + (recommend gitleaks) | ✅ / ⚠️ scanner gaps tracked |

---

## 4. Coverage by required area

| # | Area | How it is covered | Verdict |
| :-- | :-- | :-- | :-- |
| 1 | Functional | `functional.test.ts` (all apps); planningV2, sync, collab, billing | ✅ |
| 2 | Unit | Crypto, sandbox, secretScanner, redaction, cost guard, agents | ✅ |
| 3 | Integration | planningV2.integration, billing webhook (mock), `run-e2e-checks.mjs` | ⚠️ partial |
| 4 | E2E | WS pairing script; **no UI E2E** | ⚠️ gap |
| 5 | Cross-platform | Matrix defined (§ below); not auto-exercised | ⚠️ manual |
| 6 | UI/UX | No component/render tests; screenshots are mockups | ❌ gap |
| 7 | Accessibility | None | ❌ gap |
| 8 | Security | New `companionHub.security`, `sandbox.blocklist`, `secretScanner.coverage`; security report | ✅ logic / ⚠️ runtime |
| 9 | Dependency/secret | `npm audit` (0 CVEs); scanner pattern tests + tracked gaps | ✅ / ⚠️ |
| 10 | API | webhook + auth via mock; live via script | ⚠️ partial |
| 11 | Offline/error-state | Mobile offline-queue tests; web connection-state tests | ✅ logic |
| 12 | Load | `node-load-test.mjs` executed — real numbers in perf report | ✅ |
| 13 | Stress | Concurrent REST (200) + 20 WS pairings + 50 DB writes | ✅ |
| 14 | Crash/freeze | `process_abort` test; not yet a soak/fuzz suite | ⚠️ partial |
| 15 | Release scoring | RELEASE_QA_REPORT.md | ✅ |

---

## 5. New automated tests added in this audit

| File | App | Purpose | Result |
| :-- | :-- | :-- | :-- |
| `src/backend/__tests__/secretScanner.coverage.test.ts` | Desktop | Pin detections; track missed patterns (AWS/GitHub/Stripe-live/Slack/JWT) | 8 pass + 5 tracked gaps |
| `src/backend/__tests__/companionHub.security.test.ts` | Desktop | Pairing format, rejection; document no-expiry (B4) & no-lockout (M4) | 7 pass |
| `src/backend/__tests__/sandbox.blocklist.test.ts` | Desktop | Confirm dangerous commands are blocked (never executed); track `del` gap | 9 pass + 1 tracked gap |
| `src/utils/redact.edgecases.test.ts` | Mobile | PII redaction edge cases; document incidental masking + AWS leak | 7 pass + 1 tracked gap |

All four were authored to **not** break the existing green suites.

---

## 6. Known testability blocker

`Desktop-app/src/backend/server.ts` calls `server.listen(PORT)` **at module import time**, so it cannot be imported into Vitest without starting a real listener. This is why route-level integration tests use the out-of-process `run-e2e-checks.mjs` instead. **Recommendation:** export the Express `app` separately from the `listen()` call so routes (webhook signature, auth, CORS) can be tested with `supertest` in-process.

---

## 7. CI pipeline (per-app, matches the kept structure)

```yaml
# .github/workflows/qa.yml (recommendation)
jobs:
  test:
    strategy:
      matrix:
        app: [Web-app, Desktop-app, Mobile-app]
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: ${{ matrix.app }} } }
    steps:
      - uses: actions/checkout@v4
        with: { submodules: false }   # nested repos handled per-app
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint --if-present
      - run: npm test
      - run: npm run build --if-present   # Web/Desktop only
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd Web-app && npm audit --audit-level=high
      - run: cd Desktop-app && npm audit --audit-level=high
      - run: cd Mobile-app && npm audit --audit-level=high
      # recommend: gitleaks detect --no-git
```

---

## 8. Cross-platform matrix (to be exercised before GA)

| Platform | Build target | Key risks | Priority |
| :-- | :-- | :-- | :-- |
| Windows 10/11 | NSIS EXE | sandbox, safeStorage fallback | High |
| macOS Ventura+ | DMG | `safeStorage` keychain | High |
| Web (Chrome/Firefox) | Vite static | WS companion, responsive 320–1920px | Medium |
| iOS / Android | Expo | haptics, voice, offline queue | Medium |

---

## 9. Rerun commands (single source of truth)

```bash
# --- Unit/integration (per app) ---
cd Web-app      && npm test
cd Desktop-app  && npm test
cd Mobile-app   && npm test

# --- Lint / build gates ---
cd Web-app      && npm run lint && npm run build
cd Desktop-app  && npm run lint && npm run build

# --- Live E2E WebSocket pairing (spawns test server) ---
node qa/scripts/run-e2e-checks.mjs

# --- Load / stress (spawns test server, prints PASS/FAIL verdict) ---
node qa/scripts/performance-test-scripts/node-load-test.mjs
# optional k6 (requires k6 installed):
# k6 run qa/scripts/performance-test-scripts/k6-load-test.js

# --- Dependency scan (per app) ---
cd Web-app && npm audit ; cd ../Desktop-app && npm audit ; cd ../Mobile-app && npm audit
```

A convenience aggregator already exists at [qa/scripts/run-all-tests.mjs](qa/scripts/run-all-tests.mjs).

---

## 10. Exit criteria for release

- All three `npm test` suites green (tracked `it.fails` gaps are acceptable but logged).
- `npm audit` high/critical = 0 in all apps.
- Security findings **B3, B4, B5, B2** (High) resolved; M1, M2 resolved.
- Load test verdict PASS on target hardware (startup measured against a packaged build, not `tsx`).
- At least one real UI E2E per platform passing.
