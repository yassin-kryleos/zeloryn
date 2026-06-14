/**
 * Stress test — sustained high-concurrency HTTP load against the Desktop backend.
 *
 * Sends 5 waves of 50 concurrent requests each (250 total) with 500ms between waves.
 * Measures p50/p95/p99 latencies, error rate, and memory growth.
 *
 * Thresholds:
 *   - p95 latency: < 500ms
 *   - error rate: < 5%
 *   - memory growth: < 150MB
 *
 * Usage: node qa/scripts/performance-test-scripts/stress-test.mjs
 * Requires: Desktop backend running on port 3001
 */

import http from 'http';

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

const CONFIG = {
  waves: 5,
  concurrencyPerWave: 50,
  wavePauseMs: 500,
  endpoints: ['/api/sessions', '/api/telemetry', '/api/companion/status'],
};

const THRESHOLDS = {
  p95Ms: 500,
  errorRatePercent: 5,
  memoryGrowthMb: 150,
};

console.log('============================================================');
console.log('   KRYLEOS FORGE — SUSTAINED STRESS TEST                   ');
console.log('============================================================\n');
console.log(`Config: ${CONFIG.waves} waves × ${CONFIG.concurrencyPerWave} req = ${CONFIG.waves * CONFIG.concurrencyPerWave} total requests`);

function makeGetRequest(endpoint) {
  return new Promise((resolve) => {
    const start = Date.now();
    http.get(`${BASE_URL}${endpoint}`, (res) => {
      res.resume();
      res.on('end', () => resolve({ latency: Date.now() - start, status: res.statusCode }));
    }).on('error', (err) => resolve({ latency: Date.now() - start, status: 0, error: err.message }));
  });
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runStressTest() {
  // Verify backend is reachable
  try {
    await makeGetRequest('/api/sessions');
  } catch {
    console.error('❌ Backend not reachable. Start: cd Desktop-app && npm run server');
    process.exit(1);
  }

  const initialMemory = process.memoryUsage().heapUsed;
  const allLatencies = [];
  let totalErrors = 0;
  let totalRequests = 0;

  for (let wave = 1; wave <= CONFIG.waves; wave++) {
    const waveStart = Date.now();
    const requests = [];

    for (let i = 0; i < CONFIG.concurrencyPerWave; i++) {
      const endpoint = CONFIG.endpoints[i % CONFIG.endpoints.length];
      requests.push(makeGetRequest(endpoint));
    }

    const results = await Promise.all(requests);
    const waveElapsed = Date.now() - waveStart;

    const waveLatencies = results.map(r => r.latency);
    const waveErrors = results.filter(r => r.status === 0 || r.status >= 500).length;

    allLatencies.push(...waveLatencies);
    totalErrors += waveErrors;
    totalRequests += results.length;

    const sorted = [...waveLatencies].sort((a, b) => a - b);
    console.log(
      `Wave ${wave}/${CONFIG.waves}: ${results.length} req | ` +
      `p50=${percentile(sorted, 50)}ms p95=${percentile(sorted, 95)}ms | ` +
      `errors=${waveErrors} | elapsed=${waveElapsed}ms`
    );

    if (wave < CONFIG.waves) {
      await new Promise(r => setTimeout(r, CONFIG.wavePauseMs));
    }
  }

  // Results
  const sortedAll = [...allLatencies].sort((a, b) => a - b);
  const p50 = percentile(sortedAll, 50);
  const p95 = percentile(sortedAll, 95);
  const p99 = percentile(sortedAll, 99);
  const errorRate = (totalErrors / totalRequests) * 100;

  const finalMemory = process.memoryUsage().heapUsed;
  const memGrowthMb = (finalMemory - initialMemory) / 1024 / 1024;

  console.log('\n============================================================');
  console.log('                    STRESS TEST VERDICT                    ');
  console.log('============================================================');

  let passed = true;

  const p95Ok = p95 < THRESHOLDS.p95Ms;
  console.log(`${p95Ok ? '✔ PASS' : '❌ FAIL'} - p95 Latency: ${p95}ms (limit: ${THRESHOLDS.p95Ms}ms) | p50=${p50}ms p99=${p99}ms`);
  if (!p95Ok) passed = false;

  const errOk = errorRate <= THRESHOLDS.errorRatePercent;
  console.log(`${errOk ? '✔ PASS' : '❌ FAIL'} - Error Rate: ${errorRate.toFixed(2)}% (limit: ${THRESHOLDS.errorRatePercent}%) | ${totalErrors}/${totalRequests} failed`);
  if (!errOk) passed = false;

  const memOk = memGrowthMb < THRESHOLDS.memoryGrowthMb;
  console.log(`${memOk ? '✔ PASS' : '❌ FAIL'} - Memory Growth: ${memGrowthMb.toFixed(1)}MB (limit: ${THRESHOLDS.memoryGrowthMb}MB)`);
  if (!memOk) passed = false;

  console.log('============================================================');
  console.log(passed ? '        *** STRESS TEST PASSED ***' : '        *** STRESS TEST FAILED ***');
  console.log('============================================================');

  process.exit(passed ? 0 : 1);
}

runStressTest().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
