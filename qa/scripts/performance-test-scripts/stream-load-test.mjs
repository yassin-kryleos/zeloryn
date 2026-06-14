/**
 * Stream load test — measures server-sent event / WebSocket streaming throughput
 * under concurrent connections to the companion WebSocket endpoint.
 *
 * Thresholds:
 *   - WS connection establishment: < 200ms average
 *   - First message latency: < 500ms
 *   - 10 concurrent streams: all should connect successfully
 *
 * Usage: node qa/scripts/performance-test-scripts/stream-load-test.mjs
 * Requires: Desktop backend running on port 3001
 */

import http from 'http';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const requireFromDesktop = createRequire(
  path.resolve(__dirname, '..', '..', '..', 'Desktop-app', 'package.json')
);
const WebSocket = requireFromDesktop('ws');

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}`;

const THRESHOLDS = {
  wsConnectMs: 200,
  firstMessageMs: 500,
  concurrentStreams: 10,
  successRate: 0.9,
};

console.log('============================================================');
console.log('   KRYLEOS FORGE — STREAM / WEBSOCKET LOAD TEST            ');
console.log('============================================================\n');

function getPairingCode() {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}/api/companion/status`, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body).code); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function connectWS(wsUrl, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const connectStart = Date.now();
    const ws = new WebSocket(wsUrl);
    let firstMessageAt = null;
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.terminate();
        resolve({ connected: false, connectMs: Date.now() - connectStart, firstMessageMs: null, error: 'timeout' });
      }
    }, timeoutMs);

    ws.on('open', () => {
      const connectMs = Date.now() - connectStart;
      ws.on('message', (data) => {
        if (!firstMessageAt) {
          firstMessageAt = Date.now() - connectStart;
          clearTimeout(timer);
          if (!resolved) {
            resolved = true;
            ws.close();
            resolve({ connected: true, connectMs, firstMessageMs: firstMessageAt });
          }
        }
      });
      // If no message arrives, resolve as connected after a brief wait
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          ws.close();
          resolve({ connected: true, connectMs, firstMessageMs: null });
        }
      }, 2000);
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        resolve({ connected: false, connectMs: Date.now() - connectStart, firstMessageMs: null, error: err.message });
      }
    });

    ws.on('close', () => {
      clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        resolve({ connected: false, connectMs: Date.now() - connectStart, firstMessageMs: null, error: 'closed' });
      }
    });
  });
}

async function runStreamLoadTest() {
  let passed = true;

  // 1. Get pairing code
  let pairingCode;
  try {
    pairingCode = await getPairingCode();
    console.log(`✔ Backend reachable. Pairing code: ${pairingCode}`);
  } catch (err) {
    console.error(`❌ Cannot reach backend: ${err.message}`);
    console.error('   Start the Desktop backend: cd Desktop-app && npm run server');
    process.exit(1);
  }

  const wsUrl = `${WS_URL}/api/companion/ws?code=${pairingCode}`;

  // 2. Single connection baseline
  console.log('\n--- 1. SINGLE WS CONNECTION BASELINE ---');
  const baseline = await connectWS(wsUrl);
  const baselineConnectOk = baseline.connectMs < THRESHOLDS.wsConnectMs;
  console.log(`${baselineConnectOk ? '✔ PASS' : '❌ FAIL'} - Connect time: ${baseline.connectMs}ms (limit: ${THRESHOLDS.wsConnectMs}ms)`);
  if (!baselineConnectOk) passed = false;

  if (baseline.firstMessageMs !== null) {
    const firstMsgOk = baseline.firstMessageMs < THRESHOLDS.firstMessageMs;
    console.log(`${firstMsgOk ? '✔ PASS' : '❌ FAIL'} - First message latency: ${baseline.firstMessageMs}ms (limit: ${THRESHOLDS.firstMessageMs}ms)`);
    if (!firstMsgOk) passed = false;
  } else {
    console.log('⚠ SKIP - No push message received (server may not push until agent query)');
  }

  // 3. Concurrent WS connections
  console.log(`\n--- 2. CONCURRENT WS LOAD (${THRESHOLDS.concurrentStreams} connections) ---`);
  const concurrentStart = Date.now();
  const results = await Promise.all(
    Array.from({ length: THRESHOLDS.concurrentStreams }, () => connectWS(wsUrl))
  );
  const concurrentElapsed = Date.now() - concurrentStart;

  const successCount = results.filter(r => r.connected).length;
  const successRate = successCount / THRESHOLDS.concurrentStreams;
  const avgConnectMs = results.filter(r => r.connected).reduce((s, r) => s + r.connectMs, 0) / Math.max(successCount, 1);

  const successOk = successRate >= THRESHOLDS.successRate;
  const avgOk = avgConnectMs < THRESHOLDS.wsConnectMs;

  console.log(`${successOk ? '✔ PASS' : '❌ FAIL'} - Connection success rate: ${(successRate * 100).toFixed(0)}% (${successCount}/${THRESHOLDS.concurrentStreams})`);
  console.log(`${avgOk ? '✔ PASS' : '❌ FAIL'} - Average connect time: ${avgConnectMs.toFixed(1)}ms (limit: ${THRESHOLDS.wsConnectMs}ms)`);
  console.log(`✔ INFO - Total elapsed for ${THRESHOLDS.concurrentStreams} concurrent: ${concurrentElapsed}ms`);

  if (!successOk) passed = false;
  if (!avgOk) passed = false;

  // 4. Summary
  console.log('\n============================================================');
  if (passed) {
    console.log('        *** STREAM LOAD TEST PASSED ***');
  } else {
    console.log('        *** STREAM LOAD TEST FAILED ***');
  }
  console.log('============================================================');
  process.exit(passed ? 0 : 1);
}

runStreamLoadTest().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
