/**
 * Release readiness score calculator for Kryleos Forge.
 *
 * Collects evidence from:
 *   - npm test exit codes and counts (Desktop + Web + Mobile)
 *   - TypeScript noEmit exit codes
 *   - ESLint exit codes
 *   - npm audit results (production deps only)
 *   - Playwright E2E suites — pass/fail by exit code, not file presence
 *   - Security and performance findings from QA reports
 *   - Phase-gate assertions: public-surface honesty grep, PreviewDeck
 *     canned-reply check, and a live backend smoke test (self-start +
 *     forged-tier rejection)
 *
 * Produces a weighted score from 0-10 and prints a summary table.
 *
 * Usage: node qa/scripts/release-score.mjs
 * Run from the project root (Kryleos-Forge/).
 *
 * The E2E and phase-gate checks spawn real processes (Playwright browsers,
 * a backend server instance) and can take several minutes. Set SKIP_E2E=1
 * to skip the Playwright run for a faster local iteration — this scores
 * E2E as 0 (not run = not proven), it never inflates the result.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, readdirSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This script lives at qa/scripts/release-score.mjs, so the project root is two
// levels up (qa/scripts -> qa -> Kryleos-Forge).
const ROOT = path.resolve(__dirname, '..', '..');

const WEIGHTS = {
  unitTests:       0.20,  // Desktop + Web + Mobile unit test suites
  typecheck:       0.10,  // TypeScript noEmit on all 3 apps
  lint:            0.05,  // ESLint on Desktop + Web
  security:        0.10,  // npm audit + no high CVEs
  e2eTests:        0.15,  // E2E suites pass by exit code (Playwright)
  errorBoundary:   0.05,  // ErrorBoundary in Desktop + Mobile
  bodyLimit:       0.05,  // express.json({ limit }) applied
  perfScripts:     0.05,  // Performance test scripts runnable
  qaReports:       0.05,  // QA audit report + test strategy present
  phaseGates:      0.20,  // Honesty + security phase-gate assertions (forged-tier 403, no canned replies, backend self-start)
};

function run(cmd, cwd, timeoutMs = 120_000, extraEnv = {}) {
  try {
    const output = execSync(cmd, { cwd, stdio: 'pipe', timeout: timeoutMs, env: { ...process.env, ...extraEnv } }).toString();
    return { ok: true, output };
  } catch (err) {
    const out = (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '');
    return { ok: false, output: out };
  }
}

function check(label, score, weight, notes) {
  return { label, score, weight, weighted: score * weight, notes };
}

console.log('============================================================');
console.log('   KRYLEOS FORGE — RELEASE READINESS SCORE                 ');
console.log('============================================================\n');

const checks = [];

// 1. Unit tests
console.log('Checking unit tests...');
const desktopTest = run('npm test', path.join(ROOT, 'Desktop-app'));
const webTest = run('npm test', path.join(ROOT, 'Web-app'));
const mobileTest = run('npm test', path.join(ROOT, 'Mobile-app'));
const testsPassing = [desktopTest, webTest, mobileTest].filter(r => r.ok).length;
const testScore = testsPassing / 3;
checks.push(check(
  'Unit tests (Desktop + Web + Mobile)',
  testScore,
  WEIGHTS.unitTests,
  `${testsPassing}/3 suites pass`
));

// 2. TypeScript
console.log('Checking TypeScript...');
const desktopTS = run('npx tsc --noEmit', path.join(ROOT, 'Desktop-app'));
const webTS = run('npx tsc --noEmit', path.join(ROOT, 'Web-app'));
const mobileTS = run('npx tsc --noEmit', path.join(ROOT, 'Mobile-app'));
const tsPassing = [desktopTS, webTS, mobileTS].filter(r => r.ok).length;
checks.push(check(
  'TypeScript (noEmit, all 3 apps)',
  tsPassing / 3,
  WEIGHTS.typecheck,
  `${tsPassing}/3 clean`
));

// 3. Lint
console.log('Checking lint...');
const desktopLint = run('npm run lint', path.join(ROOT, 'Desktop-app'));
const webLint = run('npm run lint', path.join(ROOT, 'Web-app'));
const lintPassing = [desktopLint, webLint].filter(r => r.ok).length;
checks.push(check(
  'ESLint (Desktop + Web)',
  lintPassing / 2,
  WEIGHTS.lint,
  `${lintPassing}/2 clean`
));

// 4. Security (npm audit)
// Audit PRODUCTION runtime dependencies only (--omit=dev). Build tooling such as
// vite/tsx/esbuild is a devDependency: it never ships inside the packaged Electron
// app, the Web bundle, or the Expo build, so a dev-only advisory is not a release
// risk. Release readiness measures the SHIPPED artifact's attack surface.
console.log('Checking npm audit (production deps)...');
const desktopAudit = run('npm audit --omit=dev --audit-level=high', path.join(ROOT, 'Desktop-app'));
const webAudit = run('npm audit --omit=dev --audit-level=high', path.join(ROOT, 'Web-app'));
const mobileAudit = run('npm audit --omit=dev --audit-level=high', path.join(ROOT, 'Mobile-app'));
const auditPassing = [desktopAudit, webAudit, mobileAudit].filter(r => r.ok).length;
checks.push(check(
  'npm audit (0 high/critical CVEs, prod deps)',
  auditPassing / 3,
  WEIGHTS.security,
  `${auditPassing}/3 clean (production runtime)`
));

// 5. E2E suites — pass by exit code, not file presence
console.log('Checking E2E suites (Playwright, pass/fail by exit code)...');
const e2eApps = [
  { name: 'Web-app', dir: path.join(ROOT, 'Web-app') },
  { name: 'Desktop-app', dir: path.join(ROOT, 'Desktop-app') },
  { name: 'Mobile-app', dir: path.join(ROOT, 'Mobile-app') },
];
const e2eConfigured = e2eApps.filter(a => existsSync(path.join(a.dir, 'playwright.config.ts')));

let e2eScore = 0;
let e2eNotes = 'no Playwright config found';
if (process.env.SKIP_E2E === '1') {
  e2eNotes = `skipped (SKIP_E2E=1) — counts as not proven, ${e2eConfigured.length} app(s) configured`;
} else if (e2eConfigured.length > 0) {
  const e2eResults = e2eConfigured.map(a => {
    const r = run('npx playwright test --reporter=line', a.dir, 240_000, { CI: '1' });
    return { ...a, ok: r.ok };
  });
  const e2ePassing = e2eResults.filter(r => r.ok).length;
  e2eScore = e2ePassing / e2eConfigured.length;
  e2eNotes = `${e2ePassing}/${e2eConfigured.length} apps pass (${e2eResults.map(r => `${r.name}=${r.ok ? 'PASS' : 'FAIL'}`).join(', ')})`;
}
checks.push(check(
  'E2E suites passing (Playwright, exit code)',
  e2eScore,
  WEIGHTS.e2eTests,
  e2eNotes
));

// 6. ErrorBoundary in Desktop + Mobile
const desktopAppPath = path.join(ROOT, 'Desktop-app', 'src', 'App.tsx');
const mobileAppPath = path.join(ROOT, 'Mobile-app', 'App.tsx');
const desktopHasEB = existsSync(desktopAppPath) &&
  readFileSync(desktopAppPath, 'utf8').includes('class ErrorBoundary');
const mobileHasEB = existsSync(mobileAppPath) &&
  readFileSync(mobileAppPath, 'utf8').includes('class ErrorBoundary');
const ebScore = (desktopHasEB ? 0.5 : 0) + (mobileHasEB ? 0.5 : 0);
checks.push(check(
  'ErrorBoundary in Desktop + Mobile App.tsx',
  ebScore,
  WEIGHTS.errorBoundary,
  `Desktop=${desktopHasEB ? 'YES' : 'NO'}, Mobile=${mobileHasEB ? 'YES' : 'NO'}`
));

// 7. Body limit
const serverPath = path.join(ROOT, 'Desktop-app', 'src', 'backend', 'server.ts');
const hasBodyLimit = existsSync(serverPath) &&
  readFileSync(serverPath, 'utf8').includes('express.json({ limit:');
checks.push(check(
  'express.json body size limit applied',
  hasBodyLimit ? 1 : 0,
  WEIGHTS.bodyLimit,
  hasBodyLimit ? 'limit: 1mb present' : 'MISSING'
));

// 8. Performance scripts runnable (syntax check)
const perfScripts = [
  path.join(ROOT, 'qa', 'scripts', 'performance-test-scripts', 'node-load-test.mjs'),
  path.join(ROOT, 'qa', 'scripts', 'performance-test-scripts', 'stream-load-test.mjs'),
  path.join(ROOT, 'qa', 'scripts', 'performance-test-scripts', 'stress-test.mjs'),
  path.join(ROOT, 'qa', 'scripts', 'performance-test-scripts', 'session-soak.mjs'),
];
const perfOk = perfScripts.filter(f => {
  if (!existsSync(f)) return false;
  const r = run(`node --check "${f}"`, ROOT);
  return r.ok;
}).length;
checks.push(check(
  'Performance scripts syntax-valid',
  perfOk / perfScripts.length,
  WEIGHTS.perfScripts,
  `${perfOk}/${perfScripts.length} scripts valid`
));

// 9. QA reports present
const qaReports = [
  path.join(ROOT, 'qa', 'claude-code-review', 'reports', 'QA_AUDIT_REPORT.md'),
  path.join(ROOT, 'qa', 'claude-code-review', 'reports', 'TEST_STRATEGY.md'),
  path.join(ROOT, 'qa', 'claude-code-review', 'reports', 'CLAUDE_DESKTOP_LIVE_TEST.md'),
  path.join(ROOT, 'qa', 'claude-code-review', 'reports', 'CLAUDE_MOBILE_LIVE_TEST.md'),
];
const reportsPresent = qaReports.filter(f => existsSync(f)).length;
checks.push(check(
  'QA reports present',
  reportsPresent / qaReports.length,
  WEIGHTS.qaReports,
  `${reportsPresent}/${qaReports.length} present`
));

// 10. Phase-gate assertions — honesty + security, automated
console.log('Checking phase-gate assertions...');

// 10a. Public surfaces clean of "only"/"Matrix-Coding" overclaims
function collectFiles(dir, exts, out) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, exts, out);
    else if (exts.some(ext => entry.name.endsWith(ext))) out.push(full);
  }
}
const publicSurfaceFiles = [];
collectFiles(path.join(ROOT, 'Web-app', 'src'), ['.ts', '.tsx'], publicSurfaceFiles);
collectFiles(path.join(ROOT, 'Desktop-app', 'src', 'components'), ['.ts', '.tsx'], publicSurfaceFiles);
collectFiles(path.join(ROOT, 'Mobile-app', 'src'), ['.ts', '.tsx'], publicSurfaceFiles);
if (existsSync(path.join(ROOT, 'README.md'))) publicSurfaceFiles.push(path.join(ROOT, 'README.md'));

const overclaimPattern = /matrix-coding|\bthe only\b[^.]{0,40}\b(app|tool|platform|ai|coding)\b/i;
const overclaimHits = publicSurfaceFiles
  .filter(f => overclaimPattern.test(readFileSync(f, 'utf8')))
  .map(f => path.relative(ROOT, f));
const honestyOk = overclaimHits.length === 0;

// 10b. PreviewDeck has no canned-reply string (Side Chat must call a real
// model or be removed — a hardcoded "AI" response is exactly what this
// gate exists to catch).
const previewDeckPath = path.join(ROOT, 'Desktop-app', 'src', 'components', 'PreviewDeck.tsx');
const previewDeckHasCanned = existsSync(previewDeckPath) &&
  readFileSync(previewDeckPath, 'utf8').includes('Context note queued');
const previewDeckOk = !previewDeckHasCanned;

// 10c/10d. Launch the backend through the executable and unpacked resources
// produced by electron-builder, then verify an authenticated Free account
// cannot forge a paid tier.
function postJson(url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...extraHeaders,
      },
    }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('request timed out')));
    req.write(data);
    req.end();
  });
}

function packagedArtifactPaths(desktopDir) {
  const output = path.join(desktopDir, 'dist-desktop');
  if (process.platform === 'win32') {
    const root = path.join(output, 'win-unpacked');
    const winCandidates = [
      path.join(root, 'Zeloryn.exe'),
      path.join(root, 'Kryleos Forge.exe'),
    ];
    return {
      executable: winCandidates.find(existsSync) || winCandidates[0],
      serverBundle: path.join(root, 'resources', 'app.asar.unpacked', 'dist-backend', 'server.cjs'),
    };
  }
  if (process.platform === 'darwin') {
    const macCandidates = [
      path.join(output, 'mac', 'Zeloryn.app', 'Contents'),
      path.join(output, 'mac', 'Kryleos Forge.app', 'Contents'),
    ];
    const appRoot = macCandidates.find(existsSync) || macCandidates[0];
    const macExecCandidates = [
      path.join(appRoot, 'MacOS', 'Zeloryn'),
      path.join(appRoot, 'MacOS', 'Kryleos Forge'),
    ];
    return {
      executable: macExecCandidates.find(existsSync) || macExecCandidates[0],
      serverBundle: path.join(appRoot, 'Resources', 'app.asar.unpacked', 'dist-backend', 'server.cjs'),
    };
  }
  const root = path.join(output, 'linux-unpacked');
  const executableCandidates = [
    path.join(root, 'zeloryn'),
    path.join(root, 'Zeloryn'),
    path.join(root, 'kryleos-forge'),
    path.join(root, 'Kryleos Forge'),
  ];
  return {
    executable: executableCandidates.find(existsSync) || executableCandidates[0],
    serverBundle: path.join(root, 'resources', 'app.asar.unpacked', 'dist-backend', 'server.cjs'),
  };
}

function waitForServer(port, attempts = 120) {
  return new Promise(resolve => {
    let tries = 0;
    const attempt = () => {
      const req = http.get(`http://127.0.0.1:${port}/`, res => { res.resume(); resolve(true); });
      req.on('error', () => {
        tries += 1;
        if (tries >= attempts) resolve(false);
        else setTimeout(attempt, 300);
      });
      req.setTimeout(1000, () => req.destroy());
    };
    attempt();
  });
}

async function checkBackendGates() {
  const desktopDir = path.join(ROOT, 'Desktop-app');
  const build = run('npm run build', desktopDir, 240_000);
  if (!build.ok) {
    return { smokeOk: false, tierOk: false, smokeNote: 'desktop production build failed', tierNote: 'not run' };
  }
  const packaged = run('npx electron-builder --dir --config.win.signAndEditExecutable=false --publish never', desktopDir, 300_000);
  const artifact = packagedArtifactPaths(desktopDir);
  if (!packaged.ok || !existsSync(artifact.executable) || !existsSync(artifact.serverBundle)) {
    return { smokeOk: false, tierOk: false, smokeNote: 'fresh electron-builder artifact missing', tierNote: 'not run' };
  }

  const PORT = 34577;
  const tmpWorkspace = path.join(ROOT, '.release-score-tmp');
  mkdirSync(tmpWorkspace, { recursive: true });

  const child = spawn(artifact.executable, [artifact.serverBundle], {
    cwd: tmpWorkspace,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'development',
      KRYLEOS_DATA_DIR: tmpWorkspace,
      PORT: String(PORT),
    },
    stdio: 'ignore',
  });

  let smokeOk = false;
  let tierOk = false;
  let smokeNote = `packaged backend did not respond (${path.relative(ROOT, artifact.serverBundle)})`;
  let tierNote = 'backend did not respond';
  try {
    smokeOk = await waitForServer(PORT);
    if (smokeOk) smokeNote = `packaged artifact reachable on 127.0.0.1:${PORT}`;
    if (smokeOk) {
      try {
        const email = `release_score_${Date.now()}@test.local`;
        const registration = await postJson(`http://127.0.0.1:${PORT}/api/auth/register`, {
          email,
          password: 'ReleaseScore123!',
        });
        const token = registration.body?.user?.token;
        if (!token) throw new Error(`registration failed with HTTP ${registration.status}`);
        const forged = await postJson(
          `http://127.0.0.1:${PORT}/api/crew/sync`,
          { tier: 'founder', items: [] },
          { Authorization: `Bearer ${token}` },
        );
        tierOk = forged.status === 403;
        tierNote = `authenticated Free + forged tier='founder' -> HTTP ${forged.status}`;
      } catch (err) {
        tierNote = `request failed: ${err.message}`;
      }
    }
  } finally {
    child.kill();
    // Give Windows a moment to release file handles before cleanup; a failed
    // cleanup of the scratch dir is not a release-blocking condition.
    await new Promise(r => setTimeout(r, 500));
    try {
      rmSync(tmpWorkspace, { recursive: true, force: true });
    } catch {
      // best-effort; leave the scratch dir for the next run to reuse/clean
    }
  }
  return { smokeOk, tierOk, smokeNote, tierNote };
}

const { smokeOk, tierOk, smokeNote, tierNote } = await checkBackendGates();
const packagedRenderer = run(
  'npx playwright test --config playwright.packaged.config.ts --reporter=line',
  path.join(ROOT, 'Desktop-app'),
  120_000
);
const packagedRendererOk = packagedRenderer.ok;
const whatsRealOk = existsSync(path.join(ROOT, 'Web-app', 'public', 'whats-real.html'));
let demandOk = false;
let demandNote = 'demand tracker missing';
try {
  const demand = readFileSync(path.join(ROOT, 'launch', 'DEMAND_VALIDATION.md'), 'utf-8');
  const partners = demand.match(/Design partners committed:\s*\*\*(\d+)\s*\/\s*(\d+)/i);
  const waitlist = demand.match(/Waitlist with stated intent:\s*\*\*(\d+)\s*\/\s*(\d+)/i);
  const partnerCount = Number(partners?.[1] || 0);
  const partnerTarget = Number(partners?.[2] || 1);
  const waitlistCount = Number(waitlist?.[1] || 0);
  const waitlistTarget = Number(waitlist?.[2] || 25);
  demandOk = partnerCount >= partnerTarget && waitlistCount >= waitlistTarget;
  demandNote = `${partnerCount}/${partnerTarget} design partners, ${waitlistCount}/${waitlistTarget} waitlist intent`;
} catch {}
let soakOk = false;
let soakNote = '30-minute soak report missing';
try {
  const soak = JSON.parse(readFileSync(path.join(ROOT, 'launch', 'soak-results.json'), 'utf-8'));
  soakOk = soak.passed === true && Number(soak.durationMs) >= 30 * 60 * 1000;
  soakNote = `${(Number(soak.durationMs) / 60_000).toFixed(1)} min, ${soak.failures}/${soak.requests} failures, ${soak.memory?.growthMb ?? '?'} MB growth`;
} catch {}

const phaseGateChecks = [
  {
    ok: honestyOk,
    label: 'public surfaces clean of "only"/"Matrix-Coding" overclaims',
    note: honestyOk ? 'clean' : `found in: ${overclaimHits.join(', ')}`,
  },
  {
    ok: previewDeckOk,
    label: 'PreviewDeck has no canned-reply string',
    note: previewDeckOk ? 'clean' : '"Context note queued" canned string still present (PreviewDeck.tsx)',
  },
  {
    ok: smokeOk,
    label: 'electron-builder artifact backend starts',
    note: smokeNote,
  },
  {
    ok: tierOk,
    label: 'forged tier in request body is rejected (403)',
    note: tierNote,
  },
  {
    ok: packagedRendererOk,
    label: 'packaged Electron reaches green no-key demo trace',
    note: packagedRendererOk ? 'Playwright packaged driver passed' : 'packaged renderer driver failed',
  },
  {
    ok: soakOk,
    label: '30-minute session soak passes',
    note: soakNote,
  },
  {
    ok: whatsRealOk,
    label: 'public What\'s real page exists',
    note: whatsRealOk ? 'Web-app/public/whats-real.html' : 'missing',
  },
  {
    ok: demandOk,
    label: 'design-partner and intent waitlist gate met',
    note: demandNote,
  },
];
const phaseGatePassing = phaseGateChecks.filter(c => c.ok).length;
checks.push(check(
  'Phase-gate assertions (honesty + security)',
  phaseGatePassing / phaseGateChecks.length,
  WEIGHTS.phaseGates,
  phaseGateChecks.map(c => `${c.ok ? '✔' : '✘'} ${c.label} (${c.note})`).join(' | ')
));

// ─── Calculate weighted score ─────────────────────────────────────────────────

const totalWeighted = checks.reduce((s, c) => s + c.weighted, 0);
const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
const rawScore = (totalWeighted / totalWeight) * 10;
const failedPhaseGates = phaseGateChecks.filter(c => !c.ok);
const PHASE_GATE_FAILURE_CAP = 6.0;
const finalScore = failedPhaseGates.length > 0
  ? Math.min(rawScore, PHASE_GATE_FAILURE_CAP)
  : rawScore;

// ─── Print table ──────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(70));
console.log(
  'Category'.padEnd(42) +
  'Weight'.padStart(7) +
  'Score'.padStart(7) +
  'Weighted'.padStart(10)
);
console.log('─'.repeat(70));

for (const c of checks) {
  const pct = (c.score * 100).toFixed(0).padStart(5) + '%';
  const wtd = (c.weighted * 10).toFixed(2);
  console.log(
    c.label.padEnd(42) +
    `${(c.weight * 100).toFixed(0)}%`.padStart(7) +
    pct.padStart(7) +
    wtd.padStart(10) +
    `  ${c.notes}`
  );
}

console.log('─'.repeat(70));
console.log(`FINAL RELEASE READINESS SCORE: ${finalScore.toFixed(1)} / 10`);
if (failedPhaseGates.length > 0 && rawScore > finalScore) {
  console.log(
    `Hard cap applied: ${failedPhaseGates.length} honesty/security phase gate(s) failed ` +
    `(raw ${rawScore.toFixed(1)} -> capped ${PHASE_GATE_FAILURE_CAP.toFixed(1)}).`
  );
}

const TARGET = 8.5;
const meets = finalScore >= TARGET;
console.log(`Target: ${TARGET} / 10 — ${meets ? '✔ MEETS TARGET' : `❌ BELOW TARGET (need +${(TARGET - finalScore).toFixed(1)})`}`);
console.log('─'.repeat(70));

if (!meets) {
  console.log('\nTop gaps to close:');
  const gaps = checks
    .filter(c => c.score < 1)
    .sort((a, b) => (b.weight - b.weighted) - (a.weight - a.weighted))
    .slice(0, 3);
  for (const g of gaps) {
    const missing = ((1 - g.score) * g.weight * 10).toFixed(2);
    console.log(`  • ${g.label}: +${missing} pts available — ${g.notes}`);
  }
}

console.log('\n============================================================');
process.exit(meets ? 0 : 1);
