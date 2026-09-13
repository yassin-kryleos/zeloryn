import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { WorkspaceSandbox } from '../tools';

describe('Auto-Generated PR Description and CHANGELOG (Phase 9c)', () => {
  let tmpDir: string;
  let sandbox: WorkspaceSandbox;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-pr-test-'));
    execSync('git init -b main', { cwd: tmpDir });
    execSync('git config user.email "test@forge.local"', { cwd: tmpDir });
    execSync('git config user.name "Forge Tester"', { cwd: tmpDir });

    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Initial Project\n', 'utf-8');
    execSync('git add README.md && git commit -m "initial commit"', { cwd: tmpDir });

    sandbox = new WorkspaceSandbox(tmpDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('generates PR description markdown and updates CHANGELOG upon merge', async () => {
    const cardId = 'card-auth-feature';
    const created = await sandbox.createCardWorktree(cardId);
    expect(created.success).toBe(true);

    // Make changes in the card worktree
    fs.writeFileSync(
      path.join(created.worktreePath, 'auth.ts'),
      'export function authenticate() { return true; }\n',
      'utf-8'
    );
    execSync('git add auth.ts && git commit -m "feat(auth): add auth helper"', { cwd: created.worktreePath });

    const cardData = {
      title: 'Add User Authentication Flow',
      category: 'security',
      description: 'Implements JWT authentication and token verification helpers.',
      acceptanceCriteria: [
        { type: 'test', description: 'JWT signature is verified with HMAC-SHA256' },
        { type: 'security', description: 'Tokens expire in 15 minutes' }
      ],
      postExecutionReview: {
        verdict: 'PASS',
        status: 'passed',
        findings: 'Verified diff. Code cleanly satisfies JWT criteria without regressions.'
      }
    };

    const mergeResult = await sandbox.mergeCardWorktree(cardId, 'main', cardData);
    expect(mergeResult.success).toBe(true);
    expect(mergeResult.prDescription).toBeDefined();
    expect(mergeResult.prPath).toBeDefined();
    expect(mergeResult.changelogPath).toBeDefined();

    // Verify PR markdown file
    expect(fs.existsSync(mergeResult.prPath!)).toBe(true);
    const prContent = fs.readFileSync(mergeResult.prPath!, 'utf-8');
    expect(prContent).toContain('# PR: Add User Authentication Flow [Card: card-auth-feature]');
    expect(prContent).toContain('Implements JWT authentication and token verification helpers.');
    expect(prContent).toContain('- [x] **[test]** JWT signature is verified with HMAC-SHA256');
    expect(prContent).toContain('- [x] **[security]** Tokens expire in 15 minutes');
    expect(prContent).toContain('**Verdict**: **PASS**');
    expect(prContent).toContain('Verified diff. Code cleanly satisfies JWT criteria');

    // Verify CHANGELOG.md file
    expect(fs.existsSync(mergeResult.changelogPath!)).toBe(true);
    const changelogContent = fs.readFileSync(mergeResult.changelogPath!, 'utf-8');
    expect(changelogContent).toContain('# Project Changelog');
    expect(changelogContent).toContain('Add User Authentication Flow (card-auth-feature)');
    expect(changelogContent).toContain('- **Category**: security');
    expect(changelogContent).toContain('- **Review**: PASS');
  });

  it('generates fallback PR description when cardData is minimal or omitted', async () => {
    const cardId = 'card-minimal';
    const created = await sandbox.createCardWorktree(cardId);
    expect(created.success).toBe(true);

    fs.writeFileSync(path.join(created.worktreePath, 'test.txt'), 'Minimal test', 'utf-8');
    execSync('git add test.txt && git commit -m "add test.txt"', { cwd: created.worktreePath });

    const mergeResult = await sandbox.mergeCardWorktree(cardId, 'main');
    expect(mergeResult.success).toBe(true);
    expect(mergeResult.prPath).toBeDefined();

    const prContent = fs.readFileSync(mergeResult.prPath!, 'utf-8');
    expect(prContent).toContain('# PR: Card card-minimal [Card: card-minimal]');
    expect(prContent).toContain('Completed implementation for card card-minimal.');
    expect(prContent).toContain('**Verdict**: **PASS**');
  });
});
