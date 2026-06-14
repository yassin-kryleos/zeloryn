# PERFORMANCE TEST PLAN
**Project:** Kryleos Forge — Desktop Backend + Web + Mobile
**Author:** Claude Code (Phase E QA)
**Date:** 2026-06-13
**Branch:** qa/full-test-audit

---

## Overview

This document defines the performance test strategy, scripts, thresholds, and execution instructions for Kryleos Forge. Tests are designed to run in CI (no external tooling required beyond Node.js 20+) and against a locally running backend.

All test scripts live under `qa/scripts/performance-test-scripts/`.

---

## Test Scripts

### 1. `node-load-test.mjs` — API Load Test

**Purpose:** Verify the Desktop backend sustains concurrent API traffic within latency budgets.

**What it does:**
- Spawns the Express backend via `npx tsx src/backend/server.ts`
- Sends 100 concurrent `GET /api/sessions` + 100 concurrent `GET /api/telemetry` (200 total)
- Measures average response time and HTTP error rate
- Reports pass/fail verdict with per-endpoint breakdown

**Thresholds:**

| Metric | Threshold |
|---|---|
| Average API latency | < 150ms |
| HTTP error rate | < 1% |
| Server startup | < 6s (cold start, tsx) |

**Run:**
```sh
node qa/scripts/performance-test-scripts/node-load-test.mjs
```

**Prerequisites:** Node.js 20+. Backend dependencies installed (`cd Desktop-app && npm install`).

**Baseline result (2026-06-12):**

| Metric | Measured | Result |
|---|---|---|
| Average API latency | 74.59ms | ✓ PASS |
| HTTP error rate | 0% | ✓ PASS |
| Server startup | ~1800ms | ✓ PASS |

---

### 2. `stream-load-test.mjs` — WebSocket Concurrency Test

**Purpose:** Verify the companion WebSocket hub handles concurrent connections within connect-time budgets.

**What it does:**
- Reads the current pairing code from `GET /api/companion/status`
- Opens 1 WebSocket baseline connection, measures connect time and first message latency
- Opens 10 concurrent WebSocket connections, measures success rate and average connect time

**Thresholds:**

| Metric | Threshold |
|---|---|
| WS connection establishment | < 200ms average |
| First message latency | < 500ms |
| Concurrent connection success rate (10 sockets) | ≥ 90% |

**Run:**
```sh
node qa/scripts/performance-test-scripts/stream-load-test.mjs
```

**Prerequisites:** Desktop backend running on port 3001. Start with:
```sh
cd Desktop-app && npm run server
```

**Baseline result (2026-06-12, from `CLAUDE_PERFORMANCE_REVIEW.md`):**

| Metric | Measured | Result |
|---|---|---|
| Concurrent WS success rate | 20/20 (100%) | ✓ PASS |
| Connect time | < 200ms | ✓ PASS |

---

### 3. `stress-test.mjs` — Sustained Load Test

**Purpose:** Verify the backend maintains stability and low error rates under sustained high-concurrency traffic.

**What it does:**
- Sends 5 waves of 50 concurrent requests each (250 total) against `/api/sessions`, `/api/telemetry`, and `/api/companion/status`
- Pauses 500ms between waves
- Measures p50, p95, p99 latency across all waves, total error rate, and Node.js heap growth

**Thresholds:**

| Metric | Threshold |
|---|---|
| p95 latency | < 500ms |
| Error rate | < 5% |
| Memory (heap) growth | < 150MB |

**Run:**
```sh
node qa/scripts/performance-test-scripts/stress-test.mjs
```

**Prerequisites:** Desktop backend running on port 3001.

---

## Known Gap: Database Write Performance

The `node-load-test.mjs` scenario "DB write performance" previously called `POST /api/sessions/save`, which does not exist (returns 404). This means **encrypted write performance has never been measured**.

The correct endpoint for session task updates is `PUT /api/sessions/:id/tasks` with a valid Bearer token.

**Gap ID:** PERF-DB  
**Impact:** Medium — we have no latency data for AES-256 encrypted writes under load.  
**Fix:** Update `node-load-test.mjs` to:
1. Call `POST /api/auth/register` to obtain a token
2. Create a session via `POST /api/sessions` (or use an existing session ID)
3. Call `PUT /api/sessions/:id/tasks` 50 times sequentially with the obtained token

---

## Supplementary: k6 Load Test

`qa/scripts/performance-test-scripts/k6-load-test.js` contains a k6 script for higher-fidelity load testing (requires the k6 binary). It ramps from 0 → 50 → 0 virtual users over 3 minutes and includes per-endpoint breakdown.

**Run (k6 required):**
```sh
k6 run qa/scripts/performance-test-scripts/k6-load-test.js
```

This is optional — the three Node.js scripts above cover all thresholds without external tooling.

---

## Performance Findings From Prior Audits

| ID | Severity | Area | Finding | Status |
|---|---|---|---|---|
| PERF-01 | MEDIUM | Bundle | Desktop-app JS chunk 605.31 kB (threshold: 500 kB) | ⚠️ Open |
| PERF-02 | LOW | Polling | `/api/telemetry` polled at ~1 req/sec by Web companion | ℹ️ Info |
| PERF-DB | MEDIUM | Testing | DB write performance has not been measured (wrong test endpoint) | ⚠️ Gap |

### PERF-01 Detail: Bundle Size

```
dist/assets/index-[hash].js  605.31 kB │ gzip: ~180 kB
(!) Some chunks are larger than 500 kB after minification.
```

**Recommendation:** Apply `React.lazy()` + `Suspense` code-splitting for heavy tabs (Planning Architect, Settings, Downloads). Split at the route level in `App.tsx`.

**Effort:** 2–4 hours.

### PERF-02 Detail: Telemetry Polling

`GET /api/telemetry` is called approximately once per second by the Web companion. Over a session lifetime, this produces 200+ requests. Each resolves in < 10ms and the endpoint is lightweight. No immediate action required, but a WebSocket push or 5-second polling interval would eliminate the sustained HTTP traffic.

---

## CI Integration

Add to Desktop-app's `package.json`:
```json
{
  "scripts": {
    "test:perf": "node ../qa/scripts/performance-test-scripts/node-load-test.mjs",
    "test:stress": "node ../qa/scripts/performance-test-scripts/stress-test.mjs"
  }
}
```

The scripts exit with code 0 on pass and code 1 on failure, suitable for CI gate integration.

---

## Execution Order for Release Verification

Run tests in this order to avoid interference:

1. `node-load-test.mjs` — auto-spawns and kills the backend, self-contained
2. Start backend manually: `cd Desktop-app && npm run server`
3. `stream-load-test.mjs` — requires running backend
4. `stress-test.mjs` — requires running backend
5. Stop backend
6. `node qa/scripts/release-score.mjs` — aggregates all evidence into final score

Total estimated runtime: ~5 minutes.
