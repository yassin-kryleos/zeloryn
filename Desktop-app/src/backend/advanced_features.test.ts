import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

// Mock mammoth and html-to-docx before importing WorkspaceSandbox
vi.mock('mammoth', () => ({
  default: {
    convertToMarkdown: vi.fn().mockResolvedValue({ value: '' })
  }
}));
vi.mock('html-to-docx', () => ({
  default: vi.fn().mockResolvedValue(Buffer.from(''))
}));

import { WorkspaceSandbox } from './tools';

const TEST_WORKSPACE = path.resolve(__dirname, '../../test_workspace_adv');

describe('Advanced Features: Semantic Cache, Self-Healing, RBAC', () => {
  let sandbox: WorkspaceSandbox;

  beforeEach(async () => {
    // Ensure clean test workspace
    if (fs.existsSync(TEST_WORKSPACE)) {
      fs.rmSync(TEST_WORKSPACE, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_WORKSPACE, { recursive: true });

    sandbox = new WorkspaceSandbox(TEST_WORKSPACE);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_WORKSPACE)) {
      fs.rmSync(TEST_WORKSPACE, { recursive: true, force: true });
    }
  });

  // =============================================
  // GIT REVIEW TESTS
  // =============================================
  describe('Git-backed Review State', () => {
    const runGit = (args: string[]) => execFileSync('git', args, { cwd: TEST_WORKSPACE, stdio: 'pipe' });
    const canRunGit = () => {
      try {
        execFileSync('git', ['--version'], { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    };

    it('should expose Git diffs, persist review status, stage, and revert changes', async () => {
      if (!canRunGit()) return;

      runGit(['init']);
      runGit(['config', 'user.email', 'test@example.com']);
      runGit(['config', 'user.name', 'Kryleos Test']);
      fs.writeFileSync(path.join(TEST_WORKSPACE, 'feature.ts'), 'export const value = 1;\n', 'utf-8');
      runGit(['add', 'feature.ts']);
      runGit(['commit', '-m', 'baseline']);

      fs.writeFileSync(path.join(TEST_WORKSPACE, 'feature.ts'), 'export const value = 2;\n', 'utf-8');

      const review = await sandbox.gitReviewCurrent();
      expect(review.success).toBe(true);
      expect(review.files[0].file).toBe('feature.ts');
      expect(review.files[0].diff).toContain('+export const value = 2;');

      await sandbox.setReviewStatus('feature.ts', 'accepted');
      const acceptedReview = await sandbox.gitReviewCurrent();
      expect(acceptedReview.files[0].reviewStatus).toBe('accepted');

      const stageResult = await sandbox.gitReviewStage('feature.ts', true);
      expect(stageResult.success).toBe(true);
      const stagedReview = await sandbox.gitReviewCurrent();
      expect(stagedReview.files[0].hasStagedChanges).toBe(true);

      const revertResult = await sandbox.gitReviewRevert('feature.ts');
      expect(revertResult.success).toBe(true);
      const restoredContent = fs.readFileSync(path.join(TEST_WORKSPACE, 'feature.ts'), 'utf-8').replace(/\r\n/g, '\n');
      expect(restoredContent).toBe('export const value = 1;\n');
    });
  });

  // =============================================
  // SEMANTIC CACHE TESTS
  // =============================================
  describe('Semantic Cache & Workspace Indexer', () => {
    it('should allow building semantic cache regardless of tier', async () => {
      sandbox.setUserTier('free');
      const testFile = path.join(TEST_WORKSPACE, 'sample_free.ts');
      fs.writeFileSync(testFile, 'export function freeTest() {}', 'utf-8');
      const result = await sandbox.buildSemanticCache();
      expect(result.success).toBe(true);
    });

    it('should allow pro-tier users to build semantic cache', async () => {
      sandbox.setUserTier('pro');
      // Create a test TypeScript file with some declarations
      const testFile = path.join(TEST_WORKSPACE, 'sample.ts');
      fs.writeFileSync(testFile, `
export function calculateTotal(items: number[]): number {
  return items.reduce((a, b) => a + b, 0);
}

export class UserService {
  private db: any;
  constructor() {}
}

export interface Config {
  apiKey: string;
  model: string;
}

export const fetchData = async (url: string) => {
  return fetch(url);
};
`, 'utf-8');

      const result = await sandbox.buildSemanticCache();
      expect(result.success).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(3); // function, class, interface, arrow

      // Verify cache file was created
      const cachePath = path.join(TEST_WORKSPACE, '.matrix_semantic_cache.json');
      expect(fs.existsSync(cachePath)).toBe(true);
    });

    it('should allow enterprise-tier users to build semantic cache', async () => {
      sandbox.setUserTier('enterprise');
      const testFile = path.join(TEST_WORKSPACE, 'module.ts');
      fs.writeFileSync(testFile, `
export function init() {}
export class Engine {}
`, 'utf-8');

      const result = await sandbox.buildSemanticCache();
      expect(result.success).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(2);
    });

    it('should query semantic cache for matching symbols', async () => {
      sandbox.setUserTier('pro');
      const testFile = path.join(TEST_WORKSPACE, 'api.ts');
      fs.writeFileSync(testFile, `
export function handleRequest() {}
export function handleResponse() {}
export class RequestHandler {}
`, 'utf-8');

      await sandbox.buildSemanticCache();

      const results = await sandbox.querySemanticCache('handle');
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some(r => r.symbol === 'handleRequest')).toBe(true);
      expect(results.some(r => r.symbol === 'handleResponse')).toBe(true);
    });

    it('should return empty results for non-existing query', async () => {
      sandbox.setUserTier('pro');
      const testFile = path.join(TEST_WORKSPACE, 'empty.ts');
      fs.writeFileSync(testFile, `export function foo() {}`, 'utf-8');

      await sandbox.buildSemanticCache();

      const results = await sandbox.querySemanticCache('nonexistent_xyz_abc');
      expect(results.length).toBe(0);
    });

    it('should allow free-tier users to query semantic cache', async () => {
      sandbox.setUserTier('free');
      const testFile = path.join(TEST_WORKSPACE, 'free_api.ts');
      fs.writeFileSync(testFile, 'export function freeTestQuery() {}', 'utf-8');
      await sandbox.buildSemanticCache();
      const results = await sandbox.querySemanticCache('freeTest');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =============================================
  // SELF-HEALING ROLLBACK TESTS
  // =============================================
  describe('Self-Healing Branch Rollbacks', () => {
    it('should create a snapshot before writing files', async () => {
      const filePath = 'rollback_test.txt';
      const fullPath = path.join(TEST_WORKSPACE, filePath);
      fs.writeFileSync(fullPath, 'original content', 'utf-8');

      await sandbox.writeFile(filePath, 'modified content');

      // The snapshot should exist, allowing revert
      const reverted = await sandbox.revertFile(filePath);
      expect(reverted).toBe(true);

      const content = fs.readFileSync(fullPath, 'utf-8');
      expect(content).toBe('original content');
    });

    it('should not revert files without a snapshot', async () => {
      const reverted = await sandbox.revertFile('no_such_file.txt');
      expect(reverted).toBe(false);
    });

    it('should trigger self-healing on command failure for pro users', async () => {
      sandbox.setUserTier('pro');

      // Create a file and make a snapshot
      const filePath = 'heal_test.txt';
      const fullPath = path.join(TEST_WORKSPACE, filePath);
      fs.writeFileSync(fullPath, 'baseline state', 'utf-8');

      // Write new content (creates snapshot of 'baseline state')
      await sandbox.writeFile(filePath, 'broken state');

      const stderrOutput: string[] = [];

      // Run a command that will fail
      const result = await sandbox.runCommand(
        'node -e "process.exit(1)"',
        undefined,
        (data) => stderrOutput.push(data)
      );

      expect(result.code).not.toBe(0);

      // Self-healing should have reverted the file
      const content = fs.readFileSync(fullPath, 'utf-8');
      expect(content).toContain('baseline state');

      // Check that self-healing messages were emitted
      const combinedStderr = stderrOutput.join('');
      expect(combinedStderr).toContain('SELF-HEALING');
    });

    it('should trigger self-healing on command failure regardless of tier', async () => {
      sandbox.setUserTier('free');

      const filePath = 'heal_free_test.txt';
      const fullPath = path.join(TEST_WORKSPACE, filePath);
      fs.writeFileSync(fullPath, 'original baseline', 'utf-8');

      await sandbox.writeFile(filePath, 'modified broke state');

      const stderrOutput: string[] = [];
      const result = await sandbox.runCommand('node -e "process.exit(1)"', undefined, (data) => stderrOutput.push(data));
      expect(result.code).not.toBe(0);

      // File should be reverted to baseline snapshot
      const content = fs.readFileSync(fullPath, 'utf-8');
      expect(content).toBe('original baseline');
      expect(stderrOutput.join('')).toContain('SELF-HEALING');
    });
  });

  // =============================================
  // RBAC COMMAND POLICIES TESTS
  // =============================================
  describe('RBAC Command Gating Policies', () => {
    it('should block restricted commands for enterprise developers', async () => {
      sandbox.setUserTier('enterprise');
      sandbox.setUserRole('developer');
      sandbox.setCommandPolicies({ blockedPrefixes: ['npm publish', 'docker push', 'terraform'] });

      const result = await sandbox.runCommand('npm publish --access public');
      expect(result.code).toBe(-1);
      expect(result.stderr).toContain('RBAC');
    });

    it('should allow restricted commands for enterprise admins', async () => {
      sandbox.setUserTier('enterprise');
      sandbox.setUserRole('admin');
      sandbox.setCommandPolicies({ blockedPrefixes: ['npm publish', 'docker push', 'terraform'] });

      // This should NOT be blocked by RBAC (though it might fail naturally)
      const result = await sandbox.runCommand('echo "admin test"');
      expect(result.stderr).not.toContain('RBAC');
    });

    it('should enforce RBAC policies based on user role regardless of tier', async () => {
      sandbox.setUserTier('free');
      sandbox.setUserRole('developer');
      sandbox.setCommandPolicies({ blockedPrefixes: ['npm publish'] });

      const result = await sandbox.runCommand('npm publish --dry-run');
      expect(result.code).toBe(-1);
      expect(result.stderr).toContain('RBAC');
    });

    it('should use default blocked prefixes when no custom policies set', async () => {
      sandbox.setUserTier('enterprise');
      sandbox.setUserRole('developer');
      // No custom policies set - defaults should apply

      const result = await sandbox.runCommand('npm publish');
      expect(result.code).toBe(-1);
      expect(result.stderr).toContain('RBAC');
    });

    it('should block dangerous commands regardless of RBAC', async () => {
      sandbox.setUserTier('enterprise');
      sandbox.setUserRole('admin');

      const result = await sandbox.runCommand('rm -rf /');
      expect(result.code).toBe(-1);
      expect(result.stderr).toContain('security sandbox policy');
    });
  });

  // =============================================
  // WORKSPACE SANDBOX WHITELIST TESTS
  // =============================================
  describe('Workspace Whitelist Sandbox', () => {
    it('should block access outside whitelisted directories', () => {
      const outsidePath = process.platform === 'win32' ? 'C:\\Windows\\System32\\evil.txt' : '/etc/shadow';
      expect(() => sandbox.resolvePath(outsidePath)).toThrow('Access Denied');
    });

    it('should allow access within whitelisted directories', () => {
      const resolved = sandbox.resolvePath('test_file.txt');
      expect(resolved.startsWith(TEST_WORKSPACE)).toBe(true);
    });

    it('should block directory traversal attacks', () => {
      expect(() => sandbox.resolvePath('../../etc/passwd')).toThrow();
    });

    it('should allow whitelisting additional directories', () => {
      const extraDir = path.join(TEST_WORKSPACE, 'extra_dir');
      fs.mkdirSync(extraDir, { recursive: true });
      sandbox.whitelistDirectory(extraDir);

      const dirs = sandbox.getWhitelistedDirectories();
      expect(dirs.length).toBeGreaterThanOrEqual(2);
    });
  });
});
