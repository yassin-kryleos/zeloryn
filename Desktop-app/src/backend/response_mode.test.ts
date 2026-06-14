import { describe, expect, it } from 'vitest';
import { AgentOrchestrator, type ChatClient } from './agents';
import { WorkspaceSandbox } from './tools';

const noopClient: ChatClient = {
  async chatStream(_messages, callbacks) {
    callbacks.onComplete?.('', '');
  }
};

describe('Response modes', () => {
  it('uses balanced response mode by default', () => {
    const orchestrator = new AgentOrchestrator(new WorkspaceSandbox(process.cwd()), noopClient, () => {});
    expect(orchestrator.getResponseModeInstructions()).toContain('Balanced');
  });

  it('injects concise behavior for token-saving replies', () => {
    const orchestrator = new AgentOrchestrator(new WorkspaceSandbox(process.cwd()), noopClient, () => {});
    orchestrator.setResponseMode('concise');
    const instructions = orchestrator.getResponseModeInstructions();

    expect(instructions).toContain('Concise');
    expect(instructions).toContain('Minimize token use');
  });

  it('injects critical behavior for blunt review', () => {
    const orchestrator = new AgentOrchestrator(new WorkspaceSandbox(process.cwd()), noopClient, () => {});
    orchestrator.setResponseMode('critical');
    const instructions = orchestrator.getResponseModeInstructions();

    expect(instructions).toContain('Critical Reviewer');
    expect(instructions).toContain('Call out mistakes');
  });

  it('falls back to balanced mode for invalid values', () => {
    const orchestrator = new AgentOrchestrator(new WorkspaceSandbox(process.cwd()), noopClient, () => {});
    orchestrator.setResponseMode('invalid' as any);
    expect(orchestrator.getResponseModeInstructions()).toContain('Balanced');
  });
});
