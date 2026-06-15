import { spawn } from 'child_process';
import http from 'http';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve ws dynamically from Desktop-app dependencies
const requireFromDesktop = createRequire(path.resolve(__dirname, '..', '..', '..', 'Desktop-app', 'package.json'));
const WebSocket = requireFromDesktop('ws');

const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}`;

// Pass/Fail Thresholds
const THRESHOLDS = {
  startupMs: 2000,          // Startup must be < 2 seconds
  apiAvgLatencyMs: 150,     // Average API response < 150ms
  dbAvgWriteMs: 100,        // Average DB encrypted write < 100ms
  errorRatePercent: 1.0,    // Error rate < 1%
  maxMemoryGrowthMb: 80     // Memory growth < 80MB
};

console.log('====================================================');
console.log('   KRYLEOS FORGE PERFORMANCE & STRESS TESTING SUITE  ');
console.log('====================================================\n');

// 1. Start Server Subprocess
const desktopAppDir = path.resolve(__dirname, '..', '..', '..', 'Desktop-app');
const startTime = Date.now();

const serverProcess = spawn('npx tsx src/backend/server.ts', {
  cwd: desktopAppDir,
  env: {
    ...process.env,
    PORT: PORT.toString(),
    NODE_ENV: 'test',
    KRYLEOS_DB_PATH: 'chat_history.performance.json',
    KRYLEOS_DATA_DIR: 'qa-db-performance'
  },
  shell: true
});

let serverReadyTime = 0;
let pairingCode = '';

serverProcess.stdout.on('data', (data) => {
  // Silence verbose logs, but keep startup status
  const out = data.toString();
  if (out.includes('running on')) {
    serverReadyTime = Date.now();
  }
});

serverProcess.stderr.on('data', (data) => {
  console.error(`[Server Error]: ${data.toString().trim()}`);
});

// Helper: GET request promise
function makeGetRequest(endpoint) {
  return new Promise((resolve) => {
    const start = Date.now();
    http.get(`${BASE_URL}${endpoint}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          latency: Date.now() - start,
          status: res.statusCode,
          body
        });
      });
    }).on('error', (err) => {
      resolve({
        latency: Date.now() - start,
        status: 500,
        error: err.message
      });
    });
  });
}

// Helper: POST/PUT request promise (with optional auth token)
function makeRequest(endpoint, method, payload, token = null) {
  return new Promise((resolve) => {
    const start = Date.now();
    const data = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path: endpoint,
      method,
      headers
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          latency: Date.now() - start,
          status: res.statusCode,
          body
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        latency: Date.now() - start,
        status: 500,
        error: err.message
      });
    });

    req.write(data);
    req.end();
  });
}

// 2. Poll Server Until Ready
let attempts = 0;
const maxAttempts = 30;
let terminated = false;

function checkServerReady() {
  if (terminated) return;
  attempts++;
  http.get(`${BASE_URL}/api/sessions`, (res) => {
    const startupMs = Date.now() - startTime;
    console.log(`✔ Server online. Startup time: ${startupMs} ms`);
    
    // Fetch pairing code
    http.get(`${BASE_URL}/api/companion/status`, (statusRes) => {
      let body = '';
      statusRes.on('data', (chunk) => { body += chunk; });
      statusRes.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          pairingCode = parsed.code;
          runPerformancePipeline(startupMs);
        } catch (e) {
          console.error('Failed to parse pairing code:', e);
          terminate(1);
        }
      });
    });
  }).on('error', () => {
    if (attempts >= maxAttempts) {
      console.error('❌ Server failed to start in time. Aborting.');
      terminate(1);
    }
    setTimeout(checkServerReady, 200);
  });
}

// 3. Execution Pipeline
async function runPerformancePipeline(startupMs) {
  let passed = true;
  let dbAvgWriteMs = null;
  const initialMemory = process.memoryUsage().heapUsed;
  
  console.log('\n--- 1. API LATENCY & CONCURRENT LOAD STRESS TEST ---');
  const concurrentRequests = 100;
  console.log(`Running ${concurrentRequests} concurrent REST GET requests to /api/sessions and /api/telemetry...`);
  
  const requests = [];
  const startApiLoad = Date.now();
  
  for (let i = 0; i < concurrentRequests; i++) {
    requests.push(makeGetRequest('/api/sessions'));
    requests.push(makeGetRequest('/api/telemetry'));
  }
  
  const results = await Promise.all(requests);
  const totalApiTime = Date.now() - startApiLoad;
  
  let totalLatency = 0;
  let errorCount = 0;
  results.forEach(r => {
    totalLatency += r.latency;
    if (r.status !== 200) errorCount++;
  });
  
  const apiAvgLatency = totalLatency / results.length;
  const errorRate = (errorCount / results.length) * 100;
  
  console.log(`✔ Done. Average API Latency: ${apiAvgLatency.toFixed(2)} ms`);
  console.log(`✔ HTTP Error Rate: ${errorRate.toFixed(2)}%`);

  console.log('\n--- 2. DATABASE WRITE PERFORMANCE (ENCRYPTED) ---');
  // Register a test user to obtain a Bearer token, then use PUT /api/sessions/:id/tasks
  const testEmail = `perf_test_${Date.now()}@test.local`;
  const regRes = await makeRequest('/api/auth/register', 'POST', {
    name: 'PerfTestUser', email: testEmail, password: 'PerfTest123!'
  });
  let authToken = null;
  try { authToken = JSON.parse(regRes.body)?.token; } catch {}

  // Fetch existing sessions to find a valid session ID for the write test
  const sessionsRes = await makeGetRequest('/api/sessions');
  let sessionIds = [];
  try {
    const sessions = JSON.parse(sessionsRes.body);
    if (Array.isArray(sessions)) sessionIds = sessions.map(s => s.id).filter(Boolean);
  } catch {}

  if (!authToken || sessionIds.length === 0) {
    console.log('⚠ SKIP - DB write test: requires auth token and at least one existing session');
    console.log(`  (token: ${authToken ? 'ok' : 'missing'}, sessions available: ${sessionIds.length})`);
  } else {
    const dbWriteCount = 50;
    console.log(`Writing tasks to ${sessionIds.length} session(s) via PUT /api/sessions/:id/tasks (${dbWriteCount} iterations)...`);

    let totalDbWriteTime = 0;
    let dbErrorCount = 0;

    for (let i = 0; i < dbWriteCount; i++) {
      const sessionId = sessionIds[i % sessionIds.length];
      const tasks = [{ id: `task_${i}`, content: `Perf task ${i}`, done: false }];
      const startWrite = Date.now();
      const res = await makeRequest(`/api/sessions/${sessionId}/tasks`, 'PUT', { tasks }, authToken);
      totalDbWriteTime += (Date.now() - startWrite);
      if (res.status !== 200) dbErrorCount++;
    }

    dbAvgWriteMs = totalDbWriteTime / dbWriteCount;
    const dbWritePassed = dbAvgWriteMs <= THRESHOLDS.dbAvgWriteMs && dbErrorCount === 0;
    console.log(`${dbWritePassed ? '✔ PASS' : '❌ FAIL'} - Average DB Write (Encrypted): ${dbAvgWriteMs.toFixed(2)} ms (threshold: ${THRESHOLDS.dbAvgWriteMs}ms), errors: ${dbErrorCount}`);
    if (!dbWritePassed) passed = false;
  }
  
  console.log('\n--- 3. CONCURRENT WEBSOCKET PAIRING STRESS TEST ---');
  const concurrentWS = 20;
  console.log(`Spawning ${concurrentWS} concurrent WebSockets pairing connections to /api/companion/ws...`);
  
  let wsPairingCount = 0;
  let wsErrorCount = 0;
  const wsPromises = [];
  
  for (let i = 0; i < concurrentWS; i++) {
    wsPromises.push(new Promise((resolve) => {
      const wsUrl = `${WS_URL}/api/companion/ws?code=${pairingCode}`;
      const ws = new WebSocket(wsUrl);
      let paired = false;

      ws.on('open', () => {
        // Connected
      });

      ws.on('message', (message) => {
        const data = JSON.parse(message.toString());
        if (data.type === 'connection_status' && data.status === 'paired') {
          paired = true;
          wsPairingCount++;
          ws.close();
          resolve(true);
        }
      });

      ws.on('close', () => {
        if (!paired) resolve(false);
      });

      ws.on('error', () => {
        wsErrorCount++;
        resolve(false);
      });
    }));
  }

  await Promise.all(wsPromises);
  // SEC-B4: code has a 10-min TTL; multiple companions can pair with the same valid code.
  // All concurrent connections should succeed when the code is fresh.
  const wsSecurityPassed = wsPairingCount === concurrentWS;
  console.log(
    `${wsSecurityPassed ? '✔ PASS' : '❌ FAIL'} - WS pairing: ` +
    `${wsPairingCount}/${concurrentWS} paired (expected all)`
  );

  // Calculate final resources
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryGrowthMb = (finalMemory - initialMemory) / 1024 / 1024;
  console.log(`\n✔ Memory Growth (Heap Delta): ${memoryGrowthMb.toFixed(2)} MB`);

  // 4. Threshold Validation
  console.log('\n====================================================');
  console.log('                 THRESHOLD VERDICT                  ');
  console.log('====================================================');

  // Startup
  const startupPassed = startupMs < THRESHOLDS.startupMs;
  console.log(`${startupPassed ? '✔ PASS' : '❌ FAIL'} - Startup time: ${startupMs}ms (Limit: ${THRESHOLDS.startupMs}ms)`);
  if (!startupPassed) passed = false;

  // API Latency
  const apiPassed = apiAvgLatency < THRESHOLDS.apiAvgLatencyMs;
  console.log(`${apiPassed ? '✔ PASS' : '❌ FAIL'} - API Latency: ${apiAvgLatency.toFixed(2)}ms (Limit: ${THRESHOLDS.apiAvgLatencyMs}ms)`);
  if (!apiPassed) passed = false;

  // DB Write
  if (dbAvgWriteMs !== null) {
    const dbPassed = dbAvgWriteMs < THRESHOLDS.dbAvgWriteMs;
    console.log(`${dbPassed ? '✔ PASS' : '❌ FAIL'} - DB Write Latency: ${dbAvgWriteMs.toFixed(2)}ms (Limit: ${THRESHOLDS.dbAvgWriteMs}ms)`);
    if (!dbPassed) passed = false;
  } else {
    console.log(`⚠ SKIP - DB Write Latency: test skipped (no auth token or sessions available)`);
  }

  // Error Rate
  const errorsPassed = errorRate <= THRESHOLDS.errorRatePercent;
  console.log(`${errorsPassed ? '✔ PASS' : '❌ FAIL'} - HTTP Error Rate: ${errorRate.toFixed(2)}% (Limit: ${THRESHOLDS.errorRatePercent}%)`);
  if (!errorsPassed) passed = false;

  // Memory Growth
  const memoryPassed = memoryGrowthMb < THRESHOLDS.maxMemoryGrowthMb;
  console.log(`${memoryPassed ? '✔ PASS' : '❌ FAIL'} - Memory Leak Growth: ${memoryGrowthMb.toFixed(2)}MB (Limit: ${THRESHOLDS.maxMemoryGrowthMb}MB)`);
  if (!memoryPassed) passed = false;

  // WS Security (post-SEC-B4: exactly 1 pairing per code)
  if (!wsSecurityPassed) passed = false;

  console.log('====================================================');
  if (passed) {
    console.log('         *** PERFORMANCE VALIDATION PASSED ***      ');
    console.log('====================================================');
    terminate(0);
  } else {
    console.log('         *** PERFORMANCE VALIDATION FAILED ***      ');
    console.log('====================================================');
    terminate(1);
  }
}

function terminate(code) {
  if (terminated) return;
  terminated = true;
  serverProcess.kill();
  setTimeout(() => process.exit(code), 1000);
}

// Start Checks
setTimeout(checkServerReady, 100);
