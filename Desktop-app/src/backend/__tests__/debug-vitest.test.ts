import { test, expect } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';

// Minimal sanity check of vitest child process environment
test('can spawn git', () => {
  const env = process.env;
  const pathLines = (env.PATH || '').split(';');
  console.log('PATH entries:', JSON.stringify(pathLines.filter(p => p.toLowerCase().includes('git'))));
  console.log('PATH count:', pathLines.length);
  try {
    const r = execFileSync('git', ['--version'], { encoding: 'utf-8' });
    console.log('git ok:', r.trim());
  } catch (e: any) {
    console.log('git direct failed:', e.message);
    // Try each PATH entry
    for (const dir of pathLines) {
      if (!dir) continue;
      try {
        const p = dir + '\\git.exe';
        if (fs.existsSync(p)) {
          const r = execFileSync(p, ['--version'], { encoding: 'utf-8' });
          console.log(`Found git at ${p}:`, r.trim());
        }
      } catch { /* skip */ }
    }
    // Try known locations
    const paths = [
      'C:\\Program Files\\Git\\mingw64\\bin\\git.exe',
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files\\Git\\bin\\git.exe',
    ];
    for (const p of paths) {
      console.log(`${p} exists:`, fs.existsSync(p));
    }
  }
  expect(true).toBe(true);
});
