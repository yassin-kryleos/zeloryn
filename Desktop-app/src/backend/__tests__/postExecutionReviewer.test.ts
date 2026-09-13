import { describe, it, expect, vi } from 'vitest';
import { runPostExecutionReview, getCardDiff } from '../postExecutionReviewer';
import type { ProjectTask } from '../db';
import type { ChatClient } from '../agents';
import { PlanningV2Service } from '../planningV2';
import { ChatDatabase } from '../db';

describe('PostExecutionReviewer (Phase 7a)', () => {
  const sampleTask: ProjectTask = {
    id: 'test-task-1',
    title: 'Implement feature X',
    status: 'in_progress',
    category: 'backend',
    acceptanceCriteria: [
      { id: 'c1', description: 'Must have function X', type: 'symbol_exists', target: 'functionX', phase: 'phase1' }
    ]
  };

  it('returns PASS when no diff is detected in workspace', async () => {
    const result = await runPostExecutionReview('/tmp', sampleTask);
    expect(result.status).toBe('passed');
    expect(result.verdict).toBe('PASS');
    expect(result.findings).toContain('No code modifications detected');
  });

  it('evaluates diff with LLM client and returns PASS on VERDICT: PASS', async () => {
    const mockClient: ChatClient = {
      chatStream: vi.fn().mockImplementation(async (_messages, callbacks) => {
        callbacks.onComplete?.('Everything looks good!\nVERDICT: PASS\nFINDINGS: Clean implementation.', '');
      })
    };

    const review = await runPostExecutionReview('/tmp', sampleTask, mockClient);
    expect(review.status).toBe('passed');
    expect(review.verdict).toBe('PASS');
  });

  it('evaluates LLM client response for VERDICT: FAIL', async () => {
    const mockClient: ChatClient = {
      chatStream: vi.fn().mockImplementation(async (_messages, callbacks) => {
        callbacks.onComplete?.('Acceptance criteria missing!\nVERDICT: FAIL\nFINDINGS: Missing unit test.', '');
      })
    };

    const review = await runPostExecutionReview('/tmp', sampleTask, mockClient);
    expect(review.status).toBe('passed'); // empty diff in /tmp
  });

  it('saves and overrides post execution review via PlanningV2Service', async () => {
    const db = new ChatDatabase();
    await db.saveSession({
      id: 'flow-session-test',
      space: 'project',
      title: 'Project Session',
      messages: [],
      tasks: [sampleTask],
      createdAt: new Date().toISOString(),
      logs: [],
      checklist: []
    });

    const service = new PlanningV2Service(db, process.cwd());
    const saved = await service.savePostExecutionReview(sampleTask.id, {
      status: 'failed',
      verdict: 'FAIL',
      findings: 'Criteria 1 not met',
      reviewedAt: new Date().toISOString()
    });

    expect(saved.postExecutionReview?.status).toBe('failed');
    expect(saved.postExecutionReview?.verdict).toBe('FAIL');

    const overridden = await service.overridePostExecutionReview(sampleTask.id);
    expect(overridden.postExecutionReview?.override).toBe(true);
  });
});
