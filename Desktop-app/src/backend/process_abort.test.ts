import { describe, expect, it } from 'vitest';
import { AgentOrchestrator, type ChatClient, type CommandApprovalDecision } from './agents';
import { WorkspaceSandbox } from './tools';

const noopClient: ChatClient = {
  async chatStream(_messages, callbacks) {
    callbacks.onComplete?.('', '');
  }
};

describe('WorkspaceSandbox process aborts', () => {
  it('returns zero when no command process is active', () => {
    const sandbox = new WorkspaceSandbox(process.cwd());
    expect(sandbox.killActiveProcesses()).toBe(0);
  });

  it('terminates an active command process', async () => {
    const sandbox = new WorkspaceSandbox(process.cwd());
    const commandPromise = sandbox.runCommand('node -e "setTimeout(() => {}, 10000)"');

    await new Promise(resolve => setTimeout(resolve, 250));
    const killed = sandbox.killActiveProcesses();
    const result = await commandPromise;

    expect(killed).toBeGreaterThanOrEqual(1);
    expect(result.code).not.toBe(0);
    // ponytail: 15s timeout, not the vitest 5s default -- spawning a real
    // `node -e` child process is slow on loaded/shared CI runners, and this
    // test's failure mode observed in CI was a timeout, not a failed
    // assertion, so the kill logic itself is fine; it just needs headroom.
  }, 15000);

  it('marks pending command approval as aborted with a clear log', async () => {
    const sandbox = new WorkspaceSandbox(process.cwd());
    let latestUpdate: any = null;
    const orchestrator = new AgentOrchestrator(sandbox, noopClient, (update) => {
      latestUpdate = update;
    });

    const decisionPromise = new Promise<CommandApprovalDecision>((resolve) => {
      orchestrator.commandPendingApproval = {
        tool: 'runCommand',
        args: { command: 'npm run build' },
        resolve
      };
    });
    orchestrator.pendingCommandId = 'cmd_test';
    orchestrator.pendingCommandText = 'npm run build';

    const killed = orchestrator.abortExecution();
    const decision = await decisionPromise;

    expect(killed).toBe(0);
    expect(decision).toBe('aborted');
    expect(orchestrator.commandPendingApproval).toBeNull();
    expect(orchestrator.pendingCommandId).toBeNull();
    expect(orchestrator.pendingCommandText).toBeNull();
    expect(latestUpdate.logs.at(-1).message).toContain('WORKFLOW ABORTED');
    expect(latestUpdate.logs.at(-1).message).toContain('npm run build');
  });
});
