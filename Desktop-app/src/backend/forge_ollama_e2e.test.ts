import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentOrchestrator } from './agents';
import { WorkspaceSandbox } from './tools';
import { OllamaClient } from './ollama';
import { PlanningV2Service } from './planningV2';
import { ChatDatabase } from './db';
import type { ChatSession, ProjectTask } from './db';

// Real-model end-to-end test for the FORGE "money path": a plan item is
// handed to an Ollama-backed agent, the agent edits a real file in a
// sandboxed workspace, acceptance criteria evaluate against the result, and
// an execution trace is written to .kryleos/traces/.
//
// Gated behind OLLAMA_E2E=1 so normal `npm test` runs (and the cross-platform
// CI matrix) stay fast and network-free. The dedicated `ollama-e2e` CI job
// sets the env var, installs Ollama, pulls OLLAMA_E2E_MODEL, and runs this
// file on its own.
const RUN = process.env.OLLAMA_E2E === '1';
const MODEL = process.env.OLLAMA_E2E_MODEL || 'qwen2.5-coder:0.5b';

let tmp: string;
let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-ollama-e2e-'));
  process.chdir(tmp);
});

afterEach(() => {
  process.chdir(prevCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe.runIf(RUN)('Forge Ollama end-to-end (money path)', () => {
  it('plan item -> agent edits a real file -> criteria evaluate -> trace written', async () => {
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'src', 'greeting.ts'), '// TODO: implement greetUser\n', 'utf-8');

    const sandbox = new WorkspaceSandbox(tmp);
    const client = new OllamaClient({ model: MODEL });
    const orchestrator = new AgentOrchestrator(sandbox, client, () => {});
    orchestrator.setLocalModel(true);
    orchestrator.setResponseMode('minimal_context');

    await orchestrator.handleUserQuery(
      'Use the writeFile tool to overwrite "src/greeting.ts" so it contains a single exported ' +
      'TypeScript function named exactly `greetUser` that takes a `name: string` parameter and ' +
      'returns a greeting string. Then respond.'
    );

    const updated = fs.readFileSync(path.join(tmp, 'src', 'greeting.ts'), 'utf-8');
    expect(updated).toMatch(/greetUser/);

    const task: ProjectTask = {
      id: 'forge-e2e-task',
      title: 'Add a greetUser function',
      status: 'in_progress',
      category: 'backend',
      acceptanceCriteria: [
        {
          id: 'crit-greet',
          type: 'symbol_exists',
          description: 'A greetUser function exists',
          target: 'greetUser',
          phase: 'phase1'
        }
      ]
    };

    const session: ChatSession = {
      id: 'flow_board',
      title: 'FLOW Board',
      createdAt: new Date().toISOString(),
      logs: [],
      checklist: [],
      space: 'project',
      tasks: [task]
    };

    const db = new ChatDatabase();
    await db.saveSession(session);

    const svc = new PlanningV2Service(db, tmp);
    const results = svc.evaluateCriteria(task, task.acceptanceCriteria!);
    expect(results.find(r => r.criterionId === 'crit-greet')?.status).toBe('pass');

    const trace = await svc.saveTrace({
      planItemId: 'forge-e2e-task',
      summary: 'Ollama agent added greetUser to src/greeting.ts'
    });
    expect(trace.criteriaResults.find(r => r.criterionId === 'crit-greet')?.status).toBe('pass');

    const traceFiles = fs.readdirSync(path.join(tmp, '.kryleos', 'traces'));
    expect(traceFiles.length).toBeGreaterThan(0);
  }, 600_000);
});
