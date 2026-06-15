import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const desktop = path.join(root, 'Desktop-app');
const launchDir = path.join(root, 'launch');
const durationMs = Number(process.env.SOAK_DURATION_MS || 30 * 60 * 1000);
const port = Number(process.env.SOAK_PORT || 3011);
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kryleos-soak-'));
const tsxCli = path.join(desktop, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const startedAt = new Date();

const server = spawn(process.execPath, [tsxCli, 'src/backend/server.ts'], {
  cwd: desktop,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    KRYLEOS_DATA_DIR: tempDir,
    KRYLEOS_DB_PATH: path.join(tempDir, 'chat_history.json')
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Server exited early (${server.exitCode}).\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/telemetry`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Server did not become ready.\n${serverOutput}`);
}

async function sampleMemoryMb() {
  try {
    const response = await fetch(`${baseUrl}/api/telemetry`, { signal: AbortSignal.timeout(2_000) });
    const telemetry = await response.json();
    return Number.isFinite(telemetry.processRssMb) ? telemetry.processRssMb : null;
  } catch {
    return null;
  }
}

function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))];
}

async function stopServer() {
  if (server.exitCode === null) server.kill();
  await Promise.race([
    new Promise(resolve => server.once('exit', resolve)),
    delay(5_000)
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

let requests = 0;
let failures = 0;
const latencies = [];
const memorySamples = [];
const endpoints = ['/api/telemetry', '/api/sessions', '/api/providers/detect'];

try {
  await waitForServer();
  let nextMemorySample = Date.now();
  const deadline = Date.now() + durationMs;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Server exited during soak (${server.exitCode}).\n${serverOutput}`);
    if (Date.now() >= nextMemorySample) {
      memorySamples.push({ elapsedMs: Date.now() - startedAt.getTime(), workingSetMb: await sampleMemoryMb() });
      nextMemorySample += 60_000;
    }

    const requestStarted = performance.now();
    try {
      const isCredentialWrite = requests % 40 === 39;
      const response = await fetch(isCredentialWrite ? `${baseUrl}/api/credentials` : `${baseUrl}${endpoints[requests % endpoints.length]}`, {
        method: isCredentialWrite ? 'POST' : 'GET',
        headers: isCredentialWrite ? { 'content-type': 'application/json' } : undefined,
        body: isCredentialWrite ? JSON.stringify({ soakHeartbeat: new Date().toISOString() }) : undefined,
        signal: AbortSignal.timeout(2_000)
      });
      if (!response.ok) failures++;
      await response.arrayBuffer();
    } catch {
      failures++;
    }
    latencies.push(performance.now() - requestStarted);
    requests++;
    await delay(250);
  }

  memorySamples.push({ elapsedMs: Date.now() - startedAt.getTime(), workingSetMb: await sampleMemoryMb() });
} finally {
  await stopServer();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const validMemory = memorySamples.map(sample => sample.workingSetMb).filter(value => value !== null);
const memoryGrowthMb = validMemory.length > 1 ? Math.round((validMemory.at(-1) - validMemory[0]) * 10) / 10 : null;
const peakMemoryMb = validMemory.length ? Math.max(...validMemory) : null;
const errorRatePercent = requests ? failures / requests * 100 : 100;
const result = {
  startedAt: startedAt.toISOString(),
  durationMs,
  requests,
  failures,
  errorRatePercent: Math.round(errorRatePercent * 1000) / 1000,
  latencyMs: {
    average: Math.round(latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length) * 10) / 10,
    p95: Math.round(percentile(latencies, 0.95) * 10) / 10,
    max: Math.round(Math.max(0, ...latencies) * 10) / 10
  },
  memory: { initialMb: validMemory[0] ?? null, finalMb: validMemory.at(-1) ?? null, peakMb: peakMemoryMb, growthMb: memoryGrowthMb, samples: memorySamples },
  thresholds: { maxErrorRatePercent: 1, maxP95LatencyMs: 500, maxMemoryGrowthMb: 80 }
};
result.passed = result.errorRatePercent <= result.thresholds.maxErrorRatePercent
  && result.latencyMs.p95 <= result.thresholds.maxP95LatencyMs
  && result.memory.growthMb !== null
  && result.memory.growthMb <= result.thresholds.maxMemoryGrowthMb;

fs.mkdirSync(launchDir, { recursive: true });
fs.writeFileSync(path.join(launchDir, 'soak-results.json'), `${JSON.stringify(result, null, 2)}\n`);
fs.writeFileSync(path.join(launchDir, 'SOAK_QA.md'), `# 30-minute session soak\n\n- Result: **${result.passed ? 'PASS' : 'FAIL'}**\n- Started: ${result.startedAt}\n- Duration: ${(durationMs / 60_000).toFixed(1)} minutes\n- Requests: ${requests}\n- Failures: ${failures} (${result.errorRatePercent}%)\n- Latency: ${result.latencyMs.average} ms average, ${result.latencyMs.p95} ms p95, ${result.latencyMs.max} ms max\n- Backend working set: ${result.memory.initialMb} MB initial, ${result.memory.finalMb} MB final, ${result.memory.peakMb} MB peak, ${result.memory.growthMb} MB growth\n\nTraffic continuously rotates telemetry, sessions, provider detection, and atomic credential writes. Raw samples: [soak-results.json](./soak-results.json).\n`);

console.log(JSON.stringify(result, null, 2));
process.exit(result.passed ? 0 : 1);
