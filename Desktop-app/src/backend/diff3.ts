import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

export interface MergeResult {
  merged: string;
  hasConflicts: boolean;
}

/**
 * Performs a 3-way merge between base, ours, and theirs text using native git merge-file.
 */
export function threeWayMerge(
  base: string,
  ours: string,
  theirs: string
): MergeResult {
  if (ours === base && theirs === base) return { merged: base, hasConflicts: false };
  if (ours === theirs || theirs === base) return { merged: ours, hasConflicts: false };
  if (ours === base) return { merged: theirs, hasConflicts: false };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff3-merge-'));
  const fOurs = path.join(tmpDir, 'ours');
  const fBase = path.join(tmpDir, 'base');
  const fTheirs = path.join(tmpDir, 'theirs');

  try {
    fs.writeFileSync(fOurs, ours, 'utf-8');
    fs.writeFileSync(fBase, base, 'utf-8');
    fs.writeFileSync(fTheirs, theirs, 'utf-8');

    let merged = '';
    let hasConflicts = false;

    try {
      merged = execFileSync(
        'git',
        ['merge-file', '-p', '-q', '-L', 'CLIENT (OURS)', '-L', 'BASE', '-L', 'SERVER (THEIRS)', fOurs, fBase, fTheirs],
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
    } catch (err: any) {
      if (typeof err?.status === 'number' && err.status > 0) {
        hasConflicts = true;
        merged = err.stdout?.toString() || '';
      } else {
        throw err;
      }
    }

    return {
      merged: merged.replace(/\r?\n$/, ''),
      hasConflicts,
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}
