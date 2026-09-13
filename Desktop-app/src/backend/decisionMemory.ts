import * as fs from 'fs';
import * as path from 'path';

export const DECISIONS_RELATIVE_PATH = path.join('.kryleos', 'decisions.md');

export interface DecisionEntry {
  taskId?: string;
  taskTitle?: string;
  decision: string;
  rationale?: string;
  category?: string;
  date?: string;
}

export function getDecisionsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, DECISIONS_RELATIVE_PATH);
}

/**
 * Loads decision memory from `.kryleos/decisions.md` synchronously.
 * Safe for use in synchronous prompt builders.
 */
export function loadDecisionsSync(workspaceRoot: string): string {
  try {
    const filePath = getDecisionsPath(workspaceRoot);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch {
    // ignore read errors
  }
  return '';
}

/**
 * Loads decision memory from `.kryleos/decisions.md` asynchronously.
 */
export async function loadDecisions(workspaceRoot: string): Promise<string> {
  return loadDecisionsSync(workspaceRoot);
}

/**
 * Appends a decision entry to `.kryleos/decisions.md`.
 * Creates the directory and initial file header if not already present.
 */
export function recordDecisionSync(workspaceRoot: string, entry: DecisionEntry): void {
  const filePath = getDecisionsPath(workspaceRoot);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const dateStr = entry.date || new Date().toISOString().split('T')[0];
  const cardId = entry.taskId ? `[${entry.taskId}] ` : '';
  const cleanDecision = entry.decision.trim().replace(/\r?\n+/g, ' ');
  const rationaleStr = entry.rationale ? ` — Rationale: ${entry.rationale.trim().replace(/\r?\n+/g, ' ')}` : '';
  const line = `- [${dateStr}] ${cardId}${cleanDecision}${rationaleStr}\n`;

  if (!fs.existsSync(filePath)) {
    const header = `# Architectural Decisions Log\n<!-- Append-only cross-card decision memory. Maintained by CREW and Forge agents. -->\n\n`;
    fs.writeFileSync(filePath, header + line, 'utf-8');
  } else {
    fs.appendFileSync(filePath, line, 'utf-8');
  }
}

/**
 * Async version of recordDecisionSync.
 */
export async function recordDecision(workspaceRoot: string, entry: DecisionEntry): Promise<void> {
  recordDecisionSync(workspaceRoot, entry);
}

/**
 * Formats decision memory for prompt context injection.
 */
export function formatDecisionsForPrompt(decisionsContent: string): string {
  const trimmed = decisionsContent.trim();
  if (!trimmed) return '';
  return `\n--- Architectural Decisions (.kryleos/decisions.md) ---\n${trimmed}\n--- End architectural decisions ---`;
}

/**
 * Parses decision lines from agent review findings or text responses.
 * Matches lines like:
 * - DECISION: chose JWT for auth
 * - ARCHITECTURAL DECISION: used SQLite for local cache
 */
export function parseDecisionsFromReview(text: string): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  const decisions: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(/^(?:[-*]\s*)?(?:ARCHITECTURAL[\s_-]DECISION|DECISION):\s*(.+)$/i);
    if (match && match[1]) {
      const parsed = match[1].trim();
      if (parsed && !decisions.includes(parsed)) {
        decisions.push(parsed);
      }
    }
  }

  return decisions;
}
