import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';

import {
  initDeviationStore,
  takeSnapshot,
  computeDeviations,
  getDeviations,
  updateDeviationStatus,
  getSnapshot,
} from '../ccDeviationService';

function git(cwd: string, args: string[]): string {
  // Vitest worker threads on Windows don't inherit PATH properly for
  // execFileSync even in fork mode.  Resolve git once at module load.
  return execFileSync(gitPath, args, { cwd, encoding: 'utf-8', env: gitEnv }).trim();
}

// Resolve Git for Windows once at module load
const gitPath: string = (() => {
  if (process.platform !== 'win32') {
    const unixCandidates = ['/usr/bin/git', '/usr/local/bin/git', '/bin/git'];
    for (const p of unixCandidates) {
      try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
    }
    return 'git';
  }
  const candidates = [
    'C:\\Program Files\\Git\\mingw64\\bin\\git.exe',
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files\\Git\\bin\\git.exe',
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
  }
  return 'git';
})();

const gitEnv: NodeJS.ProcessEnv = (() => {
  if (process.platform !== 'win32') return process.env;
  const dir = path.dirname(gitPath);
  return {
    ...process.env,
    PATH: dir + path.delimiter + (process.env.PATH || ''),
  };
})();

import * as os from 'os';

function tmpDir(): string {
  return path.join(os.tmpdir(), '.tmp-test-' + Math.random().toString(36).slice(2, 8));
}

function write(p: string, content: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf-8');
}

describe('ccDeviationService', () => {
  let workspace: string;
  let storeFile: string;

  beforeEach(() => {
    workspace = tmpDir();
    fs.mkdirSync(workspace, { recursive: true });
    storeFile = path.join(workspace, '.kryleos', 'cc-deviations.json');

    git(workspace, ['init']);
    git(workspace, ['config', 'user.email', 'test@test.com']);
    git(workspace, ['config', 'user.name', 'Test']);

    write(path.join(workspace, 'README.md'), '# Test');
    git(workspace, ['add', '.']);
    git(workspace, ['commit', '-m', 'initial']);

    initDeviationStore(storeFile);
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  describe('initDeviationStore', () => {
    it('creates empty store file', () => {
      expect(fs.existsSync(storeFile)).toBe(true);
      expect(JSON.parse(fs.readFileSync(storeFile, 'utf-8'))).toEqual({
        snapshots: {},
        deviations: [],
      });
    });
  });

  describe('takeSnapshot', () => {
    it('captures HEAD sha and empty dirtyFiles on clean workspace', async () => {
      const snap = await takeSnapshot({
        workspaceRoot: workspace,
        planItemId: 'item-1',
        queryText: 'add feature X',
      });

      expect(snap.id).toMatch(/^dev-/);
      expect(snap.planItemId).toBe('item-1');
      expect(snap.queryText).toBe('add feature X');
      expect(snap.headSha).toMatch(/^[a-f0-9]{7,40}$/);
      expect(snap.dirtyFiles).toEqual([]);
    });

    it('captures dirty files', async () => {
      write(path.join(workspace, 'index.ts'), 'const a = 1;');
      const snap = await takeSnapshot({ workspaceRoot: workspace, queryText: 'test' });
      expect(snap.dirtyFiles.some((f) => f.endsWith('index.ts'))).toBe(true);
    });

    it('persists snapshot to store', async () => {
      const snap = await takeSnapshot({ workspaceRoot: workspace, queryText: 'test' });
      expect(getSnapshot(snap.id)?.id).toBe(snap.id);
    });
  });

  describe('computeDeviations', () => {
    it('returns empty array when CC makes no changes', async () => {
      const snap = await takeSnapshot({ workspaceRoot: workspace, queryText: 'do nothing' });
      expect(await computeDeviations(snap.id, 'No changes made.')).toEqual([]);
    });

    it('detects files CC created and modified', async () => {
      const snap = await takeSnapshot({ workspaceRoot: workspace, queryText: 'create helper' });
      write(path.join(workspace, 'src/helper.ts'), 'export const helper = () => 42;');
      write(path.join(workspace, 'README.md'), '# Test\n\nModified by CC');
      git(workspace, ['add', 'src/helper.ts']);

      const records = await computeDeviations(snap.id, 'Created src/helper.ts, modified README.md');
      expect(records.length).toBeGreaterThanOrEqual(1);
      expect(records.find((r) => r.file.endsWith('helper.ts'))?.action).toBe('created');
      expect(records.some((r) => r.file.endsWith('README.md'))).toBe(true);
    });

    it('skips pre-existing dirty files', async () => {
      write(path.join(workspace, 'pre-existing.ts'), '// dirty');
      const snap = await takeSnapshot({ workspaceRoot: workspace, queryText: 'test' });
      write(path.join(workspace, 'cc-change.ts'), '// cc made this');

      const records = await computeDeviations(snap.id, 'Created cc-change.ts');
      expect(records.some((r) => r.file.endsWith('pre-existing.ts'))).toBe(false);
      expect(records.some((r) => r.file.endsWith('cc-change.ts'))).toBe(true);
    });

    it('flags ghost files CC claimed but no git diff', async () => {
      const snap = await takeSnapshot({ workspaceRoot: workspace, queryText: 'test' });
      const records = await computeDeviations(snap.id, 'Modified .env, updated config.json');
      const ghosts = records.filter((r) => r.diff === '');
      expect(ghosts.length).toBeGreaterThanOrEqual(1);
      expect(ghosts.some((r) => r.riskNotes.includes('no git diff detected'))).toBe(true);
    });

    it('sets pending status on new records', async () => {
      const snap = await takeSnapshot({ workspaceRoot: workspace, queryText: 'test' });
      write(path.join(workspace, 'new-file.ts'), '// new');
      const records = await computeDeviations(snap.id, 'created new-file.ts');
      expect(records.every((r) => r.status === 'pending')).toBe(true);
    });
  });

  describe('getDeviations', () => {
    it('returns all deviations newest first', async () => {
      const snap1 = await takeSnapshot({ workspaceRoot: workspace, queryText: 'first' });
      write(path.join(workspace, 'a.ts'), '// a');
      await computeDeviations(snap1.id, 'created a.ts');

      const snap2 = await takeSnapshot({ workspaceRoot: workspace, queryText: 'second' });
      write(path.join(workspace, 'b.ts'), '// b');
      await computeDeviations(snap2.id, 'created b.ts');

      const all = getDeviations();
      expect(all.length).toBeGreaterThanOrEqual(2);
      expect(new Date(all[0].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(all[1].createdAt).getTime(),
      );
    });

    it('filters by snapshotId', async () => {
      const snap = await takeSnapshot({ workspaceRoot: workspace, queryText: 'test' });
      write(path.join(workspace, 'x.ts'), '// x');
      await computeDeviations(snap.id, 'created x.ts');

      expect(getDeviations({ snapshotId: snap.id }).length).toBeGreaterThanOrEqual(1);
      expect(getDeviations({ snapshotId: snap.id }).every((r) => r.snapshotId === snap.id)).toBe(true);
      expect(getDeviations({ snapshotId: 'nonexistent' })).toEqual([]);
    });

    it('filters by status', async () => {
      const snap = await takeSnapshot({ workspaceRoot: workspace, queryText: 'test' });
      write(path.join(workspace, 'y.ts'), '// y');
      const records = await computeDeviations(snap.id, 'created y.ts');
      await updateDeviationStatus(records[0].id, 'accepted');

      expect(getDeviations({ status: 'pending' }).find((r) => r.id === records[0].id)).toBeUndefined();
      expect(getDeviations({ status: 'accepted' }).find((r) => r.id === records[0].id)).toBeDefined();
    });
  });

  describe('updateDeviationStatus', () => {
    it('accepts record', async () => {
      const snap = await takeSnapshot({ workspaceRoot: workspace, queryText: 'test' });
      write(path.join(workspace, 'z.ts'), '// z');
      const records = await computeDeviations(snap.id, 'created z.ts');
      expect(updateDeviationStatus(records[0].id, 'accepted')?.status).toBe('accepted');
    });

    it('rejects record', async () => {
      const snap = await takeSnapshot({ workspaceRoot: workspace, queryText: 'test' });
      write(path.join(workspace, 'w.ts'), '// w');
      const records = await computeDeviations(snap.id, 'created w.ts');
      expect(updateDeviationStatus(records[0].id, 'rejected')?.status).toBe('rejected');
    });

    it('returns null for nonexistent id', () => {
      expect(updateDeviationStatus('does-not-exist', 'accepted')).toBeNull();
    });

    it('updates updatedAt', async () => {
      const snap = await takeSnapshot({ workspaceRoot: workspace, queryText: 'test' });
      write(path.join(workspace, 'v.ts'), '// v');
      const before = await computeDeviations(snap.id, 'created v.ts');
      await new Promise((r) => setTimeout(r, 10));
      const updated = updateDeviationStatus(before[0].id, 'accepted')!;
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(before[0].updatedAt).getTime(),
      );
    });
  });

  describe('edge cases', () => {
    it('handles non-git workspace gracefully', async () => {
      const nonGit = tmpDir();
      write(path.join(nonGit, 'file.txt'), 'content');
      try {
        const snap = await takeSnapshot({ workspaceRoot: nonGit, queryText: 'test' });
        expect(snap.headSha).toBe('unknown');
        await expect(computeDeviations(snap.id, 'test')).rejects.toThrow();
      } finally {
        fs.rmSync(nonGit, { recursive: true, force: true });
      }
    });

    it('handles empty workspace', async () => {
      const snap = await takeSnapshot({ workspaceRoot: workspace, queryText: '' });
      expect(await computeDeviations(snap.id, '')).toEqual([]);
    });

    it('throws for nonexistent snapshot', async () => {
      await expect(computeDeviations('bad-id', 'output')).rejects.toThrow(
        'Snapshot bad-id not found',
      );
    });
  });
});
