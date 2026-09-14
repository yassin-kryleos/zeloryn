import { describe, it, expect, vi } from 'vitest';
import { AgentOrchestrator, type ChatClient } from '../agents';
import { WorkspaceSandbox } from '../tools';

describe('Role-Based Model Routing in AgentOrchestrator', () => {
  const sandbox = new WorkspaceSandbox(process.cwd());

  it('dispatches developer tasks to coding role client', async () => {
    const defaultClient: ChatClient = {
      chatStream: vi.fn().mockImplementation((_msgs, cbs) => {
        cbs.onComplete('default response', '');
        return Promise.resolve();
      })
    };

    const codingClient: ChatClient = {
      chatStream: vi.fn().mockImplementation((_msgs, cbs) => {
        cbs.onComplete('coding client response', '');
        return Promise.resolve();
      })
    };

    const orchestrator = new AgentOrchestrator(sandbox, defaultClient, () => {});
    orchestrator.setRoleClient('coding', codingClient);

    // Invoke specialist with role 'developer'
    const result = await (orchestrator as any).invokeSpecialist('developer', 'Write a test file');

    expect(codingClient.chatStream).toHaveBeenCalled();
    expect(defaultClient.chatStream).not.toHaveBeenCalled();
    expect(result).toBe('coding client response');
  });

  it('dispatches research tasks to research role client', async () => {
    const defaultClient: ChatClient = {
      chatStream: vi.fn().mockImplementation((_msgs, cbs) => {
        cbs.onComplete('default response', '');
        return Promise.resolve();
      })
    };

    const researchClient: ChatClient = {
      chatStream: vi.fn().mockImplementation((_msgs, cbs) => {
        cbs.onComplete('researcher client response', '');
        return Promise.resolve();
      })
    };

    const orchestrator = new AgentOrchestrator(sandbox, defaultClient, () => {});
    orchestrator.setRoleClient('research', researchClient);

    const result = await (orchestrator as any).invokeSpecialist('researcher', 'Survey the codebase');

    expect(researchClient.chatStream).toHaveBeenCalled();
    expect(defaultClient.chatStream).not.toHaveBeenCalled();
    expect(result).toBe('researcher client response');
  });

  it('adapts messages for reasoning models by combining system prompt into user message', async () => {
    let capturedMessages: any[] = [];
    const reasoningClient: ChatClient = {
      model: 'deepseek-reasoner-v4' as any,
      chatStream: vi.fn().mockImplementation((msgs, cbs) => {
        capturedMessages = msgs;
        cbs.onComplete('reasoning response', 'thought process');
        return Promise.resolve();
      })
    };

    const defaultClient: ChatClient = {
      chatStream: vi.fn()
    };

    const orchestrator = new AgentOrchestrator(sandbox, defaultClient, () => {});
    orchestrator.setRoleClient('coding', reasoningClient);

    await (orchestrator as any).invokeSpecialist('developer', 'Architect the data layer');

    expect(capturedMessages.length).toBe(1);
    expect(capturedMessages[0].role).toBe('user');
    expect(capturedMessages[0].content).toContain('[SYSTEM INSTRUCTIONS]');
    expect(capturedMessages[0].content).toContain('[TASK ASSIGNED]');
  });
});
