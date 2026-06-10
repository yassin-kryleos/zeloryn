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

const serverProcess = spawn('npx', ['tsx', 'src/backend/server.ts'], {
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

// Helper: POST request promise
function makePostRequest(endpoint, payload) {
  return new Promise((resolve) => {
    const start = Date.now();
    const data = JSON.stringify(payload);
    
    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
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
const maxAttempts = 15;

function checkServerReady() {
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
  const dbWriteCount = 50;
  console.log(`Saving ${dbWriteCount} chat sessions sequentially to stress write/read encryption...`);
  
  let totalDbWriteTime = 0;
  let dbErrorCount = 0;
  
  for (let i = 0; i < dbWriteCount; i++) {
    const sessionData = {
      id: `session_perf_${i}_${Date.now()}`,
      title: `Stress Test Session ${i}`,
      createdAt: new Date().toISOString(),
      logs: [],
      checklist: [`Log ${i}`, 'Task verified'],
      space: 'chat'
    };
    
    const startWrite = Date.now();
    const res = await makePostRequest('/api/sessions/save', sessionData);
    totalDbWriteTime += (Date.now() - startWrite);
    if (res.status !== 200) dbErrorCount++;
  }
  
  const dbAvgWriteMs = totalDbWriteTime / dbWriteCount;
  console.log(`✔ Done. Average DB Save (Encrypted Write): ${dbAvgWriteMs.toFixed(2)} ms`);
  
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
      
      ws.on('open', () => {
        // Connected
      });
      
      ws.on('message', (message) => {
        const data = JSON.parse(message.toString());
        if (data.type === 'connection_status' && data.status === 'paired') {
          wsPairingCount++;
          ws.close();
          resolve(true);
        }
      });
      
      ws.on('error', () => {
        wsErrorCount++;
        resolve(false);
      });
    }));
  }
  
  await Promise.all(wsPromises);
  console.log(`✔ Done. Successfully paired WebSockets: ${wsPairingCount} / ${concurrentWS}`);

  // Calculate final resources
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryGrowthMb = (finalMemory - initialMemory) / 1024 / 1024;
  console.log(`\n✔ Memory Growth (Heap Delta): ${memoryGrowthMb.toFixed(2)} MB`);

  // 4. Threshold Validation
  console.log('\n====================================================');
  console.log('                 THRESHOLD VERDICT                  ');
  console.log('====================================================');
  
  let passed = true;

  // Startup
  const startupPassed = startupMs < THRESHOLDS.startupMs;
  console.log(`${startupPassed ? '✔ PASS' : '❌ FAIL'} - Startup time: ${startupMs}ms (Limit: ${THRESHOLDS.startupMs}ms)`);
  if (!startupPassed) passed = false;

  // API Latency
  const apiPassed = apiAvgLatency < THRESHOLDS.apiAvgLatencyMs;
  console.log(`${apiPassed ? '✔ PASS' : '❌ FAIL'} - API Latency: ${apiAvgLatency.toFixed(2)}ms (Limit: ${THRESHOLDS.apiAvgLatencyMs}ms)`);
  if (!apiPassed) passed = false;

  // DB Write
  const dbPassed = dbAvgWriteMs < THRESHOLDS.dbAvgWriteMs;
  console.log(`${dbPassed ? '✔ PASS' : '❌ FAIL'} - DB Write Latency: ${dbAvgWriteMs.toFixed(2)}ms (Limit: ${THRESHOLDS.dbAvgWriteMs}ms)`);
  if (!dbPassed) passed = false;

  // Error Rate
  const errorsPassed = errorRate <= THRESHOLDS.errorRatePercent;
  console.log(`${errorsPassed ? '✔ PASS' : '❌ FAIL'} - HTTP Error Rate: ${errorRate.toFixed(2)}% (Limit: ${THRESHOLDS.errorRatePercent}%)`);
  if (!errorsPassed) passed = false;

  // Memory Growth
  const memoryPassed = memoryGrowthMb < THRESHOLDS.maxMemoryGrowthMb;
  console.log(`${memoryPassed ? '✔ PASS' : '❌ FAIL'} - Memory Leak Growth: ${memoryGrowthMb.toFixed(2)}MB (Limit: ${THRESHOLDS.maxMemoryGrowthMb}MB)`);
  if (!memoryPassed) passed = false;

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
  serverProcess.kill();
  setTimeout(() => {
    process.exit(code);
  }, 1000);
}

// Start Checks
setTimeout(checkServerReady, 100);
