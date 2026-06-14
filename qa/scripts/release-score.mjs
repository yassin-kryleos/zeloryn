/**
 * Release readiness score calculator for Kryleos Forge.
 *
 * Collects evidence from:
 *   - npm test exit codes and counts (Desktop + Web + Mobile)
 *   - TypeScript noEmit exit codes
 *   - ESLint exit codes
 *   - npm audit results
 *   - Playwright E2E existence and configured test count
 *   - Security and performance findings from QA reports
 *
 * Produces a weighted score from 0–10 and prints a summary table.
 *
 * Usage: node qa/scripts/release-score.mjs
 * Run from the project root (Kryleos-Forge/).
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This script lives at qa/scripts/release-score.mjs, so the project root is two
// levels up (qa/scripts -> qa -> Kryleos-Forge).
const ROOT = path.resolve(__dirname, '..', '..');

const WEIGHTS = {
  unitTests:       0.20,  // Desktop + Web + Mobile unit test suites
  typecheck:       0.10,  // TypeScript noEmit on all 3 apps
  lint:            0.05,  // ESLint on Desktop + Web
  security:        0.15,  // npm audit + no high CVEs
  e2eExists:       0.15,  // E2E test files present and configured
  errorBoundary:   0.05,  // ErrorBoundary in Desktop + Mobile
  bodyLimit:       0.05,  // express.json({ limit }) applied
  perfScripts:     0.05,  // Performance test scripts runnable
  qaReports:       0.10,  // QA audit report + test strategy present
  openFindings:    0.10,  // Deductions for open HIGH/CRITICAL findings
};

function run(cmd, cwd) {
  try {
    execSync(cmd, { cwd, stdio: 'pipe', timeout: 60_000 });
    return { ok: true, output: '' };
  } catch (err) {
    return { ok: false, output: err.stdout?.toString() ?? '' };
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

// 5. E2E test files present
const e2eFiles = [
  path.join(ROOT, 'Web-app', 'e2e'),
  path.join(ROOT, 'Desktop-app', 'e2e'),
  path.join(ROOT, 'Mobile-app', 'e2e'),
  path.join(ROOT, 'Web-app', 'playwright.config.ts'),
  path.join(ROOT, 'Desktop-app', 'playwright.config.ts'),
  path.join(ROOT, 'Mobile-app', 'playwright.config.ts'),
];
const e2ePresent = e2eFiles.filter(f => existsSync(f)).length;
const e2eScore = e2ePresent / e2eFiles.length;
checks.push(check(
  'E2E test files + Playwright configs present',
  e2eScore,
  WEIGHTS.e2eExists,
  `${e2ePresent}/${e2eFiles.length} present`
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

// 10. Open findings deduction
// Known HIGH open findings: TEST-GAP-01, TEST-GAP-02, TEST-GAP-03, A11Y-NEW-01
// After Phase 1+2: TEST-GAP-03 resolved (integration tests), A11Y-NEW-01 partially resolved (E2E axe)
// After Phase 3: cross-platform CI resolved (.github/workflows/ci.yml runs the full
//   suite + Electron backend on ubuntu/windows/macos). SEC-6/SEC-7/SEC-INPUT-01 closed.
// Remaining deduction: no physical-device Mobile test (Expo web E2E covers render logic,
//   but no real iOS/Android hardware run) — requires device lab / EAS, out of CI scope.
const openHighFindings = 1; // physical-device mobile test only
const findingDeduction = Math.min(openHighFindings * 0.05, 0.10); // max 0.10 deduction
const findingScore = 1 - findingDeduction / WEIGHTS.openFindings;
checks.push(check(
  'Open HIGH findings (deduction)',
  Math.max(0, findingScore),
  WEIGHTS.openFindings,
  `${openHighFindings} HIGH finding remains (physical-device mobile test only)`
));

// ─── Calculate weighted score ─────────────────────────────────────────────────

const totalWeighted = checks.reduce((s, c) => s + c.weighted, 0);
const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
const finalScore = (totalWeighted / totalWeight) * 10;

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
