import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { WorkspaceSandbox } from '../tools';

describe('Git-worktree isolation per card (Phase 5)', () => {
  let tmpDir: string;
  let sandbox: WorkspaceSandbox;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-worktree-test-'));
    // Initialize real git repo in temp dir with git user
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.email "test@forge.local"', { cwd: tmpDir });
    execSync('git config user.name "Forge Tester"', { cwd: tmpDir });

    // Create initial commit
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test Project\n', 'utf-8');
    execSync('git add README.md && git commit -m "initial commit"', { cwd: tmpDir });

    sandbox = new WorkspaceSandbox(tmpDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('creates an isolated worktree for a Kanban card', async () => {
    const res = await sandbox.createCardWorktree('task-123');
    expect(res.success).toBe(true);
    expect(res.branch).toBe('forge/card-task-123');
    expect(fs.existsSync(res.worktreePath)).toBe(true);
    expect(fs.existsSync(path.join(res.worktreePath, 'README.md'))).toBe(true);
  });

  it('lists active card worktrees with status', async () => {
    await sandbox.createCardWorktree('card-alpha');
    const worktrees = await sandbox.listCardWorktrees();
    expect(worktrees.length).toBe(1);
    expect(worktrees[0].taskId).toBe('card-alpha');
    expect(worktrees[0].branch).toBe('forge/card-card-alpha');
    expect(worktrees[0].isClean).toBe(true);
  });

  it('removes a card worktree cleanly', async () => {
    const created = await sandbox.createCardWorktree('card-beta');
    expect(fs.existsSync(created.worktreePath)).toBe(true);

    const removed = await sandbox.removeCardWorktree('card-beta');
    expect(removed.success).toBe(true);
    expect(fs.existsSync(created.worktreePath)).toBe(false);

    const list = await sandbox.listCardWorktrees();
    expect(list.length).toBe(0);
  });

  it('merges an isolated card branch back into main workspace', async () => {
    const created = await sandbox.createCardWorktree('card-feature');
    expect(created.success).toBe(true);

    // Make an edit inside the isolated worktree
    fs.writeFileSync(path.join(created.worktreePath, 'feature.txt'), 'Feature code', 'utf-8');
    execSync('git add feature.txt && git commit -m "feat: add feature"', { cwd: created.worktreePath });

    // Merge into main workspace
    const mergeRes = await sandbox.mergeCardWorktree('card-feature', 'main');
    expect(mergeRes.success).toBe(true);

    // Verify main workspace now has the feature file
    expect(fs.existsSync(path.join(tmpDir, 'feature.txt'))).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, 'feature.txt'), 'utf-8');
    expect(content).toBe('Feature code');
  });

  it('blocks merge when secret scanner detects potential secrets in card diff (7d)', async () => {
    const created = await sandbox.createCardWorktree('card-secret');
    expect(created.success).toBe(true);

    // Commit an exposed API key into the card worktree
    fs.writeFileSync(
      path.join(created.worktreePath, 'config.ts'),
      'export const key = "sk-ant-abcdefghijklmnopqrstuvwxyz12345";\n',
      'utf-8'
    );
    execSync('git add config.ts && git commit -m "add key"', { cwd: created.worktreePath });

    // Attempt merge
    const mergeRes = await sandbox.mergeCardWorktree('card-secret', 'main');
    expect(mergeRes.success).toBe(false);
    expect(mergeRes.message).toMatch(/blocked by secret scanner/i);
    expect(mergeRes.message).toMatch(/Anthropic API Key/i);
  });

  it('detects file collision when worktrees modify the same file (7d)', async () => {
    const w1 = await sandbox.createCardWorktree('card-one');
    const w2 = await sandbox.createCardWorktree('card-two');

    fs.writeFileSync(path.join(w1.worktreePath, 'shared.txt'), 'One edit', 'utf-8');
    execSync('git add shared.txt && git commit -m "w1 edit"', { cwd: w1.worktreePath });

    fs.writeFileSync(path.join(w2.worktreePath, 'shared.txt'), 'Two edit', 'utf-8');
    execSync('git add shared.txt && git commit -m "w2 edit"', { cwd: w2.worktreePath });

    const collisions = await sandbox.detectWorktreeCollisions('card-two', 'main');
    expect(collisions).toContain('shared.txt');
  });

  it('durable per-card rollback: removes worktree and deletes branch cleanly (7e)', async () => {
    const created = await sandbox.createCardWorktree('card-revert');
    expect(fs.existsSync(created.worktreePath)).toBe(true);

    fs.writeFileSync(path.join(created.worktreePath, 'temp.txt'), 'revert me', 'utf-8');
    execSync('git add temp.txt && git commit -m "temp work"', { cwd: created.worktreePath });

    const revertRes = await sandbox.revertCardWorktree('card-revert');
    expect(revertRes.success).toBe(true);
    expect(fs.existsSync(created.worktreePath)).toBe(false);

    // Verify branch was completely deleted from git
    const branchCheck = execSync('git branch --list forge/card-card_revert', { cwd: tmpDir, encoding: 'utf-8' });
    expect(branchCheck.trim()).toBe('');
  });

  it('returns graceful failure when workspace is not a git repo', async () => {
    const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'non-git-'));
    try {
      const nonGitSandbox = new WorkspaceSandbox(nonGit);
      const res = await nonGitSandbox.createCardWorktree('task-nogit');
      expect(res.success).toBe(false);
      expect(res.message).toMatch(/not a git repository/i);
    } finally {
      fs.rmSync(nonGit, { recursive: true, force: true });
    }
  });
});
