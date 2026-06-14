import { describe, expect, it } from 'vitest';
import { PlanningV2Service, parsePhase1Criteria, isLikelyComplete, type DriftItem, type TraceExtractionClient } from './planningV2';
import { ChatDatabase } from './db';
import type { CriterionResult, ProjectTask } from './db';

function service(): PlanningV2Service {
  // The constructor performs no file IO; extractTraceWithLLM never touches the DB.
  return new PlanningV2Service(new ChatDatabase(), process.cwd());
}

function clientReturning(response: string, capture?: (prompt: string) => void): TraceExtractionClient {
  return {
    async chatStream(messages, callbacks) {
      capture?.(messages.map(m => m.content).join('\n'));
      callbacks.onComplete?.(response, '');
    }
  };
}

const task: ProjectTask = {
  id: 'task_1',
  title: 'Add login form',
  status: 'in_progress',
  acceptanceCriteria: [
    { id: 'c-file', type: 'file_exists', description: 'login file', target: 'src/Login.tsx', phase: 'phase2' },
    { id: 'c-test', type: 'test_passes', description: 'login tests pass', target: 'npm test', phase: 'phase1' }
  ]
};

const evaluated: CriterionResult[] = [
  { criterionId: 'c-file', type: 'file_exists', status: 'pass', evidence: 'Found src/Login.tsx' },
  { criterionId: 'c-test', type: 'test_passes', status: 'unknown', evidence: 'Test criteria require a command result.' }
];

const evidence = {
  filesChanged: ['src/Login.tsx'],
  commandsRun: ['npm test'],
  outcomes: ['Test Suites: 1 passed, 1 total']
};

describe('PlanningV2Service.extractTraceWithLLM', () => {
  it('parses a <json>-wrapped structured response', async () => {
    const response = '<json>{"summary":"Added the login form and tests passed.","criteria":[{"criterionId":"c-test","status":"pass","evidence":"Test suite reported 1 passed"}]}</json>';
    const result = await service().extractTraceWithLLM(clientReturning(response), task, evaluated, evidence);
    expect(result?.summary).toContain('login form');
    expect(result?.criteria?.[0]).toMatchObject({ criterionId: 'c-test', status: 'pass' });
  });

  it('tolerates fenced and prose-wrapped JSON', async () => {
    const response = 'Here is the analysis:\n```json\n{"summary":"done","criteria":[]}\n```\nThanks!';
    const result = await service().extractTraceWithLLM(clientReturning(response), task, evaluated, evidence);
    expect(result?.summary).toBe('done');
  });

  it('grounds the prompt in run evidence and unresolved criteria only', async () => {
    let prompt = '';
    await service().extractTraceWithLLM(
      clientReturning('<json>{"summary":"x"}</json>', p => { prompt = p; }),
      task,
      evaluated,
      evidence
    );
    expect(prompt).toContain('src/Login.tsx');
    expect(prompt).toContain('UNRESOLVED CRITERIA');
    expect(prompt).toContain('c-test');
    // The structurally-resolved file criterion must not be sent for LLM assessment.
    expect(prompt).not.toContain('c-file [file_exists]');
  });

  it('returns null when the model output has no JSON', async () => {
    const result = await service().extractTraceWithLLM(clientReturning('no json here'), task, evaluated, evidence);
    expect(result).toBeNull();
  });

  it('returns null when the client errors', async () => {
    const errorClient: TraceExtractionClient = {
      async chatStream(_messages, callbacks) {
        callbacks.onError?.(new Error('provider down'));
      }
    };
    const result = await service().extractTraceWithLLM(errorClient, task, evaluated, evidence);
    expect(result).toBeNull();
  });
});

const failingResults: CriterionResult[] = [
  { criterionId: 'c-file', type: 'file_exists', status: 'fail', evidence: 'Missing src/Login.tsx' }
];

describe('PlanningV2Service.classifyDivergence', () => {
  it('returns true when the model reports divergence', async () => {
    const client = clientReturning('<json>{"diverged": true, "reason": "Built a signup form instead"}</json>');
    expect(await service().classifyDivergence(client, task, failingResults)).toBe(true);
  });

  it('returns false when the model reports incomplete (not diverged)', async () => {
    const client = clientReturning('<json>{"diverged": false, "reason": "Just unfinished"}</json>');
    expect(await service().classifyDivergence(client, task, failingResults)).toBe(false);
  });

  it('returns null when diverged is missing or non-boolean', async () => {
    const client = clientReturning('<json>{"reason": "unsure"}</json>');
    expect(await service().classifyDivergence(client, task, failingResults)).toBeNull();
  });

  it('grounds the prompt in the failing criteria evidence', async () => {
    let prompt = '';
    await service().classifyDivergence(
      clientReturning('<json>{"diverged": false}</json>', p => { prompt = p; }),
      task,
      failingResults
    );
    expect(prompt).toContain('FAILING CRITERIA');
    expect(prompt).toContain('Missing src/Login.tsx');
  });

  it('returns null when the client errors', async () => {
    const errorClient: TraceExtractionClient = {
      async chatStream(_messages, callbacks) {
        callbacks.onError?.(new Error('provider down'));
      }
    };
    expect(await service().classifyDivergence(errorClient, task, failingResults)).toBeNull();
  });
});

const openItems: DriftItem[] = [
  { taskId: 't1', title: 'one', status: 'not_started', blockedBy: [], results: [], suggestedStatus: 'todo' },
  { taskId: 't2', title: 'two', status: 'in_progress', blockedBy: [], results: [], suggestedStatus: 'in_progress' }
];

describe('PlanningV2Service.prioritizeWhatsLeft', () => {
  it('parses ordered items with reasons', async () => {
    const client = clientReturning('<json>{"items":[{"taskId":"t2","reason":"closest to done"},{"taskId":"t1","reason":"foundational"}]}</json>');
    const ranked = await service().prioritizeWhatsLeft(client, openItems);
    expect(ranked.map(r => r.taskId)).toEqual(['t2', 't1']);
    expect(ranked[0].reason).toBe('closest to done');
  });

  it('drops ids that are not in the open set', async () => {
    const client = clientReturning('<json>{"items":[{"taskId":"bogus","reason":"x"},{"taskId":"t1","reason":"y"}]}</json>');
    const ranked = await service().prioritizeWhatsLeft(client, openItems);
    expect(ranked.map(r => r.taskId)).toEqual(['t1']);
  });

  it('returns empty array on unparseable output (caller falls back)', async () => {
    const ranked = await service().prioritizeWhatsLeft(clientReturning('no json'), openItems);
    expect(ranked).toEqual([]);
  });

  it('returns empty array when the client errors', async () => {
    const errorClient: TraceExtractionClient = {
      async chatStream(_messages, callbacks) { callbacks.onError?.(new Error('down')); }
    };
    expect(await service().prioritizeWhatsLeft(errorClient, openItems)).toEqual([]);
  });
});

describe('parsePhase1Criteria', () => {
  it('parses valid abstract criteria with phase1 + unknown status', () => {
    const raw = '<json>{"criteria":[{"type":"symbol_exists","description":"LoginForm exists","target":"LoginForm"},{"type":"test_passes","description":"auth tests pass","target":"npm test"}]}</json>';
    const out = parsePhase1Criteria(raw, task)!;
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: 'symbol_exists', target: 'LoginForm', phase: 'phase1', status: 'unknown' });
  });

  it('coerces unknown/invalid types to llm_check', () => {
    const raw = '<json>{"criteria":[{"type":"file_exists","description":"x","target":"y"}]}</json>';
    const out = parsePhase1Criteria(raw, task)!;
    expect(out[0].type).toBe('llm_check');
  });

  it('drops rows missing description or target', () => {
    const raw = '<json>{"criteria":[{"type":"symbol_exists","description":"","target":"y"},{"type":"llm_check","description":"ok","target":"claim"}]}</json>';
    const out = parsePhase1Criteria(raw, task)!;
    expect(out).toHaveLength(1);
    expect(out[0].description).toBe('ok');
  });

  it('returns null on empty or unparseable payload', () => {
    expect(parsePhase1Criteria('no json', task)).toBeNull();
    expect(parsePhase1Criteria('<json>{"criteria":[]}</json>', task)).toBeNull();
  });
});

describe('isLikelyComplete', () => {
  const r = (type: any, status: any): CriterionResult => ({ criterionId: 'x', type, status, evidence: '' });

  it('true when all structural criteria pass', () => {
    expect(isLikelyComplete([r('file_exists', 'pass'), r('symbol_exists', 'pass')])).toBe(true);
  });

  it('false when a structural criterion fails', () => {
    expect(isLikelyComplete([r('file_exists', 'pass'), r('symbol_exists', 'fail')])).toBe(false);
  });

  it('ignores non-structural criteria (test_passes/llm_check)', () => {
    // structural passes; the unknown llm_check must not block.
    expect(isLikelyComplete([r('file_exists', 'pass'), r('llm_check', 'unknown')])).toBe(true);
  });

  it('false when there are no structural criteria', () => {
    expect(isLikelyComplete([r('test_passes', 'pass'), r('llm_check', 'pass')])).toBe(false);
  });
});
