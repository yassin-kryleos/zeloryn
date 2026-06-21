import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Point backend storage (local sync DB) at a fresh temp dir so test runs are
// isolated and idempotent instead of reading/writing the real home directory.
process.env.KRYLEOS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kryleos-test-'));

// Vitest worker threads on Windows may not inherit PATH fully, which breaks
// child_process.execFileSync('git', ...) and related calls.  Enrich PATH with
// common Git install locations so tests that spawn git work reliably.
const GIT_PATHS = [
  'C:\\Program Files\\Git\\cmd',
  'C:\\Program Files\\Git\\mingw64\\bin',
  'C:\\Program Files\\Git\\bin',
  'C:\\Program Files (x86)\\Git\\cmd',
].filter((p) => {
  try { return fs.existsSync(p); } catch { return false; }
});

if (GIT_PATHS.length > 0) {
  const existing = process.env.PATH || '';
  const missing = GIT_PATHS.filter((p) => !existing.includes(p));
  if (missing.length > 0) {
    process.env.PATH = missing.join(path.delimiter) + path.delimiter + existing;
  }
}
