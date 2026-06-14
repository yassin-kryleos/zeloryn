# Phase 2 — Live Test Execution Results
**Date:** 2026-06-12 · **Auditor:** Claude Code (Sonnet 4.6)
**Branch:** `qa/full-test-audit` · **Environment:** Windows 11, Node 24.15.0, tsx 4.22.4

---

## 1. Unit test suites (re-verified)

| App | Files | Passing | Expected-fail gaps | Exit |
|---|---|---|---|---|
| Desktop-app | 29 | 202 | 1 (`del /f /q` sandbox) | ✅ 0 |
| Web-app | 2 | 13 | 0 | ✅ 0 |
| Mobile-app | 3 | 19 | 1 (redact edge-case) | ✅ 0 |
| **Total** | **34** | **234** | **2** | ✅ |

---

## 2. Web-app Playwright E2E (re-verified)

```
npx playwright test  →  31 passed (29.3s)  [chromium]
```

| Suite | Tests | Status |
|---|---|---|
| `smoke.e2e.ts` | 8 | ✅ all green |
| `accessibility.e2e.ts` | 5 | ✅ all green |
| `theme-a11y.e2e.ts` | 18 | ✅ all green |

---

## 3. npm audit (re-verified)

```
Web-app     → 0 vulnerabilities
Desktop-app → 0 vulnerabilities
Mobile-app  → 0 vulnerabilities
```

---

## 4. Performance / load test (`node-load-test.mjs`)

**Run conditions:** Server pre-running from a previous test invocation (not a clean spawn). Startup metric (206ms) reflects detection of already-running server, not real startup time.

| Metric | Result | Budget | Verdict |
|---|---|---|---|
| Startup (pre-running server) | 206ms | < 2000ms | ✅ PASS (not a real startup measurement) |
| Avg API latency (200 concurrent GETs) | **400.18ms** | < 150ms | ❌ **FAIL** |
| Avg DB write (50 sequential saves) | 4.28ms | < 100ms | ✅ PASS |
| HTTP error rate | 0.00% | ≤ 1% | ✅ PASS |
| Memory growth (heap delta) | 4.69MB | < 80MB | ✅ PASS |
| WS pairings succeeded | 1 / 20 | — | ⚠️ Changed post-SEC-B4 fix |

**Script exit code:** 1 (FAIL)

**Findings from this run:**
- `CL-PERF-1`: Script has a startup race condition — 15×200ms=3s timeout; server takes ~4s to spawn via `npx tsx`. The `terminate()` function waits 1,000ms before `process.exit`, allowing extra poll attempts after "abort" is logged.
- `CL-PERF-2`: API latency 400.18ms is 2.67× over the 150ms budget. Needs re-measurement in isolated, controlled conditions (clean server start, no concurrent load from other processes).
- `CL-PERF-3`: WebSocket pairing result changed from 20/20 (pre-SEC-B4) to 1/20 (post-SEC-B4). This is **correct behavior** after the security fix (code expires after first successful pair + lockout). The test script was not updated to expect the new behavior.
- `CL-PERF-4`: `DEP0190` deprecation warning in both `node-load-test.mjs` and `run-e2e-checks.mjs` — `spawn(..., { shell: true })` with array args.

**Prior Antigravity result (reference):** Startup 2,699ms, API latency 95.97ms, DB write 1.32ms, error rate 0.00%, heap 2.44MB, 20/20 WS pairings. The API latency gap (95.97ms vs 400.18ms) is most likely due to measurement conditions (pre-running server with residual load from earlier test writes vs. clean isolated run).

---

## 5. Companion WebSocket E2E (`run-e2e-checks.mjs`)

```
Server is online and listening. Fetching pairing code...
Retrieved pairing code: 338367
WebSocket handshake initiated...
Received from server: {
  type: 'connection_status',
  status: 'paired',
  workspaceRoot: 'C:\Users\yassi\Documents\Claude\Projects\Kryleos-Forge\Desktop-app',
  sessionId: 'global_session'
}
--- E2E WebSocket Pairing Validation PASSED ---
```

✅ **PASS** — Server starts, pairing code generated, WebSocket pairs successfully.

**Note:** Script emits `DEP0190` deprecation warning (same as load test — `spawn` with `shell: true`).

---

## 6. Lint gates

| App | Command | Result |
|---|---|---|
| Web-app | `npm run lint` | ❌ 1 error — `@typescript-eslint/no-explicit-any` at `App.tsx:364:159` |
| Desktop-app | `npm run lint` | ❌ 1 error + 1 warning — `react-refresh/only-export-components` at `ConfigHeader.tsx:16`; `react-hooks/exhaustive-deps` at `App.tsx:190` |

---

## 7. Build gates

| App | Command | Result |
|---|---|---|
| Web-app | `npm run build` | ✅ Clean — 736ms, `dist/index.html` 0.45 kB |
| Desktop-app | `npm run build` | ✅ Clean — 465ms; one chunk-size warning (>500kB, not an error) |
