import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WorkspaceSandbox } from '../tools';
import * as fs from 'fs';
import * as path from 'path';

describe('Command Security and Timeouts Unit Tests', () => {
  const testDir = path.resolve(__dirname, 'command-security-temp');
  let sandbox: WorkspaceSandbox;

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) {
      await fs.promises.mkdir(testDir, { recursive: true });
    }
    sandbox = new WorkspaceSandbox(testDir);
  });

  afterAll(async () => {
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should block blacklisted dangerous commands', async () => {
    const result = await sandbox.runCommand('rm -rf /');
    expect(result.code).toBe(-1);
    expect(result.stderr).toContain('blocked by security sandbox policy');
  });

  it('should block Windows dangerous commands', async () => {
    const result = await sandbox.runCommand('rmdir /s /q C:\\Windows');
    expect(result.code).toBe(-1);
    expect(result.stderr).toContain('blocked by security sandbox policy');
  });

  it('should enforce RBAC command policies for developer role', async () => {
    sandbox.setUserTier('enterprise');
    sandbox.setUserRole('developer');
    sandbox.setCommandPolicies({ blockedPrefixes: ['npm publish', 'aws s3'] });

    const result = await sandbox.runCommand('npm publish --access public');
    expect(result.code).toBe(-1);
    expect(result.stderr).toContain('blocked by Enterprise RBAC policy');
  });

  it('should allow RBAC commands for admin role', async () => {
    sandbox.setUserTier('enterprise');
    sandbox.setUserRole('admin');
    sandbox.setCommandPolicies({ blockedPrefixes: ['npm publish', 'aws s3'] });

    // Node -v is allowed generally
    const result = await sandbox.runCommand('node -v');
    expect(result.code).toBe(0);
    expect(result.stdout).toBeDefined();
  });
});
