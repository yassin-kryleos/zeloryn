import { describe, expect, it } from 'vitest';
import { AgentOrchestrator, type ChatClient } from './agents';
import { WorkspaceSandbox } from './tools';

const noopClient: ChatClient = {
  async chatStream(_messages, callbacks) { callbacks.onComplete?.('', ''); }
};

function orchestrator() {
  return new AgentOrchestrator(new WorkspaceSandbox(process.cwd()), noopClient, () => {});
}

describe('runCommandWithApproval (deterministic smoke path)', () => {
  it('runs the command after approval', async () => {
    const o = orchestrator();
    o.onCommandApprovalRequired = () => {
      // Approve as soon as the pending request is registered.
      setTimeout(() => o.commandPendingApproval?.resolve('approved'), 0);
    };
    const out = await o.runCommandWithApproval('node -v');
    expect(out).toContain('completed with code');
  });

  it('does not run when rejected', async () => {
    const o = orchestrator();
    o.onCommandApprovalRequired = () => {
      setTimeout(() => o.commandPendingApproval?.resolve('rejected'), 0);
    };
    const out = await o.runCommandWithApproval('node -v');
    expect(out).toContain('rejected by user');
  });
});
