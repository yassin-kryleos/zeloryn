import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..', '..');

console.log('====================================================');
console.log('       KRYLEOS FORGE UNIFIED RELEASE TEST RUNNER    ');
console.log('====================================================\n');

try {
  console.log('[1/6] Running Desktop Linter (ESLint Checks)...');
  execSync('npm run lint', { cwd: path.resolve(rootDir, 'Desktop-app'), stdio: 'inherit' });

  console.log('\n[2/6] Running Desktop Backend & Frontend Unit/Integration Tests...');
  execSync('npm test', { cwd: path.resolve(rootDir, 'Desktop-app'), stdio: 'inherit' });

  console.log('\n[3/6] Running Web Companion Tests...');
  execSync('npm test', { cwd: path.resolve(rootDir, 'Web-app'), stdio: 'inherit' });

  console.log('\n[4/6] Running Mobile Companion Tests...');
  execSync('npm test', { cwd: path.resolve(rootDir, 'Mobile-app'), stdio: 'inherit' });

  console.log('\n[5/6] Running E2E WebSocket Pairing Check...');
  execSync('node qa/scripts/run-e2e-checks.mjs', { cwd: rootDir, stdio: 'inherit' });

  console.log('\n[6/6] Running Performance and Stress Benchmarks...');
  execSync('node qa/scripts/performance-test-scripts/node-load-test.mjs', { cwd: rootDir, stdio: 'inherit' });

  console.log('\n====================================================');
  console.log('          ALL 6 QUALITY GATES PASSED SUCCESSFULLY    ');
  console.log('====================================================');
} catch (error) {
  console.error('\n❌ Test execution failed!');
  process.exit(1);
}
