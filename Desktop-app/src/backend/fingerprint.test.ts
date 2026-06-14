import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fingerprintWorkspace } from './planningV2';

let emptyDir: string;
let projectDir: string;

beforeAll(() => {
  emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-empty-'));

  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-proj-'));
  fs.writeFileSync(path.join(projectDir, 'README.md'), '# Demo');
  fs.writeFileSync(path.join(projectDir, 'package.json'), '{"name":"demo"}');
  fs.writeFileSync(path.join(projectDir, 'index.ts'), 'export const x = 1;');
  fs.mkdirSync(path.join(projectDir, '.git'));
  fs.mkdirSync(path.join(projectDir, 'tests'));
  fs.writeFileSync(path.join(projectDir, 'tests', 'a.test.ts'), 'test');
});

afterAll(() => {
  fs.rmSync(emptyDir, { recursive: true, force: true });
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe('fingerprintWorkspace', () => {
  it('flags an existing codebase with its signals', () => {
    const fp = fingerprintWorkspace(projectDir);
    expect(fp.isExistingCodebase).toBe(true);
    expect(fp.hasReadme).toBe(true);
    expect(fp.hasGit).toBe(true);
    expect(fp.hasTests).toBe(true);
    expect(fp.packageManagers).toContain('npm');
    expect(fp.languages).toContain('TypeScript');
    expect(fp.fileCount).toBeGreaterThan(0);
  });

  it('detects colocated tests (src/**/*.test.ts) without a tests dir', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-colo-'));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'thing.ts'), 'export const x = 1;');
    fs.writeFileSync(path.join(dir, 'src', 'thing.test.ts'), 'test');
    try {
      const fp = fingerprintWorkspace(dir);
      expect(fp.hasTests).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports an empty dir as not an existing codebase', () => {
    const fp = fingerprintWorkspace(emptyDir);
    expect(fp.isExistingCodebase).toBe(false);
    expect(fp.packageManagers).toEqual([]);
    expect(fp.fileCount).toBe(0);
  });

  it('returns a safe default for a missing path', () => {
    const fp = fingerprintWorkspace(path.join(emptyDir, 'does-not-exist'));
    expect(fp.isExistingCodebase).toBe(false);
    expect(fp.fileCount).toBe(0);
  });
});
