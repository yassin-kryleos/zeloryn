# Phase 2 — Issues Found
**Date:** 2026-06-12 · **Auditor:** Claude Code (Sonnet 4.6)

Severity scale: **Critical** | **High** | **Medium** | **Low** | **Info**

---

## CL-PERF-1 — Performance test startup race condition
**Severity:** Medium
**File:** `qa/scripts/performance-test-scripts/node-load-test.mjs`
**Status:** Open

`checkServerReady()` polls 15 × 200ms = 3,000ms for the server to start. `npx tsx src/backend/server.ts` cold-start takes ~4 seconds on this machine. Additionally, `terminate()` calls `serverProcess.kill()` then waits `setTimeout(process.exit, 1000)` — during that 1-second window, extra `setTimeout(checkServerReady, 200)` calls already queued continue firing, allowing the test to partially succeed even after declaring abort. The result is unreliable: 4 "abort" messages, then one scenario runs before `process.exit` fires.

**Impact:** Performance test cannot be reliably run from a cold start. The Antigravity reported results may have been obtained with a pre-warmed tsx cache or a pre-running server.

**Recommendation:** Increase `maxAttempts` to 25+ (5 seconds), or measure against the packaged Electron binary (which doesn't need tsx compilation). Also add a `clearTimeout` guard in `terminate()` to prevent post-abort polls.

---

## CL-PERF-2 — API latency over budget under concurrent load
**Severity:** Medium
**Metric:** 400.18ms measured vs. 150ms budget (2.67× over)
**Status:** Open — needs isolated re-measurement

In this run the server was pre-running (spawned by a previous test), had residual state from 50 DB writes from an earlier aborted test run, and was sharing machine resources with the Web-app preview server. The Antigravity baseline of 95.97ms was obtained under different conditions (likely a clean server + smaller DB file).

**Impact:** Unknown whether this is a real regression or a measurement artefact. If it persists on a clean isolated run, the API latency budget fails.

**Recommendation:** Re-run `node-load-test.mjs` against a freshly spawned server on a clean DB file with no competing processes. If latency still exceeds 150ms, profile `/api/sessions` reads (file-based DB with encryption overhead is the likely bottleneck under 200 concurrent hits).

---

## CL-PERF-3 — WS pairing stress test outdated after SEC-B4 fix
**Severity:** Low
**File:** `qa/scripts/performance-test-scripts/node-load-test.mjs`
**Status:** Open (test maintenance)

The performance test sends 20 concurrent WebSocket connections with the **same** pairing code and expects all 20 to pair successfully. After the SEC-B4 fix (pairing code expires after first successful use + 5-attempt lockout), the expected result changed: only 1 connection should pair, then the code is consumed and remaining attempts are rejected.

Measured result: **1/20 paired** — which is the **correct post-fix behaviour**, but the script treats it as a pass/fail metric without a threshold, so it's unclear whether the test now considers this a failure or just informational.

**Impact:** The performance test's WS scenario is testing a scenario the security fix intentionally prevents. The test is stale and gives misleading output.

**Recommendation:** Update the WS scenario to test legitimate pairing behaviour (one connection per code), or redesign it to assert that all connections *except* the first are properly rejected.

---

## CL-PERF-4 — DEP0190 deprecation warning in QA scripts
**Severity:** Low
**Files:** `qa/scripts/performance-test-scripts/node-load-test.mjs`, `qa/scripts/run-e2e-checks.mjs`
**Status:** Open

Both scripts use `spawn(cmd, args, { shell: true })` passing an args array with `shell: true`. Node emits `[DEP0190] DeprecationWarning: Passing args to a child process with shell option true can lead to security vulnerabilities`. This warning appears on every test run and will become noisier as Node deprecates this pattern.

**Recommendation:** Switch to `spawn(cmd, { shell: true })` (passing the full command as a single string) or `spawn(cmd, args, { shell: false })` with explicit path resolution.

---

## CL-LINT-1 — Web-app lint error contradicts round-4 "clean" claim
**Severity:** Medium
**File:** `Web-app/src/App.tsx:364:159`
**Rule:** `@typescript-eslint/no-explicit-any`
**Status:** Open

```ts
const [thinkingCapability, setThinkingCapability] = useState<'low' | 'medium' | 'high' | 'ultra'>(
  () => (localStorage.getItem('web_thinking_capability') as any) || 'medium'
);
```

Antigravity's round-4 update states "Web-app lint now clean (0 errors)." A live `npm run lint` returns 1 error. The fix is trivial: cast to the union type instead of `any`.

**Fix:**
```ts
() => (localStorage.getItem('web_thinking_capability') as 'low' | 'medium' | 'high' | 'ultra') || 'medium'
```

---

## CL-LINT-2 — Desktop-app lint errors not reported by Antigravity
**Severity:** Low
**Files:** `Desktop-app/src/components/ConfigHeader.tsx:16`, `Desktop-app/src/App.tsx:190`
**Status:** Open

Two lint issues not mentioned in any Antigravity report:
1. **Error** `react-refresh/only-export-components` at `ConfigHeader.tsx:16` — file exports both an interface and a component; HMR fast-refresh is degraded.
2. **Warning** `react-hooks/exhaustive-deps` at `App.tsx:190` — `useEffect` is missing `thinkingCapability` in its dependency array.

Neither is a functional bug, but both need resolving before lint is claimed clean.

---

## CL-SEC-1 — OAuth simulation path relies on single env-var guard (residual M1)
**Severity:** Medium (residual)
**File:** `Desktop-app/src/backend/sync.ts:15`
**Status:** Open (acknowledged)

```ts
const OAUTH_SIM_ENABLED = process.env.NODE_ENV !== 'production';
```

The OAuth simulation bypass (`google-oauth-flow-secret` / `apple-oauth-flow-secret`) is active whenever `NODE_ENV` is anything other than the exact string `'production'`. In any staging, CI, or misconfigured deployment this path is open. This is the same single-env-var defence pattern that was flagged as a concern for the Stripe webhook (SEC-M2). SEC-M2 was noted as fixed; the parallel risk in sync.ts was not separately remediated — it remains as a residual risk.

**Recommendation:** Add a second, explicit `OAUTH_SIM_ENABLED=true` env flag that must be affirmatively set, rather than relying solely on `NODE_ENV !== 'production'`.

---

## CL-UI-1 — LOG IN button CSS transform breaks text-based selectors (Info)
**Severity:** Info
**File:** `Web-app/src/App.tsx` (LOG IN button render)
**Status:** Informational

The LOG IN button's DOM text is `"Log In"` but CSS `text-transform: uppercase` makes it appear as `"LOG IN"`. Automated selectors using visible text will fail unless they use the DOM-cased version. The existing Playwright E2E tests (`smoke.e2e.ts`) use correct selectors, so this is not a test-blocking issue — it is an observation for future test authors.

---

## CL-SCRIPT-1 — Performance test cannot run reliably without a pre-warmed server (operational)
**Severity:** Medium
**Status:** Open

Due to CL-PERF-1, the only reliable way to execute `node-load-test.mjs` today is to pre-start the Desktop backend on port 3001, then immediately invoke the script. The script will detect the running server before its own spawned instance competes for the port. This workaround is undocumented and fragile.

**Recommendation:** Document the pre-start workaround, or fix the startup timeout as described in CL-PERF-1, before including the performance test in CI.
