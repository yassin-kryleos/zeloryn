import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Point backend storage (local sync DB) at a fresh temp dir so test runs are
// isolated and idempotent instead of reading/writing the real home directory.
// Runs before any test file (and its backend imports) is loaded.
process.env.KRYLEOS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kryleos-test-'));
