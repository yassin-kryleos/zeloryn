import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentOrchestrator, type ChatClient } from '../agents';
import { WorkspaceSandbox } from '../tools';

const noopClient: ChatClient = {
  async chatStream(_messages, callbacks) {
    callbacks.onComplete?.('', '');
  }
};

function readApprovalLogs(workspaceRoot: string): any[] {
  const filePath = path.join(workspaceRoot, '.kryleos', 'command_approvals.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('command_approvals.json audit trail (P5.6)', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kryleos_audit_test_'));
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('records source "local" with no deviceId when desktop UI resolves the approval', async () => {
    const sandbox = new WorkspaceSandbox(workspaceRoot);
    const orchestrator = new AgentOrchestrator(sandbox, noopClient, () => {});
    orchestrator.onCommandApprovalRequired = () => {
      orchestrator.pendingApprovalSource = { source: 'local' };
      orchestrator.commandPendingApproval!.resolve('approved');
    };

    await orchestrator.runCommandWithApproval('echo hi');

    const logs = readApprovalLogs(workspaceRoot);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ command: 'echo hi', decision: 'approved', source: 'local', deviceId: null });
    expect(orchestrator.pendingApprovalSource).toBeNull();
  });

  it('records source "remote" with the paired deviceId when a companion resolves the approval', async () => {
    const sandbox = new WorkspaceSandbox(workspaceRoot);
    const orchestrator = new AgentOrchestrator(sandbox, noopClient, () => {});
    orchestrator.onCommandApprovalRequired = () => {
      orchestrator.pendingApprovalSource = { source: 'remote', deviceId: 'phone-1' };
      orchestrator.commandPendingApproval!.resolve('rejected');
    };

    await orchestrator.runCommandWithApproval('echo hi');

    const logs = readApprovalLogs(workspaceRoot);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ command: 'echo hi', decision: 'rejected', source: 'remote', deviceId: 'phone-1' });
  });

  it('defaults to source "local" with no deviceId if nothing sets pendingApprovalSource', async () => {
    const sandbox = new WorkspaceSandbox(workspaceRoot);
    const orchestrator = new AgentOrchestrator(sandbox, noopClient, () => {});
    orchestrator.onCommandApprovalRequired = () => {
      orchestrator.commandPendingApproval!.resolve('aborted');
    };

    await orchestrator.runCommandWithApproval('echo hi');

    const logs = readApprovalLogs(workspaceRoot);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ command: 'echo hi', decision: 'aborted', source: 'local', deviceId: null });
  });
});
