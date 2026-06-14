# TEST STRATEGY — KRYLEOS FORGE
**Prepared by:** Claude Code (QA Lead)
**Date:** 2026-06-13
**Branch:** qa/full-test-audit
**Status:** AWAITING APPROVAL — No test files will be written until this strategy is approved

---

## 1. Strategy Overview

### Goal
Bring all three apps from their current combined score of **6.3 / 10** to a release-ready **≥ 8.5 / 10** by closing the coverage gaps identified in `QA_AUDIT_REPORT.md`.

### Approach — Test Pyramid

```
         /\
        /  \         E2E (Playwright)
       /    \        — Desktop renderer smoke
      /------\       — Mobile web smoke
     /        \      — Cross-platform matrix
    /----------\
   /            \    Integration
  /              \   — Express route suite (supertest)
 /----------------\  — WebSocket companion tests
/                  \
/------------------\ Unit (existing + new)
                     — Renderer components
                     — Error boundary behaviour
                     — Bundle size regression
```

### Non-negotiable principles
1. Every test has a clear PASS/FAIL condition.
2. Tests run without production credentials.
3. Tests never hit external APIs (all LLM calls mocked).
4. Tests are repeatable in CI and locally with one command.
5. No test mutates shared state (isolated DB dirs via `KRYLEOS_DATA_DIR`).

---

## 2. Test Environment

### 2.1 Environment Variables for Test Runs

All test processes will set:
```
NODE_ENV=test
KRYLEOS_DATA_DIR=<os.tmpdir()>/kryleos-test-<pid>   # isolated per run
OAUTH_SIM_ENABLED=false                              # no sim in tests
STRIPE_SECRET_KEY=sk_test_mock_key                   # mock only
PORT=3099                                            # avoid port clash with dev
```

### 2.2 Backend Server Strategy

The current `server.ts` calls `server.listen()` at module load time, which blocks `supertest`. The fix:
- Extract the Express `app` export separately from the `listen()` call
- Tests import `{ app }` and use `supertest(app)` without starting a port
- `server.ts` only calls `listen()` when `require.main === module` (or equivalent ESM guard)

This requires a **one-time refactor of `server.ts`** (approved separately as P0 code fix).

### 2.3 Mock Strategy

| External Dependency | Mock Approach |
|---|---|
| DeepSeek / OpenAI / Gemini / Anthropic / Ollama | `vitest.mock()` on provider modules |
| Stripe API | `sk_test_mock_key` + mock webhook handler |
| Google OAuth | `OAUTH_SIM_ENABLED=true` + sim secret |
| File system (DB) | Isolated temp dir per test run |
| WebSocket (companionHub) | Direct `ws` client connections to test server |
| Electron IPC | Unit tests only (no Electron process in CI) |

---

## 3. Coverage Plan by Area

### 3.1 Functional Testing

**Tool:** Vitest (unit) + Playwright (E2E)

#### Desktop Renderer — NEW
File: `Desktop-app/src/__tests__/renderer.functional.test.tsx`

| Test Case | PASS Condition |
|---|---|
| App mounts without errors | No thrown exceptions; title renders |
| Project sidebar renders existing projects | Projects list visible |
| Create new project via form | Toast "created successfully" appears |
| Switch between 4 workspace spaces | Each space renders its heading |
| CONFIG panel opens on CONFIG click | Panel visible with 8 tabs |
| Each CONFIG tab renders content | Tab content visible after click |
| Theme switches and persists to localStorage | `matrix_theme` key updated |
| Companion chip shows correct count | Header shows "Companion: N connected" |
| GUIDE opens OnboardingTutorial (lazy load) | Tutorial content renders |
| `renderMd()` converts `**text**` to `<strong>` | DOM contains `<strong>` element |
| Double-submit guard on auth form | Second click within 100ms blocked |
| Hamburger nav toggles on mobile breakpoint | Nav hidden/shown on viewport resize |

#### Mobile Renderer — NEW
File: `Mobile-app/src/__tests__/renderer.functional.test.tsx`

| Test Case | PASS Condition |
|---|---|
| App mounts; 5 tabs render | All tab labels present |
| Dashboard tab: telemetry section visible | WORKSPACE TELEMETRY heading |
| Plan tab: plan draft + architect chat | Both sections render |
| Tasks tab: 4 checklist items render | 4 checkbox items visible |
| Settings tab: backend URL, pairing fields | Inputs present |
| Header shows BACKEND ONLINE (no WS pair) | Label = "BACKEND ONLINE" |
| Header shows DESKTOP LINKED (WS paired) | Label = "DESKTOP LINKED" |
| Header shows LINK OFFLINE (sim toggle) | Label = "LINK OFFLINE" |
| Offline simulator toggle changes header | Label changes on click |
| PII redaction fires on plan input | API key stripped from output |

### 3.2 Unit Testing

**Tool:** Vitest

#### New unit tests needed

**Desktop renderer components:**
File: `Desktop-app/src/__tests__/components.unit.test.tsx`

| Component/Function | Test Cases |
|---|---|
| `renderMd(text)` | Bold converts to `<strong>`; no conversion for plain text; nested `**` handled |
| `ConfigHeader` (lazy) | Mounts without crash; close button fires callback |
| `CoworkSpace` (lazy) | Mounts without crash; team status renders |
| `ErrorBoundary` | Renders fallback UI when child throws; error logged |
| `ProjectBoard` | Empty state message shown when no projects |

**Desktop backend — additional:**
File: `Desktop-app/src/backend/__tests__/routes.unit.test.ts`

| Function | Test Cases |
|---|---|
| `stripHtml()` | Strips `<script>`, `<img>`, nested tags, empty string passthrough |
| `sanitizeTask()` | Non-string fields unchanged; array of tasks sanitized |
| `hashPassword()` | Returns `salt:hash` format |
| `verifyPassword()` | Correct password passes; wrong password fails; timing-safe |
| `mergeTasks()` | Later `lastModified` wins; missing fields defaulted; duplicate IDs merged |

### 3.3 Integration Testing

**Tool:** Vitest + supertest

File: `Desktop-app/src/backend/__tests__/routes.integration.test.ts`

**Prerequisite:** `server.ts` refactored to export `app` separately from `listen()`.

| Route Group | Test Cases |
|---|---|
| **Auth** | Register → 200 with token; duplicate email → 409; bad password format → 400; login correct → 200; login wrong password → 401; missing body → 400 |
| **Rate limiting** | 30 requests → all 200; 31st request → 429; window reset logic |
| **Subscribe** | With valid token → 200; without token → 401; invalid tier → 400 |
| **Sessions CRUD** | GET /sessions → 200 array; GET /:id → 200; GET unknown id → 404; DELETE → 200; PUT tasks → 200; PUT without auth → 401 |
| **XSS sanitization** | PUT tasks with `<script>` → stored value stripped; `<img onerror>` → stripped |
| **JSON error handling** | Malformed JSON body → 400 `{"error":"Invalid JSON body"}`; no stack trace in response |
| **Helmet headers** | All 6 security headers present on every response |
| **Billing** | checkout-session with token → 200 mock URL; without token → 401 |
| **Sync push/pull** | Push with valid token + basic tier → 200; free tier → 403; pull → returns pushed data |
| **Companion status** | GET /companion/status → `{code, connectedCount}`; code is 6-digit string |
| **Telemetry** | GET /telemetry → 200 with valid JSON |

### 3.4 End-to-End Testing

**Tool:** Playwright 1.60 (Chromium)

#### Desktop E2E — NEW
File: `Desktop-app/e2e/smoke.e2e.ts`

| Flow | Steps | PASS Condition |
|---|---|---|
| App loads | Navigate to http://localhost:5173 | Title = "Kryleos Forge // Multi-Agent Workspace" |
| Space navigation | Click Plan, Crew, Flow, Forge | Each space heading visible |
| Add new project | Click +Add project → fill form → submit | Toast "created successfully" |
| CONFIG panel | Click CONFIG → click all 8 tabs | Each tab renders content |
| Theme switch | CONFIG → Account → LIGHT → Save | `body.className` = "theme-light" |
| GUIDE overlay | Click GUIDE | Tutorial modal visible |
| Companion chip | Initial state | "Companion: 0 connected" |
| Model selector | Open dropdown | 6 provider groups present |

File: `Desktop-app/e2e/companion-pairing.e2e.ts`

| Flow | PASS Condition |
|---|---|
| Start backend + renderer, open companion status | Code returned |
| Enter code in a WebSocket client | Pairing status `connected` |
| Companion count updates in renderer | "Companion: 1 connected" visible |

#### Mobile E2E — NEW
File: `Mobile-app/e2e/smoke.e2e.ts`

| Flow | PASS Condition |
|---|---|
| App loads (Expo web) | "⚡ KRYLEOS FORGE // COMPANION" visible |
| All 5 tabs accessible | Labels: Dashboard, Plan, Chat, Tasks, Settings |
| Header initial state | "BACKEND ONLINE" (HTTP only) |
| Offline simulator toggle | Label changes to "LINK OFFLINE" |
| Settings: pairing input visible | COMPANION PAIRING CODE field present |
| Tasks: 4 checkboxes render | 4 task items visible |

### 3.5 Cross-Platform Testing

**Tool:** Playwright multi-project config

File: `Web-app/playwright.config.ts` (update existing)

| Platform | Browser | Viewport | Tests |
|---|---|---|---|
| Desktop wide | Chromium | 1440×900 | All smoke + a11y |
| Desktop narrow | Chromium | 1024×768 | All smoke + a11y |
| Mobile viewport | Chromium | 375×812 | Mobile breakpoint, hamburger nav |
| Firefox | Firefox | 1440×900 | Smoke only |
| WebKit (Safari) | WebKit | 1440×900 | Smoke only |

Desktop-app Playwright will run Chromium only (Electron renderer targets Chromium).

### 3.6 UI/UX Testing

**Tool:** Playwright + manual checklist

File: `Desktop-app/e2e/ux.e2e.ts`

| Check | PASS Condition |
|---|---|
| Toast auto-dismisses | Toast gone after 5 seconds |
| Modal closes on Escape key | Overlay not present |
| Modal closes on backdrop click | Overlay not present |
| Nav tabs highlight active | `aria-selected="true"` on active tab |
| Loading states during lazy-load | Suspense fallback renders briefly |
| Error state on network failure | Error message shown, not blank screen |
| Theme persists on page reload | Body class matches localStorage after reload |

### 3.7 Accessibility Testing

**Tool:** @axe-core/playwright

#### Desktop — NEW
File: `Desktop-app/e2e/accessibility.e2e.ts`

| Scan | PASS Condition |
|---|---|
| Initial load (Plan space) | 0 critical/serious axe violations |
| Crew space | 0 critical/serious |
| Flow space | 0 critical/serious |
| Forge space | 0 critical/serious |
| CONFIG panel open | 0 critical/serious |
| GUIDE modal open | 0 critical/serious |
| FORGE dark theme | 0 critical/serious |
| LIGHT theme | 0 critical/serious |
| Keyboard: Tab through CONFIG tabs | Focus visible on each tab |
| Keyboard: Escape closes CONFIG | CONFIG not in DOM |

#### Mobile — NEW
File: `Mobile-app/e2e/accessibility.e2e.ts`

| Scan | PASS Condition |
|---|---|
| Dashboard tab | 0 critical/serious axe violations |
| Settings tab | 0 critical/serious |
| Tasks tab | 0 critical/serious |

### 3.8 Security Testing

**Tool:** Vitest (route integration) + manual checklist

File: `Desktop-app/src/backend/__tests__/security.integration.test.ts`

| Test | PASS Condition |
|---|---|
| XSS in task content field | Tags stripped; `<script>` not stored |
| XSS via URL-encoded `%3Cscript%3E` | Decoded and stripped |
| SQL-like injection in email field | Stored as plain string, no error |
| Oversized JSON body (2 MB) | 413 or 400, no crash |
| Malformed JSON | 400 `{"error":"Invalid JSON body"}`, no stack trace |
| Auth with forged token | 401, no data leaked |
| Auth without token | 401 |
| Rate limit: 31st request on auth | 429 |
| Rate limit: Stripe webhook not limited | 200 (webhook excluded from limiter) |
| Helmet: all 6 headers present | All present on every response |
| CORS: origin outside allowlist | 403 or no ACAO header |
| Secret scanner: detects `sk-proj-*` | Pattern matches and flags |
| Secret scanner: detects `ghp_*` (GitHub PAT) | Pattern matches (after SEC-NEW-05 fix) |
| `stripHtml`: nested tag `<s<script>cript>` | Fully stripped |

### 3.9 Dependency & Secret Scanning

**Tool:** `npm audit` + `secretScanner.ts` unit tests

File: `Desktop-app/src/backend/__tests__/secretScanner.extended.test.ts`

| Check | PASS Condition |
|---|---|
| `npm audit --audit-level=moderate` — Desktop | 0 vulnerabilities |
| `npm audit --audit-level=moderate` — Web | 0 vulnerabilities |
| `npm audit --audit-level=moderate` — Mobile | 0 vulnerabilities |
| Secret scanner: AWS key pattern | `AKIA*` detected |
| Secret scanner: GitHub PAT | `ghp_*` detected |
| Secret scanner: Slack token | `xoxb-*` detected |
| Secret scanner: Stripe live key | `sk_live_*` detected |
| Secret scanner: private key block | `-----BEGIN RSA PRIVATE KEY-----` detected |

### 3.10 API Testing

**Tool:** supertest via Vitest integration tests (covered in 3.3)

Additional contract tests:
File: `Desktop-app/src/backend/__tests__/api.contract.test.ts`

| Contract | PASS Condition |
|---|---|
| `GET /api/sessions` response shape | `Array<{id, name, tasks, ...}>` |
| `GET /api/companion/status` shape | `{code: string(6), connectedCount: number}` |
| `GET /api/telemetry` shape | `{uptime, memory, sessions, ...}` |
| `POST /api/auth/register` shape | `{success: true, user: {email, tier, token, isPremium}}` |
| `POST /api/auth/login` shape | Same as register |
| Error response shape | Always `{error: string}`, never raw stack |

### 3.11 Offline / Error-State Testing

**Tool:** Playwright (network interception)

File: `Desktop-app/e2e/offline.e2e.ts`

| Scenario | PASS Condition |
|---|---|
| Backend unreachable on load | Error message shown; app doesn't blank/crash |
| Backend goes offline mid-session | Toast or status indicator updates |
| WebSocket disconnects | Companion chip shows 0 connected |
| API call fails (500 response) | Error toast shown; form re-enabled |
| Mobile offline simulator active | "LINK OFFLINE" shown; queue accepts inputs |
| Mobile offline → reconnect | Queue drains; status returns to BACKEND ONLINE |

### 3.12 Load Testing

**Tool:** `node-load-test.mjs` (existing, now fixed)

File: `qa/scripts/performance-test-scripts/node-load-test.mjs` (existing)

Thresholds (existing, verified):
| Metric | Threshold |
|---|---|
| Server startup | < 2000 ms |
| API average latency (200 concurrent) | < 150 ms |
| DB encrypted write (50 iterations) | < 100 ms |
| HTTP error rate | < 1% |
| Memory growth (heap delta) | < 80 MB |
| WebSocket pairing (20 concurrent) | 20/20 paired |

**New load scenarios to add:**
File: `qa/scripts/performance-test-scripts/stream-load-test.mjs`

| Scenario | Threshold |
|---|---|
| 10 concurrent WS `query` messages (streaming) | All respond; no dropped connections |
| 50 rapid session GETs (cold) | Average < 50 ms |
| 100 PUT tasks writes (authenticated) | Average < 100 ms; 0 errors |

### 3.13 Stress Testing

**Tool:** Extended node-load-test with spike scenarios

File: `qa/scripts/performance-test-scripts/stress-test.mjs`

| Scenario | PASS Condition |
|---|---|
| 500 concurrent GET requests | Server returns 200s or 429s; no crash |
| 50 concurrent WS connections | Server handles gracefully; no crash |
| Rapid register/login cycle × 100 | Rate limiter engages at 30; 429s after |
| Sustained 60-second load | Memory growth < 150 MB; no restart |
| Malformed body × 50 concurrent | All return 400; no crash |

### 3.14 Crash / Freeze Testing

**Tool:** Playwright + manual

File: `Desktop-app/e2e/resilience.e2e.ts`

| Scenario | PASS Condition |
|---|---|
| Child component throws | Error Boundary renders fallback, not blank screen |
| Invalid prop to lazy component | Suspense handles; no white screen |
| localStorage unavailable | App still loads (graceful degradation) |
| Rapid space switching × 20 | No freeze; final space renders correctly |
| CONFIG opened + closed × 10 rapid | No memory leak; panel toggles correctly |

### 3.15 Release Readiness Scoring

File: `qa/scripts/release-score.mjs` (NEW)

This script will:
1. Run all test suites
2. Run `npm audit` on all three apps
3. Run TypeScript compilation check on all three apps
4. Run ESLint on Desktop and Web
5. Scan for any `TODO` / `FIXME` comments in source (non-blocking, informational)
6. Output a scored report against the 9-category rubric from `QA_AUDIT_REPORT.md`
7. Print a final release readiness score out of 10

---

## 4. New Files to Create (Pending Approval)

### Phase 1 — Code Fixes (P0, no tests)
These are prerequisite code changes, not test files. Require separate approval.

| File | Change | Purpose |
|---|---|---|
| `Desktop-app/src/App.tsx` | Add `ErrorBoundary` component wrapping main content | UX-NEW-01 |
| `Mobile-app/App.tsx` | Add `ErrorBoundary` component | UX-NEW-02 |
| `Desktop-app/src/backend/server.ts` | Extract `app` export; add body size limit; prod key guard | SEC-NEW-02 + integration test enabler |
| `Desktop-app/src/backend/secretScanner.ts` | Add AWS/GitHub/Slack/Stripe patterns | SEC-NEW-05 |

### Phase 2 — Test Files

| File | Type | App | Lines (est.) |
|---|---|---|---|
| `Desktop-app/src/backend/__tests__/routes.integration.test.ts` | Integration | Desktop backend | ~350 |
| `Desktop-app/src/backend/__tests__/api.contract.test.ts` | Contract | Desktop backend | ~120 |
| `Desktop-app/src/backend/__tests__/security.integration.test.ts` | Security | Desktop backend | ~200 |
| `Desktop-app/src/backend/__tests__/secretScanner.extended.test.ts` | Unit | Desktop backend | ~80 |
| `Desktop-app/src/__tests__/renderer.functional.test.tsx` | Functional | Desktop renderer | ~200 |
| `Desktop-app/src/__tests__/components.unit.test.tsx` | Unit | Desktop renderer | ~150 |
| `Desktop-app/e2e/smoke.e2e.ts` | E2E | Desktop renderer | ~150 |
| `Desktop-app/e2e/companion-pairing.e2e.ts` | E2E | Desktop renderer | ~80 |
| `Desktop-app/e2e/accessibility.e2e.ts` | A11y | Desktop renderer | ~120 |
| `Desktop-app/e2e/ux.e2e.ts` | UX | Desktop renderer | ~100 |
| `Desktop-app/e2e/offline.e2e.ts` | Offline | Desktop renderer | ~100 |
| `Desktop-app/e2e/resilience.e2e.ts` | Crash | Desktop renderer | ~80 |
| `Desktop-app/playwright.config.ts` | Config | Desktop | ~50 |
| `Mobile-app/src/__tests__/renderer.functional.test.tsx` | Functional | Mobile | ~150 |
| `Mobile-app/e2e/smoke.e2e.ts` | E2E | Mobile | ~80 |
| `Mobile-app/e2e/accessibility.e2e.ts` | A11y | Mobile | ~60 |
| `Mobile-app/playwright.config.ts` | Config | Mobile | ~40 |
| `Web-app/playwright.config.ts` | Config update | Web | ~60 |
| `qa/scripts/performance-test-scripts/stream-load-test.mjs` | Load | Backend | ~120 |
| `qa/scripts/performance-test-scripts/stress-test.mjs` | Stress | Backend | ~150 |
| `qa/scripts/release-score.mjs` | Score | All | ~100 |

**Total new test lines: ~2,490**

---

## 5. Test Execution Order

```
Phase A — Quick validation (< 2 min)
  1. npm audit (all three apps)
  2. tsc --noEmit (Desktop, Web, Mobile)
  3. ESLint (Desktop, Web)

Phase B — Unit tests (< 3 min)
  4. Desktop backend: npm test
  5. Web: npm test
  6. Mobile: npm test

Phase C — Integration tests (< 5 min)
  7. Desktop backend integration (supertest, requires server.ts refactor)
  8. WebSocket companion integration

Phase D — E2E tests (< 10 min)
  9. Web E2E: playwright test
  10. Desktop E2E: playwright test (Vite dev server)
  11. Mobile E2E: playwright test (Expo web)

Phase E — Accessibility (< 5 min)
  12. Web a11y: playwright test accessibility.e2e.ts
  13. Desktop a11y: playwright test accessibility.e2e.ts
  14. Mobile a11y: playwright test accessibility.e2e.ts

Phase F — Performance (< 8 min)
  15. Load test: node-load-test.mjs
  16. Stream load test
  17. Stress test

Phase G — Release score
  18. release-score.mjs (aggregates all results)
```

**Total estimated CI time: ~33 minutes**

---

## 6. Single Command to Run Everything

```bash
# After all test files are generated:
node qa/scripts/run-all-tests.mjs

# Or individually:
npm run test:all       # (to be added to root package.json)
```

### Proposed root `package.json` scripts
```json
"test:all":      "node qa/scripts/run-all-tests.mjs",
"test:backend":  "cd Desktop-app && npm test",
"test:web":      "cd Web-app && npm test && npm run test:e2e",
"test:mobile":   "cd Mobile-app && npm test",
"test:e2e":      "cd Desktop-app && npx playwright test",
"test:a11y":     "npx playwright test **/accessibility.e2e.ts",
"test:perf":     "node qa/scripts/performance-test-scripts/node-load-test.mjs",
"test:stress":   "node qa/scripts/performance-test-scripts/stress-test.mjs",
"test:score":    "node qa/scripts/release-score.mjs",
"audit:deps":    "cd Desktop-app && npm audit && cd ../Web-app && npm audit && cd ../Mobile-app && npm audit"
```

---

## 7. Acceptance Criteria for Release

All of the following must be green before the release score is submitted:

| Criterion | Target |
|---|---|
| Desktop backend unit tests | 100% pass |
| Desktop route integration tests | 100% pass |
| Desktop renderer E2E smoke | 100% pass |
| Desktop accessibility | 0 critical/serious axe violations |
| Web unit tests | 100% pass |
| Web Playwright E2E | 100% pass |
| Web accessibility | 0 critical/serious axe violations (existing) |
| Mobile unit tests | 100% pass |
| Mobile Playwright E2E smoke | 100% pass |
| npm audit (all apps) | 0 vulnerabilities (moderate+) |
| TypeScript (all apps) | 0 errors |
| ESLint (Desktop + Web) | 0 errors |
| Load test thresholds | All 5 metrics pass |
| Error boundaries present | Desktop + Mobile confirmed |
| Secret scanner extended patterns | AWS + GitHub + Slack + Stripe live detected |

---

## 8. Out of Scope (Documented Limitations)

| Area | Reason |
|---|---|
| Native iOS/Android device testing | Requires physical device or paid cloud service; not in project scope |
| Electron packaged binary testing | Requires `electron-builder` run; viable in CI with additional setup |
| Real LLM API calls in tests | Would incur costs and require production keys |
| Real Stripe payment flow | Test mode only; no live payment testing |
| Real Google OAuth | Sim mode only |
| Real voice recognition | Native binary; not testable in Node/Playwright |
| Cross-browser on Mobile (Safari iOS) | Requires macOS + Xcode |
| macOS/Linux Desktop CI | Windows only for this engagement; noted for future |

---

*Awaiting approval. Upon receiving "approved" or "proceed", test file generation will begin in the order listed in Section 4.*
