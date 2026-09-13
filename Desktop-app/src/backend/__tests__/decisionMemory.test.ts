import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadDecisionsSync,
  loadDecisions,
  recordDecisionSync,
  recordDecision,
  formatDecisionsForPrompt,
  parseDecisionsFromReview,
  getDecisionsPath
} from '../decisionMemory';
import { ClaudeCodeRunner, CodexCliRunner } from '../cliAgentRunner';

describe('Decision Memory (Phase 9a)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-decision-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('returns empty string if decisions.md does not exist', async () => {
    expect(loadDecisionsSync(tmpDir)).toBe('');
    expect(await loadDecisions(tmpDir)).toBe('');
  });

  it('records decisions and creates .kryleos/decisions.md with header', () => {
    recordDecisionSync(tmpDir, {
      taskId: 'card-001',
      decision: 'Chose SQLite over PostgreSQL for local embedded state',
      rationale: 'Zero configuration and self-contained single-user desktop workflow'
    });

    const content = loadDecisionsSync(tmpDir);
    expect(content).toContain('# Architectural Decisions Log');
    expect(content).toContain('[card-001]');
    expect(content).toContain('Chose SQLite over PostgreSQL');
    expect(content).toContain('Rationale: Zero configuration');
    expect(fs.existsSync(getDecisionsPath(tmpDir))).toBe(true);
  });

  it('appends multiple decisions incrementally in append-only fashion', async () => {
    await recordDecision(tmpDir, {
      taskId: 'card-auth',
      decision: 'Use JWT tokens in httpOnly cookies'
    });
    await recordDecision(tmpDir, {
      taskId: 'card-ui',
      decision: 'Tailwind CSS for zero-runtime styling'
    });

    const content = await loadDecisions(tmpDir);
    const lines = content.split('\n').filter(l => l.startsWith('- ['));
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain('card-auth');
    expect(lines[1]).toContain('card-ui');
  });

  it('formats decisions cleanly for prompt injection', () => {
    expect(formatDecisionsForPrompt('')).toBe('');
    expect(formatDecisionsForPrompt('   ')).toBe('');

    const formatted = formatDecisionsForPrompt('- [2026-09-13] [card-1] Chose JWT');
    expect(formatted).toContain('--- Architectural Decisions (.kryleos/decisions.md) ---');
    expect(formatted).toContain('- [2026-09-13] [card-1] Chose JWT');
    expect(formatted).toContain('--- End architectural decisions ---');
  });

  it('parses DECISION lines from review findings', () => {
    const reviewText = `
VERDICT: PASS
FINDINGS:
Code satisfies all requirements.
DECISION: Use AES-GCM-256 for local token encryption
ARCHITECTURAL DECISION: Restrict sandbox file system to workspace root only
All unit tests passed.
`;
    const parsed = parseDecisionsFromReview(reviewText);
    expect(parsed).toEqual([
      'Use AES-GCM-256 for local token encryption',
      'Restrict sandbox file system to workspace root only'
    ]);
  });

  it('injects decision memory into ClaudeCodeRunner.buildPrompt and CodexCliRunner.buildPrompt', () => {
    recordDecisionSync(tmpDir, {
      taskId: 'card-db',
      decision: 'Use SQLite WAL mode for concurrency'
    });

    const claudeRunner = new ClaudeCodeRunner();
    const claudePrompt = claudeRunner.buildPrompt('Implement user login', tmpDir, 'card-login');
    expect(claudePrompt).toContain('--- Architectural Decisions (.kryleos/decisions.md) ---');
    expect(claudePrompt).toContain('Use SQLite WAL mode for concurrency');

    const codexRunner = new CodexCliRunner();
    const codexPrompt = codexRunner.buildPrompt('Implement user login', tmpDir, 'card-login');
    expect(codexPrompt).toContain('--- Architectural Decisions (.kryleos/decisions.md) ---');
    expect(codexPrompt).toContain('Use SQLite WAL mode for concurrency');
  });
});
