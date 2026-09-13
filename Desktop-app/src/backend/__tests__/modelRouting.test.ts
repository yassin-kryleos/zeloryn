import { describe, expect, it, vi } from 'vitest';
import { AgentOrchestrator, type ChatClient } from '../agents';
import { WorkspaceSandbox } from '../tools';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Cost-Aware Model Routing (Phase 9b)', () => {
  it('routes scope_guard to fastClient when configured, while technical_reviewer uses primary client', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-routing-test-'));
    const sandbox = new WorkspaceSandbox(tmpDir);

    const primaryChatStream = vi.fn().mockImplementation(async (_messages, callbacks) => {
      callbacks.onComplete?.('Primary client response', '');
    });
    const primaryClient: ChatClient = {
      chatStream: primaryChatStream
    };

    const fastChatStream = vi.fn().mockImplementation(async (_messages, callbacks) => {
      callbacks.onComplete?.('Fast client response', '');
    });
    const fastClient: ChatClient = {
      chatStream: fastChatStream
    };

    const orchestrator = new AgentOrchestrator(
      sandbox,
      primaryClient,
      () => {},
      fastClient
    );

    // Call invokeSpecialist for scope_guard
    // @ts-ignore: private method access for test
    const scopeGuardRes = await orchestrator.invokeSpecialist('scope_guard', 'Review for scope creep');
    expect(fastChatStream).toHaveBeenCalledTimes(1);
    expect(primaryChatStream).not.toHaveBeenCalled();
    expect(scopeGuardRes).toBe('Fast client response');

    // Call invokeSpecialist for technical_reviewer
    // @ts-ignore: private method access for test
    const techReviewRes = await orchestrator.invokeSpecialist('technical_reviewer', 'Review technical architecture');
    expect(primaryChatStream).toHaveBeenCalledTimes(1);
    expect(fastChatStream).toHaveBeenCalledTimes(1); // still 1
    expect(techReviewRes).toBe('Primary client response');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('falls back to primary client for scope_guard when fastClient is not configured', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-routing-fallback-test-'));
    const sandbox = new WorkspaceSandbox(tmpDir);

    const primaryChatStream = vi.fn().mockImplementation(async (_messages, callbacks) => {
      callbacks.onComplete?.('Primary fallback response', '');
    });
    const primaryClient: ChatClient = {
      chatStream: primaryChatStream
    };

    const orchestrator = new AgentOrchestrator(
      sandbox,
      primaryClient,
      () => {}
    );

    // @ts-ignore: private method access for test
    const res = await orchestrator.invokeSpecialist('scope_guard', 'Review scope');
    expect(primaryChatStream).toHaveBeenCalledTimes(1);
    expect(res).toBe('Primary fallback response');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('allows dynamic updating of fastClient via setFastClient', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-routing-dyn-test-'));
    const sandbox = new WorkspaceSandbox(tmpDir);

    const primaryClient: ChatClient = {
      chatStream: vi.fn().mockImplementation(async (_m, cb) => cb.onComplete?.('Primary', ''))
    };
    const dynamicFastClient: ChatClient = {
      chatStream: vi.fn().mockImplementation(async (_m, cb) => cb.onComplete?.('Dynamic Fast', ''))
    };

    const orchestrator = new AgentOrchestrator(sandbox, primaryClient, () => {});
    expect(orchestrator.fastClient).toBeUndefined();

    orchestrator.setFastClient(dynamicFastClient);
    expect(orchestrator.fastClient).toBe(dynamicFastClient);

    // @ts-ignore
    const res = await orchestrator.invokeSpecialist('scope_guard', 'Check');
    expect(dynamicFastClient.chatStream).toHaveBeenCalledTimes(1);
    expect(res).toBe('Dynamic Fast');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
