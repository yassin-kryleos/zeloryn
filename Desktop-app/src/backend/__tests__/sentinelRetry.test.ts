import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceSandbox } from '../tools';
import { AgentOrchestrator, type ChatClient } from '../agents';

const noopClient: ChatClient = {
  async chatStream(_messages, callbacks) {
    callbacks.onComplete?.('Task completed', '');
  }
};

describe('Sentinel Check and Test Command Detection (Phase 7b)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel_test_'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects npm test when package.json has a test script', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test-pkg', scripts: { test: 'vitest run' } })
    );

    const sandbox = new WorkspaceSandbox(tmpDir);
    const testCmd = await sandbox.detectTestCommand();
    expect(testCmd).toBe('npm test');
  });

  it('detects pytest when pytest files or config exist', async () => {
    fs.writeFileSync(path.join(tmpDir, 'pytest.ini'), '[pytest]\n');

    const sandbox = new WorkspaceSandbox(tmpDir);
    const testCmd = await sandbox.detectTestCommand();
    expect(testCmd).toBe('pytest');
  });

  it('detects cargo test when Cargo.toml exists', async () => {
    fs.writeFileSync(path.join(tmpDir, 'Cargo.toml'), '[package]\nname = "foo"\n');

    const sandbox = new WorkspaceSandbox(tmpDir);
    const testCmd = await sandbox.detectTestCommand();
    expect(testCmd).toBe('cargo test');
  });

  it('returns null when no known test runner is present', async () => {
    const sandbox = new WorkspaceSandbox(tmpDir);
    const testCmd = await sandbox.detectTestCommand();
    expect(testCmd).toBeNull();
  });

  it('initializes orchestrator with empty sentinel result and tracks run state', async () => {
    const sandbox = new WorkspaceSandbox(tmpDir);
    const orchestrator = new AgentOrchestrator(sandbox, noopClient, () => {});

    expect(orchestrator.getSentinelResult()).toBeNull();
    const state = orchestrator.getRunState();
    expect(state.incomplete).toBe(false);
  });
});
