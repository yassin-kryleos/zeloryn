import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  handoffRegistry,
  generateHandoffBundle,
  executeHandoff,
  TIER_2_HANDOFF_TARGETS,
  type CardHandoffPayload,
} from '../handoff';

describe('Tier 2 External Handoff Engine', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-handoff-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('registers all Tier 2 handoff targets including Cursor and Antigravity', () => {
    const list = handoffRegistry.list();
    const ids = list.map(t => t.id);

    expect(ids).toContain('cursor');
    expect(ids).toContain('antigravity');
    expect(ids).toContain('vscode');
    expect(ids).toContain('windsurf');
    expect(ids).toContain('clipboard');

    // Hard Constraint: ALL registered targets must be strictly Tier 2
    for (const target of list) {
      expect(target.tier).toBe(2);
    }
  });

  it('strictly verifies no Tier 1 (automated runner) exists for Cursor or Antigravity', () => {
    const cursor = handoffRegistry.get('cursor');
    const antigravity = handoffRegistry.get('antigravity');

    expect(cursor).toBeDefined();
    expect(cursor?.tier).toBe(2);
    expect((cursor as any).run).toBeUndefined();
    expect((cursor as any).runPty).toBeUndefined();

    expect(antigravity).toBeDefined();
    expect(antigravity?.tier).toBe(2);
    expect((antigravity as any).run).toBeUndefined();
    expect((antigravity as any).runPty).toBeUndefined();
  });

  it('generates a comprehensive structured markdown handoff bundle for a card', () => {
    const payload: CardHandoffPayload = {
      taskId: 'card_42',
      taskTitle: 'Refactor payment processing into BYOK keys',
      taskCategory: 'backend',
      taskAssignee: 'Builder',
      taskStatus: 'in_progress',
      description: 'Remove Stripe dependencies and migrate keys to OS_FINGERPRINT AES encryption.',
      acceptanceCriteria: [
        'Stripe SDK completely removed',
        'Offline BYOK keys load from .env',
      ],
      workspaceRoot: tempDir,
      targetAppId: 'cursor',
    };

    const target = handoffRegistry.get('cursor')!;
    const bundle = generateHandoffBundle(payload, target);

    expect(bundle).toContain('# Task Specification: Refactor payment processing into BYOK keys');
    expect(bundle).toContain('Card ID**: `card_42`');
    expect(bundle).toContain('Category**: backend');
    expect(bundle).toContain('Assignee**: Builder');
    expect(bundle).toContain('Handoff Target**: Cursor (Tier 2 External Handoff)');
    expect(bundle).toContain('## Acceptance Criteria');
    expect(bundle).toContain('- [ ] Stripe SDK completely removed');
    expect(bundle).toContain('- [ ] Offline BYOK keys load from .env');
    expect(bundle).toContain('## Instructions for External Agent');
  });

  it('executes handoff, saves to .kryleos/handoff/<id>.md, and returns instructions', async () => {
    const payload: CardHandoffPayload = {
      taskId: 'task:login-ui',
      taskTitle: 'Design responsive login screen',
      taskCategory: 'frontend',
      workspaceRoot: tempDir,
      targetAppId: 'clipboard',
      acceptanceCriteria: ['Passes a11y contrast checks'],
    };

    const result = await executeHandoff(payload);

    expect(result.success).toBe(true);
    expect(result.target.id).toBe('clipboard');
    expect(fs.existsSync(result.handoffFilePath)).toBe(true);

    const savedContent = fs.readFileSync(result.handoffFilePath, 'utf-8');
    expect(savedContent).toContain('Design responsive login screen');
    expect(savedContent).toContain('task:login-ui');
    expect(result.instructions).toContain('written to');
  });

  it('handles missing launch binary gracefully without throwing', async () => {
    const payload: CardHandoffPayload = {
      taskId: 'task-test',
      taskTitle: 'Test app launching fallback',
      workspaceRoot: tempDir,
      targetAppId: 'antigravity',
    };

    const result = await executeHandoff(payload);
    expect(result.success).toBe(true);
    expect(fs.existsSync(result.handoffFilePath)).toBe(true);
    // If binary not found in CI/test environment, gracefully handles it
    if (!result.launched) {
      expect(result.error).toContain('not found on PATH');
      expect(result.instructions).toContain('Open Antigravity');
    }
  });
});
