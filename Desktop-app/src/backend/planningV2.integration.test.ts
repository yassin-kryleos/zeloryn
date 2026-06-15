import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PlanningV2Service, type TraceExtractionClient } from './planningV2';
import { ChatDatabase } from './db';
import type { ChatSession, ProjectTask } from './db';

function clientReturning(response: string, capture?: (prompt: string) => void): TraceExtractionClient {
  return {
    async chatStream(messages, callbacks) {
      capture?.(messages.map(m => m.content).join('\n'));
      callbacks.onComplete?.(response, '');
    }
  };
}

// These exercise the DB-backed paths (flow_board read/write + .kryleos file IO).
// ChatDatabase keys off process.cwd(), so each test runs in an isolated temp cwd.
let tmp: string;
let prevCwd: string;
let db: ChatDatabase;
let svc: PlanningV2Service;

async function seed(tasks: ProjectTask[]) {
  const session: ChatSession = {
    id: 'flow_board',
    title: 'FLOW Board',
    createdAt: '2026-01-01T00:00:00.000Z',
    logs: [],
    checklist: [],
    space: 'project',
    tasks
  };
  await db.saveSession(session);
}

const getTask = async (id: string) =>
  (await db.getSession('flow_board'))!.tasks!.find(t => t.id === id)!;

beforeEach(() => {
  prevCwd = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pv2-int-'));
  process.chdir(tmp);
  db = new ChatDatabase();
  svc = new PlanningV2Service(db, tmp);
});

afterEach(() => {
  process.chdir(prevCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('PlanningV2Service criteria round-trip', () => {
  it('saves explicit criteria and reads them back', async () => {
    await seed([{ id: 'task_1700000000001', title: 'Add login', status: 'todo' }]);
    await svc.saveCriteria('task_1700000000001', [
      { id: 'c1', type: 'symbol_exists', description: 'd', target: 'LoginForm', phase: 'phase1', status: 'unknown' }
    ]);
    const { criteria } = await svc.getCriteria('task_1700000000001');
    expect(criteria).toHaveLength(1);
    expect(criteria[0].target).toBe('LoginForm');
  });

  it('falls back to deterministic criteria when none supplied', async () => {
    await seed([{ id: 'task_1700000000001', title: 'Add login', status: 'todo' }]);
    const task = await svc.saveCriteria('task_1700000000001');
    expect((task.acceptanceCriteria || []).length).toBeGreaterThan(0);
  });

  it('throws for an unknown plan item', async () => {
    await seed([]);
    await expect(svc.getCriteria('nope')).rejects.toThrow();
  });
});

describe('PlanningV2Service.enrichCriteria', () => {
  it('adds a phase2 file_exists candidate from a workspace scan', async () => {
    fs.mkdirSync(path.join(tmp, 'src'));
    fs.writeFileSync(path.join(tmp, 'src', 'login.ts'), 'export const LoginForm = 1;');
    await seed([{ id: 'task_1700000000001', title: 'Login system', status: 'todo', category: 'frontend' }]);
    await svc.saveCriteria('task_1700000000001', [
      { id: 'c1', type: 'symbol_exists', description: 'd', target: 'LoginForm', phase: 'phase1', status: 'unknown' }
    ]);
    const result = await svc.enrichCriteria('task_1700000000001');
    expect(result.added.some(c => c.type === 'file_exists' && c.phase === 'phase2')).toBe(true);
    expect(result.added.some(c => c.target.includes('login.ts'))).toBe(true);
  });
});

describe('PlanningV2Service trace persistence', () => {
  it('writes a trace file, links it to the task, and lists newest-first', async () => {
    await seed([{ id: 'task_1700000000001', title: 'Build', status: 'todo' }]);
    await svc.saveTrace({ planItemId: 'task_1700000000001', timestamp: '2026-02-01T00:00:00.000Z', summary: 'older' });
    await svc.saveTrace({ planItemId: 'task_1700000000001', timestamp: '2026-02-02T00:00:00.000Z', summary: 'newer' });

    const traceDir = path.join(tmp, '.kryleos', 'traces');
    expect(fs.readdirSync(traceDir).filter(f => f.endsWith('.json'))).toHaveLength(2);

    const traces = svc.listTraces('task_1700000000001');
    expect(traces).toHaveLength(2);
    expect(traces[0].summary).toBe('newer'); // newest first

    const task = await getTask('task_1700000000001');
    expect(task.latestTraceId).toBeTruthy();
  });

  it('writes traces atomically and forces incomplete evidence to unknown', async () => {
    fs.writeFileSync(path.join(tmp, 'present.ts'), 'ok');
    await seed([{ id: 'task_partial', title: 'Partial', status: 'in_progress', acceptanceCriteria: [
      { id: 'c1', type: 'file_exists', description: 'present', target: 'present.ts', phase: 'phase2' }
    ] }]);
    const trace = await svc.saveTrace({
      planItemId: 'task_partial',
      incompleteReason: 'maximum steps reached',
      suggestedStatus: 'in_progress'
    });
    expect(trace.suggestedStatus).toBe('in_progress');
    expect(trace.criteriaResults[0].status).toBe('unknown');
    expect(trace.incompleteReason).toContain('maximum steps');
    expect(fs.readdirSync(path.join(tmp, '.kryleos', 'traces')).some(file => file.endsWith('.tmp'))).toBe(false);
  });

  it('recovers an interrupted run marker as a non-green trace', async () => {
    await seed([{ id: 'task_interrupted', title: 'Interrupted', status: 'in_progress' }]);
    fs.mkdirSync(path.join(tmp, '.kryleos'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.kryleos', 'run-in-progress.json'), JSON.stringify({
      planItemId: 'task_interrupted',
      startedAt: '2026-02-03T00:00:00.000Z'
    }));
    const trace = await svc.recoverInterruptedRun();
    expect(trace?.suggestedStatus).toBe('in_progress');
    expect(trace?.incompleteReason).toContain('stopped before trace completion');
    expect(fs.existsSync(path.join(tmp, '.kryleos', 'run-in-progress.json'))).toBe(false);
  });
});

describe('PlanningV2Service.checkDrift', () => {
  it('scans a 1,000-file workspace without losing structural correctness', async () => {
    const stressDir = path.join(tmp, 'stress');
    fs.mkdirSync(stressDir);
    for (let index = 0; index < 1000; index++) {
      fs.writeFileSync(path.join(stressDir, `file-${index}.ts`), `export const value${index} = ${index};\n`);
    }
    await seed([{ id: 'stress-task', title: 'Find final stress file', status: 'todo', acceptanceCriteria: [
      { id: 'stress-file', type: 'file_exists', description: 'final file exists', target: 'stress/file-999.ts', phase: 'phase2' }
    ] }]);
    const startedAt = Date.now();
    const report = await svc.checkDrift();
    expect(report.items[0].results[0].status).toBe('pass');
    expect(Date.now() - startedAt).toBeLessThan(10_000);
  });

  it('classifies complete vs not_started from file evidence and persists driftStatus', async () => {
    fs.writeFileSync(path.join(tmp, 'present.ts'), 'ok');
    await seed([
      { id: 'task_done', title: 'has file', status: 'todo', acceptanceCriteria: [
        { id: 'c1', type: 'file_exists', description: 'd', target: 'present.ts', phase: 'phase2', status: 'unknown' }
      ] },
      { id: 'task_open', title: 'missing file', status: 'todo', acceptanceCriteria: [
        { id: 'c2', type: 'file_exists', description: 'd', target: 'absent.ts', phase: 'phase2', status: 'unknown' }
      ] }
    ]);

    const report = await svc.checkDrift(); // no client → no diverged
    expect(report.summary.complete).toBe(1);
    expect(report.deferred).toBe(0);
    expect(report.llmEvaluated).toBe(0);

    const done = await getTask('task_done');
    expect(done.driftStatus).toBe('complete');
  });

  it('llm_check stays unknown without a client', async () => {
    await seed([
      { id: 'task_llm', title: 'Add login form', status: 'todo', acceptanceCriteria: [
        { id: 'c-llm', type: 'llm_check', description: 'User confirms the implementation satisfies: Add login form', target: 'Add login form', phase: 'phase1', status: 'unknown' }
      ] }
    ]);

    const report = await svc.checkDrift(); // no client → llm_check left unknown
    expect(report.llmEvaluated).toBe(0);
    const item = report.items.find(i => i.taskId === 'task_llm')!;
    expect(item.results[0].status).toBe('unknown');
    expect(item.status).toBe('not_started');
  });

  it('resolves an llm_check criterion via a budgeted, cached model call', async () => {
    fs.mkdirSync(path.join(tmp, 'src'));
    fs.writeFileSync(path.join(tmp, 'src', 'Login.tsx'), 'export function LoginForm() { return null; }');
    await seed([
      { id: 'task_llm', title: 'Add login form', status: 'todo', acceptanceCriteria: [
        { id: 'c-llm', type: 'llm_check', description: 'A login form component exists', target: 'Add login form', phase: 'phase1', status: 'unknown' }
      ] }
    ]);

    let calls = 0;
    const client = clientReturning('<json>{"status":"pass","evidence":"Login.tsx defines LoginForm"}</json>', () => { calls++; });

    const report = await svc.checkDrift(client);
    expect(calls).toBe(1);
    expect(report.llmEvaluated).toBe(1);
    const item = report.items.find(i => i.taskId === 'task_llm')!;
    expect(item.results[0].status).toBe('pass');
    expect(item.results[0].evidence).toContain('Login.tsx defines LoginForm');
    expect(item.status).toBe('complete');

    // Second run reuses the cache — no additional model call.
    const report2 = await svc.checkDrift(client);
    expect(calls).toBe(1);
    expect(report2.llmEvaluated).toBe(0);
    const item2 = report2.items.find(i => i.taskId === 'task_llm')!;
    expect(item2.results[0].status).toBe('pass');

    // Working-tree content changes invalidate the cache even when no git
    // commit changes (this temp workspace is intentionally not a git repo).
    fs.writeFileSync(path.join(tmp, 'src', 'Login.tsx'), 'export const LoginForm = "changed";');
    const report3 = await svc.checkDrift(client);
    expect(calls).toBe(2);
    expect(report3.llmEvaluated).toBe(1);
  });

  it('defers llm_check evaluation once the per-run budget is exhausted', async () => {
    const tasks: ProjectTask[] = Array.from({ length: 11 }, (_, i) => ({
      id: `task_${i}`,
      title: `Feature ${i}`,
      status: 'todo',
      acceptanceCriteria: [
        { id: `c-${i}`, type: 'llm_check', description: `Feature ${i} is implemented`, target: `Feature ${i}`, phase: 'phase1', status: 'unknown' }
      ]
    }));
    await seed(tasks);

    const client = clientReturning('<json>{"status":"unknown","evidence":"insufficient evidence"}</json>');
    const report = await svc.checkDrift(client);

    // Budget caps at 10 calls; the 11th criterion is deferred.
    expect(report.llmEvaluated).toBe(10);
    expect(report.deferred).toBe(1);
  });
});

describe('PlanningV2Service.evaluateLlmCheck', () => {
  it('grounds the prompt in workspace excerpts relevant to the plan item', async () => {
    fs.mkdirSync(path.join(tmp, 'src'));
    fs.writeFileSync(path.join(tmp, 'src', 'Login.tsx'), 'export function LoginForm() { return null; }');
    fs.writeFileSync(path.join(tmp, 'src', 'Unrelated.tsx'), 'export const Widget = 1;');

    const task: ProjectTask = { id: 't', title: 'Add login form', status: 'todo' };
    const criterion = { id: 'c-llm', type: 'llm_check' as const, description: 'A login form component exists', target: 'Add login form', phase: 'phase1' as const, status: 'unknown' as const };

    let prompt = '';
    const client = clientReturning('<json>{"status":"pass","evidence":"LoginForm is defined"}</json>', p => { prompt = p; });

    const result = await svc.evaluateLlmCheck(client, task, criterion, tmp);
    expect(result).toEqual({ status: 'pass', evidence: 'LLM: LoginForm is defined' });
    expect(prompt).toContain('Login.tsx');
    expect(prompt).toContain('A login form component exists');
  });

  it('returns unknown when the model response cannot be parsed', async () => {
    const task: ProjectTask = { id: 't', title: 'Add login form', status: 'todo' };
    const criterion = { id: 'c-llm', type: 'llm_check' as const, description: 'A login form component exists', target: 'Add login form', phase: 'phase1' as const, status: 'unknown' as const };

    const result = await svc.evaluateLlmCheck(clientReturning('no json here'), task, criterion, tmp);
    expect(result.status).toBe('unknown');
  });
});

describe('PlanningV2Service.whatsLeft', () => {
  it('returns deterministic open items capped by limit and flags truncation', async () => {
    const tasks: ProjectTask[] = Array.from({ length: 4 }, (_, i) => ({
      id: `task_${i}`, title: `t${i}`, status: 'todo'
    }));
    await seed(tasks);
    const report = await svc.whatsLeft(undefined, 2);
    expect(report.usedLlm).toBe(false);
    expect(report.items).toHaveLength(2);
    expect(report.total).toBe(4);
    expect(report.truncated).toBe(true);
    expect(report.items[0].reason).toBeTruthy();
  });

  it('returns all items when limit is null', async () => {
    await seed([{ id: 'a', title: 'a', status: 'todo' }, { id: 'b', title: 'b', status: 'in_progress' }]);
    const report = await svc.whatsLeft(undefined, null);
    expect(report.truncated).toBe(false);
    expect(report.items).toHaveLength(2);
  });
});

describe('PlanningV2Service.evaluateCriteria symbol matching', () => {
  it('symbol_exists matches whole identifiers only; git_grep is substring', async () => {
    fs.mkdirSync(path.join(tmp, 'src'));
    fs.writeFileSync(path.join(tmp, 'src', 'a.ts'), 'export const Foobar = 1;');
    const task: ProjectTask = { id: 't', title: 'x', status: 'todo' };

    // "Foo" is a substring of Foobar but not a whole identifier.
    const [symFail] = svc.evaluateCriteria(task, [
      { id: 'c', type: 'symbol_exists', description: 'd', target: 'Foo', phase: 'phase1', status: 'unknown' }
    ]);
    expect(symFail.status).toBe('fail');

    const [grepPass] = svc.evaluateCriteria(task, [
      { id: 'c', type: 'git_grep', description: 'd', target: 'Foo', phase: 'phase1', status: 'unknown' }
    ]);
    expect(grepPass.status).toBe('pass');

    fs.writeFileSync(path.join(tmp, 'src', 'b.ts'), 'const Foo = 2;');
    const [symPass] = svc.evaluateCriteria(task, [
      { id: 'c', type: 'symbol_exists', description: 'd', target: 'Foo', phase: 'phase1', status: 'unknown' }
    ]);
    expect(symPass.status).toBe('pass');
  });

  it('symbol_exists ignores comment-only and string-literal-only mentions', async () => {
    fs.mkdirSync(path.join(tmp, 'src'));
    fs.writeFileSync(
      path.join(tmp, 'src', 'commented.ts'),
      [
        '// TODO: implement authenticateUser',
        '/* authenticateUser is also planned here */',
        'const msg = "authenticateUser not implemented yet";',
        'export const noop = () => {};'
      ].join('\n')
    );
    const task: ProjectTask = { id: 't', title: 'x', status: 'todo' };

    const [symFail] = svc.evaluateCriteria(task, [
      { id: 'c', type: 'symbol_exists', description: 'd', target: 'authenticateUser', phase: 'phase1', status: 'unknown' }
    ]);
    expect(symFail.status).toBe('fail');

    // git_grep keeps raw substring semantics and should still find it in the comment.
    const [grepPass] = svc.evaluateCriteria(task, [
      { id: 'c', type: 'git_grep', description: 'd', target: 'authenticateUser', phase: 'phase1', status: 'unknown' }
    ]);
    expect(grepPass.status).toBe('pass');

    fs.appendFileSync(path.join(tmp, 'src', 'commented.ts'), '\nexport function authenticateUser() {}\n');
    const [symPass] = svc.evaluateCriteria(task, [
      { id: 'c', type: 'symbol_exists', description: 'd', target: 'authenticateUser', phase: 'phase1', status: 'unknown' }
    ]);
    expect(symPass.status).toBe('pass');
  });

  it('symbol_exists ignores mentions inside markdown HTML comments', async () => {
    fs.writeFileSync(
      path.join(tmp, 'notes.md'),
      '<!-- planned: SpecialFeatureFlag -->\nNothing else here.'
    );
    const task: ProjectTask = { id: 't', title: 'x', status: 'todo' };

    const [symFail] = svc.evaluateCriteria(task, [
      { id: 'c', type: 'symbol_exists', description: 'd', target: 'SpecialFeatureFlag', phase: 'phase1', status: 'unknown' }
    ]);
    expect(symFail.status).toBe('fail');
  });

  it('symbol_exists strips comments and strings across indexed language families', () => {
    const fixtures: Record<string, string> = {
      'sample.json': '{"note":"GhostSymbol"}',
      'sample.txt': '"GhostSymbol"',
      'sample.css': '/* GhostSymbol */ .x { content: "GhostSymbol"; }',
      'sample.scss': '// GhostSymbol\n.x { content: "GhostSymbol"; }',
      'sample.html': '<!-- GhostSymbol --><div title="GhostSymbol"></div>',
      'sample.yml': '# GhostSymbol\nnote: "GhostSymbol"',
      'sample.yaml': '# GhostSymbol\nnote: "GhostSymbol"',
      'sample.py': '# GhostSymbol\nmsg = "GhostSymbol"',
      'sample.go': '// GhostSymbol\nvar msg = "GhostSymbol"',
      'sample.rs': '// GhostSymbol\nlet msg = "GhostSymbol";',
      'sample.java': '// GhostSymbol\nString msg = "GhostSymbol";',
      'sample.cs': '// GhostSymbol\nvar msg = "GhostSymbol";',
      'sample.php': '<?php // GhostSymbol\n$msg = "GhostSymbol";',
      'sample.rb': '# GhostSymbol\nmsg = "GhostSymbol"',
      'sample.sql': '-- GhostSymbol\nSELECT "GhostSymbol";',
      'sample.sh': '# GhostSymbol\nmsg="GhostSymbol"',
      'sample.ps1': '# GhostSymbol\n$msg = "GhostSymbol"',
    };
    for (const [name, content] of Object.entries(fixtures)) {
      fs.writeFileSync(path.join(tmp, name), content);
    }

    const task: ProjectTask = { id: 't', title: 'x', status: 'todo' };
    const [result] = svc.evaluateCriteria(task, [
      { id: 'c', type: 'symbol_exists', description: 'd', target: 'GhostSymbol', phase: 'phase1', status: 'unknown' }
    ]);
    expect(result.status).toBe('fail');
  });
});

describe('PlanningV2Service.evaluateCriteria workspace scoping', () => {
  it('does not treat a sibling directory sharing a name prefix as inside the workspace', async () => {
    const siblingRoot = path.dirname(tmp);
    const evilSibling = path.join(siblingRoot, `${path.basename(tmp)}-evil`);
    fs.mkdirSync(evilSibling, { recursive: true });
    fs.writeFileSync(path.join(evilSibling, 'secret.ts'), 'export const SecretSymbol = 1;');

    try {
      const relativeEscape = path.relative(tmp, evilSibling);
      const task: ProjectTask = { id: 't', title: 'x', status: 'todo', workspace: relativeEscape };

      const [symFail] = svc.evaluateCriteria(task, [
        { id: 'c', type: 'symbol_exists', description: 'd', target: 'SecretSymbol', phase: 'phase1', status: 'unknown' }
      ]);
      // Falls back to the real workspace root, which doesn't contain SecretSymbol.
      expect(symFail.status).toBe('fail');
    } finally {
      fs.rmSync(evilSibling, { recursive: true, force: true });
    }
  });

  it('does not accept an absolute path outside the workspace as a scoping root', async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv2-outside-'));
    fs.writeFileSync(path.join(outsideDir, 'outside.ts'), 'export const OutsideSymbol = 1;');

    try {
      const task: ProjectTask = { id: 't', title: 'x', status: 'todo', workspace: outsideDir };

      const [symFail] = svc.evaluateCriteria(task, [
        { id: 'c', type: 'symbol_exists', description: 'd', target: 'OutsideSymbol', phase: 'phase1', status: 'unknown' }
      ]);
      expect(symFail.status).toBe('fail');
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('rejects an in-root symlink or junction that resolves outside the workspace', () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv2-symlink-outside-'));
    const linkPath = path.join(tmp, 'linked-workspace');
    fs.writeFileSync(path.join(outsideDir, 'outside.ts'), 'export const SymlinkEscapeSymbol = 1;');

    try {
      fs.symlinkSync(outsideDir, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
      const task: ProjectTask = { id: 't', title: 'x', status: 'todo', workspace: 'linked-workspace' };
      const [result] = svc.evaluateCriteria(task, [
        { id: 'c', type: 'symbol_exists', description: 'd', target: 'SymlinkEscapeSymbol', phase: 'phase1', status: 'unknown' }
      ]);
      expect(result.status).toBe('fail');
    } finally {
      fs.rmSync(linkPath, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});

describe('PlanningV2Service.bootstrapEvaluate', () => {
  it('flags only items whose structural criteria all pass and stores a trace', async () => {
    fs.writeFileSync(path.join(tmp, 'exists.ts'), 'ok');
    await seed([
      { id: 'task_bare', title: 'No criteria yet', status: 'todo' },
      { id: 'task_struct', title: 'Has passing file', status: 'todo', acceptanceCriteria: [
        { id: 'c1', type: 'file_exists', description: 'd', target: 'exists.ts', phase: 'phase2', status: 'unknown' }
      ] }
    ]);

    const result = await svc.bootstrapEvaluate(); // no client → deterministic criteria gen
    expect(result.evaluated).toBe(2);
    expect(result.likelyComplete.map(x => x.taskId)).toEqual(['task_struct']);

    const struct = await getTask('task_struct');
    expect(struct.bootstrapLikelyComplete).toBe(true);
    const bare = await getTask('task_bare');
    expect(bare.bootstrapLikelyComplete).toBe(false);

    expect(svc.listTraces('task_struct').length).toBeGreaterThan(0);
  });
});
