// Tier 2 External Handoff Engine: Generates structured task/spec bundles
// and triggers OS-level application launches (Cursor, Antigravity, VS Code,
// Windsurf, Clipboard).
//
// Hard Safety Constraint:
// Forge does NOT drive external tools programmatically or automate their agents.
// It generates `.kryleos/handoff/<card-id>.md` and launches the application
// or copies to clipboard, leaving full execution to the user's authenticated session.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { sanitizeTaskId } from './tools';

export interface HandoffTarget {
  id: string;
  name: string;
  tier: 2;
  binaryName?: string;
  description: string;
  launchCommandTemplate?: string;
  manualOnly?: boolean;
}

export interface CardHandoffPayload {
  taskId: string;
  taskTitle: string;
  taskCategory?: string;
  taskAssignee?: string;
  taskStatus?: string;
  description?: string;
  acceptanceCriteria?: Array<string | { description?: string; rule?: string }>;
  workspaceRoot: string;
  targetAppId: string;
}

export interface HandoffResult {
  success: boolean;
  target: HandoffTarget;
  handoffFilePath: string;
  bundleContent: string;
  launched: boolean;
  launchCommand?: string;
  instructions: string;
  error?: string;
}

export const TIER_2_HANDOFF_TARGETS: HandoffTarget[] = [
  {
    id: 'cursor',
    name: 'Cursor',
    tier: 2,
    binaryName: 'cursor',
    description: 'Opens workspace in Cursor. Forge generates the spec bundle and lets you execute inside your Cursor session.',
    launchCommandTemplate: 'cursor "{folder}"',
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    tier: 2,
    binaryName: 'antigravity',
    description: 'Opens workspace in Antigravity. Forge generates the spec bundle and lets you execute inside your Antigravity session.',
    launchCommandTemplate: 'antigravity "{folder}"',
  },
  {
    id: 'vscode',
    name: 'VS Code',
    tier: 2,
    binaryName: 'code',
    description: 'Opens workspace in Visual Studio Code with the handoff specification.',
    launchCommandTemplate: 'code "{folder}"',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    tier: 2,
    binaryName: 'windsurf',
    description: 'Opens workspace in Windsurf editor.',
    launchCommandTemplate: 'windsurf "{folder}"',
  },
  {
    id: 'clipboard',
    name: 'Copy to Clipboard',
    tier: 2,
    description: 'Copies formatted handoff specification to clipboard for manual pasting into any desktop AI tool.',
    manualOnly: true,
  },
];

export class HandoffRegistry {
  get(id: string): HandoffTarget | undefined {
    return TIER_2_HANDOFF_TARGETS.find(t => t.id === id);
  }

  list(): Array<HandoffTarget & { installed: boolean }> {
    return TIER_2_HANDOFF_TARGETS.map(target => ({
      ...target,
      installed: target.manualOnly ? true : !!this.findBinary(target.binaryName),
    }));
  }

  findBinary(binaryName?: string): string | null {
    if (!binaryName) return null;
    const dirs = [...(process.env.PATH || '').split(path.delimiter), path.join(os.homedir(), '.local', 'bin')];
    const exts = os.platform() === 'win32' ? ['.cmd', '.exe', ''] : [''];
    for (const dir of dirs) {
      for (const ext of exts) {
        const full = path.join(dir, `${binaryName}${ext}`);
        if (fs.existsSync(full)) return full;
      }
    }
    return null;
  }
}

export const handoffRegistry = new HandoffRegistry();

/** Formats a structured Markdown handoff bundle for a card */
export function generateHandoffBundle(payload: CardHandoffPayload, target: HandoffTarget): string {
  const parts: string[] = [];
  parts.push(`# Task Specification: ${payload.taskTitle}`);
  parts.push('');
  parts.push(`- **Card ID**: \`${payload.taskId}\``);
  parts.push(`- **Category**: ${payload.taskCategory || 'general'}`);
  parts.push(`- **Assignee**: ${payload.taskAssignee || 'Builder'}`);
  parts.push(`- **Status**: ${payload.taskStatus || 'todo'}`);
  parts.push(`- **Workspace**: \`${payload.workspaceRoot}\``);
  parts.push(`- **Generated at**: ${new Date().toISOString()}`);
  parts.push(`- **Handoff Target**: ${target.name} (Tier 2 External Handoff)`);
  parts.push('');
  parts.push('---');
  parts.push('');
  parts.push('## Task Objective');
  parts.push(payload.description || payload.taskTitle);
  parts.push('');

  // Acceptance Criteria
  parts.push('## Acceptance Criteria');
  if (payload.acceptanceCriteria && payload.acceptanceCriteria.length > 0) {
    for (const crit of payload.acceptanceCriteria) {
      const text = typeof crit === 'string' ? crit : (crit.description || crit.rule || 'Criterion');
      parts.push(`- [ ] ${text}`);
    }
  } else {
    parts.push('- [ ] Complete task objectives and verify functionality.');
  }
  parts.push('');

  // Workspace instructions if available
  const candidateDocs = ['CLAUDE.md', 'AGENTS.md', 'CODEX.md'];
  let foundDoc = false;
  for (const doc of candidateDocs) {
    const full = path.join(payload.workspaceRoot, doc);
    try {
      if (fs.existsSync(full)) {
        const content = fs.readFileSync(full, 'utf-8').trim();
        if (content) {
          parts.push(`## Workspace Context (${doc})`);
          parts.push('```markdown');
          parts.push(content);
          parts.push('```');
          parts.push('');
          foundDoc = true;
          break;
        }
      }
    } catch { /* skip */ }
  }

  // Guidelines for external tool
  parts.push('## Instructions for External Agent');
  parts.push(`1. Review the task objective and acceptance criteria above.`);
  parts.push(`2. Implement the required modifications directly in \`${payload.workspaceRoot}\`.`);
  parts.push(`3. Run test suites and verify all acceptance criteria pass.`);
  parts.push(`4. Return to Zeloryn and move this card to DONE once finished.`);

  return parts.join('\n');
}

/** Saves the handoff bundle to `.kryleos/handoff/<card-id>.md` and launches target app if available */
export async function executeHandoff(payload: CardHandoffPayload): Promise<HandoffResult> {
  const target = handoffRegistry.get(payload.targetAppId) || handoffRegistry.get('clipboard')!;
  const bundleContent = generateHandoffBundle(payload, target);

  // Write bundle to .kryleos/handoff/<safeTaskId>.md
  const handoffDir = path.join(payload.workspaceRoot, '.kryleos', 'handoff');
  fs.mkdirSync(handoffDir, { recursive: true });

  const safeTaskId = sanitizeTaskId(payload.taskId);
  const handoffFilePath = path.join(handoffDir, `${safeTaskId}.md`);
  fs.writeFileSync(handoffFilePath, bundleContent, 'utf-8');

  // Launch app if available
  let launched = false;
  let launchCommand: string | undefined;
  let launchError: string | undefined;

  if (!target.manualOnly && target.binaryName) {
    const bin = handoffRegistry.findBinary(target.binaryName);
    if (bin) {
      try {
        const child = spawn(bin, [payload.workspaceRoot], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        launched = true;
        launchCommand = `${bin} "${payload.workspaceRoot}"`;
      } catch (err: any) {
        launchError = err.message;
      }
    } else {
      launchError = `Binary '${target.binaryName}' not found on PATH.`;
    }
  }

  const instructions = launched
    ? `Handoff bundle written to ${path.relative(payload.workspaceRoot, handoffFilePath)} and launched ${target.name}. Finish execution in your ${target.name} session.`
    : `Handoff bundle written to ${path.relative(payload.workspaceRoot, handoffFilePath)}. Open ${target.name} and paste or review the specification.`;

  return {
    success: true,
    target,
    handoffFilePath,
    bundleContent,
    launched,
    launchCommand,
    instructions,
    error: launchError,
  };
}
