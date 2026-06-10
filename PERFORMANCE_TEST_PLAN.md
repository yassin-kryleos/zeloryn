# Performance Test Plan — Kryleos Forge

**Date:** 2026-06-10 · **Branch:** `qa/full-test-audit` · **Owner:** Performance/QA Lead
**Scope:** Desktop Express backend (port 3001), WebSocket companion gateway, JSON-file persistence, codebase-graph rendering. No production credentials; runs against `NODE_ENV=test` with `qa-db*` dirs and `chat_history.performance.json`.

---

## 1. Objectives

Validate that the local backend meets latency, throughput, memory, and stability budgets under load and stress, and identify the first bottleneck before GA.

## 2. Tooling

| Tool | File | Use |
| :-- | :-- | :-- |
| Node harness (spawns server, asserts thresholds) | [qa/scripts/performance-test-scripts/node-load-test.mjs](qa/scripts/performance-test-scripts/node-load-test.mjs) | Primary, executed this audit |
| k6 (HTTP load profile) | [qa/scripts/performance-test-scripts/k6-load-test.js](qa/scripts/performance-test-scripts/k6-load-test.js) | Optional, requires k6 install |
| autocannon | (recommend) | Sustained HTTP throughput |

## 3. Thresholds (pass/fail gates)

| Metric | Budget | Rationale |
| :-- | :-- | :-- |
| Startup time | < 2000 ms | App feels responsive on launch |
| Avg API latency (200 concurrent GET) | < 150 ms | Interactive responsiveness |
| Avg encrypted DB write | < 100 ms | Smooth session save |
| HTTP error rate | ≤ 1% | Reliability under load |
| Heap growth over run | < 80 MB | No gross leak |

---

## 4. Executed results (2026-06-10, dev machine, `npx tsx` server)

| Metric | Result | Budget | Verdict |
| :-- | :-- | :-- | :-- |
| Startup time | **2699 ms** | < 2000 ms | ❌ FAIL\* |
| Avg API latency (200 concurrent reqs) | **95.97 ms** | < 150 ms | ✅ PASS |
| Avg encrypted DB write (50 seq) | **1.32 ms** | < 100 ms | ✅ PASS |
| HTTP error rate | **0.00%** | ≤ 1% | ✅ PASS |
| Concurrent WS pairings | **20 / 20 paired** | — | ✅ (but see note) |
| Heap growth | **2.44 MB** | < 80 MB | ✅ PASS |

\***Startup "fail" is a measurement artifact:** the harness times `npx tsx src/backend/server.ts`, which includes TypeScript cold-compile. **Re-measure against the packaged Electron build** before treating this as a real regression. 4 of 5 true runtime budgets pass with wide margins.

> **Security note (cross-ref SEC-B4/M4):** 20/20 concurrent sockets paired with a single code and **no throttling** — a performance "pass" that is simultaneously a security finding. Once rate limiting lands, this scenario should expect rejections.

---

## 5. Test scenarios

### Load
- **L1 API concurrency:** 200 concurrent GETs to `/api/sessions` + `/api/telemetry`. Gate: avg < 150 ms, errors ≤ 1%. **Status: PASS.**
- **L2 Encrypted DB writes:** 50 sequential session saves. Gate: avg < 100 ms. **Status: PASS.**
- **L3 WS pairing fan-in:** 20 concurrent companion pairings. Gate: all handshake. **Status: PASS (flag security).**

### Stress (to add / extend)
- **S1 Concurrent DB writes:** 50 *parallel* `/api/sessions/save` to expose JSON file-lock contention (SEC-M5). Gate: no lost/corrupted records. **Status: TODO.**
- **S2 Large context:** prompt with >100 KB attachment / >15,000-char block. Gate: response completes, heap growth < budget, no crash. **Status: TODO.**
- **S3 Graph node stress:** render codebase graph for a tree of >1,000 files. Gate: no UI-thread freeze > 200 ms sustained. **Status: TODO (needs UI harness).**

### Soak / crash-freeze
- **C1 Sustained 30-min load** at L1 rate; watch heap slope for leaks. **Status: TODO.**
- **C2 Abort under load:** trigger `process_abort` mid-command during L1. Gate: clean termination, no orphan child processes. (`process_abort.test.ts` covers the unit path.) **Status: partial.**

---

## 6. Bottleneck analysis

- **Primary current bottleneck:** cold-start compile via `tsx` (startup metric). Mitigation: ship precompiled backend in the Electron bundle; re-baseline.
- **Latent risk:** JSON-file persistence under concurrent writes (S1) — measure before claiming scale.
- **No memory leak** observed in the short run (2.44 MB growth); confirm with C1 soak.

## 7. Rerun commands

```bash
# Full node load/stress harness (spawns its own test server, prints verdict)
node qa/scripts/performance-test-scripts/node-load-test.mjs

# k6 profile (requires k6)
k6 run qa/scripts/performance-test-scripts/k6-load-test.js
```

## 8. Exit criteria

- Startup re-measured on the **packaged build** and < 2000 ms.
- L1–L3 PASS; S1 PASS (no corruption); C1 shows flat heap.
- Any threshold FAIL has a filed finding with severity + fix.
