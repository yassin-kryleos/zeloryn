// Claude Code CLI integration: runs plan items through `claude` as a
// subprocess instead of the built-in Forge orchestrator.
//
// Usage modes (tried in order):
//   1) JSON mode (v2.1+) -- `--output-format json --bare` — structured output
//   2) Print mode (v0.33+) -- `--print` — one-shot non-interactive Q&A
//   3) Stdin fallback -- pipe prompt on stdin, capture stdout
//
// Binary discovery: KRYLEOS_CLAUDE_CODE_PATH env var, then PATH search.
// Capability is probed via `claude --version` before mode selection.

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ClaudeCodeToolUse {
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ClaudeCodeResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  /** true if `--print` mode was used (cleaner output to parse) */
  usedPrintMode: boolean;
  /** true if JSON output mode was used (structured, version-detected) */
  usedJsonMode: boolean;
  /** Parsed text response (JSON mode extracts from tool_use blocks). */
  textResponse: string;
  /** Extracted tool use blocks (JSON mode only). */
  toolUses: ClaudeCodeToolUse[];
}

export interface ClaudeCodeRunnerOptions {
  queryText: string;
  workspaceRoot: string;
  planItemId?: string;
  timeoutMs?: number;
}

// ── Capability detection ──────────────────────────────────────────────────

export interface ClaudeCodeCapabilities {
  version: string;
  supportsJsonMode: boolean;
  supportsBare: boolean;
}

/** Minimum version for JSON output mode support. */
const MIN_JSON_MODE_VERSION = '2.1.0';

/**
 * Probe the installed Claude Code CLI for version + capabilities.
 * Returns null if the binary cannot be found or the version parse fails.
 */
export async function probeClaudeCapabilities(
  binaryPath: string,
): Promise<ClaudeCodeCapabilities | null> {
  try {
    const { stdout } = await execFileSimple(binaryPath, ['--version'], { timeout: 5000 });
    const raw = stdout?.trim() || '';
    // Parse "Claude Code CLI v2.1.128" or just "2.1.128"
    const match = raw.match(/(\d+\.\d+\.\d+)/);
    if (!match) {
      // Version string present but unparseable — assume basic --print only.
      return { version: raw, supportsJsonMode: false, supportsBare: false };
    }
    const version = match[1];
    const semver = version.split('.').map(Number);
    const minSemver = MIN_JSON_MODE_VERSION.split('.').map(Number);
    const supportsJsonMode =
      semver[0] > minSemver[0] ||
      (semver[0] === minSemver[0] && semver[1] > minSemver[1]) ||
      (semver[0] === minSemver[0] && semver[1] === minSemver[1] && semver[2] >= minSemver[2]);
    const supportsBare = supportsJsonMode; // --bare ships alongside --output-format
    return { version, supportsJsonMode, supportsBare };
  } catch {
    return null;
  }
}

// ── Binary discovery ─────────────────────────────────────────────────────────
export function findClaudeCodeBinary(): string | null {
  const envPath = process.env.KRYLEOS_CLAUDE_CODE_PATH?.trim();
  if (envPath && fs.existsSync(envPath)) return envPath;

  const pathDirs = (process.env.PATH || '').split(path.delimiter);
  const candidates = os.platform() === 'win32' ? ['claude.cmd', 'claude.exe', 'claude'] : ['claude'];
  for (const dir of pathDirs) {
    for (const name of candidates) {
      const full = path.join(dir, name);
      try {
        if (fs.existsSync(full)) return full;
      } catch { /* permission or missing dir */ }
    }
  }
  return null;
}

// ── Prompt construction ──────────────────────────────────────────────────────
export function buildClaudePrompt(queryText: string, workspaceRoot: string, planItemId?: string): string {
  const parts: string[] = [];
  parts.push(`You are working in workspace: ${workspaceRoot}`);

  const claudeMdPath = path.join(workspaceRoot, 'CLAUDE.md');
  try {
    if (fs.existsSync(claudeMdPath)) {
      parts.push(`\n--- Workspace instructions (CLAUDE.md) ---\n${fs.readFileSync(claudeMdPath, 'utf-8')}\n--- End workspace instructions ---`);
    }
  } catch { /* ignore */ }

  if (planItemId) {
    parts.push(`\nPlan item ID: ${planItemId}`);
  }

  parts.push(`\n--- Task ---\n${queryText}\n--- End task ---`);
  parts.push('\nExecute this task against the workspace. Report what you changed, what commands you ran, and the results.');

  return parts.join('\n');
}

// ── Runner ───────────────────────────────────────────────────────────────────

const ALLOWED_ENV_KEYS = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'USER', 'USERNAME',
  'SHELL', 'LANG', 'LC_ALL', 'TERM', 'TERMINFO', 'TMPDIR', 'TEMP', 'TMP',
  'PWD', 'CLICOLOR', 'FORCE_COLOR', 'PIP_NO_INPUT', 'NPM_CONFIG_LOGLEVEL',
  'EDITOR', 'VISUAL',
]);

export function sanitizeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ALLOWED_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  return env;
}

/**
 * Best-effort parse of JSON output from Claude Code CLI.
 * The JSON format emits an array of message objects with tool_use content blocks.
 * We extract text content and tool calls, leaving raw stdout for callers that
 * need the full original output.
 */
export function tryParseJsonOutput(stdout: string): {
  textResponse: string;
  toolUses: ClaudeCodeToolUse[];
} {
  const result: { textResponse: string; toolUses: ClaudeCodeToolUse[] } = {
    textResponse: '',
    toolUses: [],
  };

  try {
    // The JSON output is either a JSON array of messages or a JSON object with
    // a messages field. Try both.
    const parsed = JSON.parse(stdout.trim());

    const messages: any[] = Array.isArray(parsed)
      ? parsed
      : (parsed.messages ?? (parsed.output ? [parsed] : []));

    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;

      if (typeof msg.content === 'string') {
        result.textResponse += msg.content + '\n';
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            result.textResponse += block.text + '\n';
          } else if (block.type === 'tool_use' || block.type === 'tool_result') {
            const toolBlock = block as { id?: string; name?: string; input?: Record<string, any> };
            if (toolBlock.name) {
              result.toolUses.push({
                id: toolBlock.id || '',
                name: toolBlock.name,
                input: toolBlock.input || {},
              });
            }
          }
        }
      }
    }
  } catch {
    // Not valid JSON — leave defaults (empty strings, empty arrays).
  }

  return result;
}

export async function claudeCodeRun(opts: ClaudeCodeRunnerOptions): Promise<ClaudeCodeResult> {
  const claudePath = findClaudeCodeBinary();
  if (!claudePath) {
    throw new Error(
      'Claude Code CLI not found. Install it, ensure `claude` is on your PATH, ' +
      'or set the KRYLEOS_CLAUDE_CODE_PATH environment variable to the full binary path.'
    );
  }

  const prompt = buildClaudePrompt(opts.queryText, opts.workspaceRoot, opts.planItemId);
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const maxBuffer = 10 * 1024 * 1024;
  const sanitized = sanitizeEnv();
  const startTime = Date.now();

  // Phase 1: try JSON mode (--output-format json --bare) for structured output.
  const capabilities = await probeClaudeCapabilities(claudePath);
  if (capabilities?.supportsJsonMode) {
    try {
      const printArgs = ['--print', prompt, '--output-format', 'json'];
      if (capabilities.supportsBare) printArgs.push('--bare');

      const result = await execFilePromise(claudePath, printArgs, {
        cwd: opts.workspaceRoot,
        timeout: timeoutMs,
        maxBuffer,
        env: { ...sanitized },
      });

      const parsed = result.stdout ? tryParseJsonOutput(result.stdout) : { textResponse: '', toolUses: [] };

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: Date.now() - startTime,
        usedPrintMode: true,
        usedJsonMode: true,
        textResponse: parsed.textResponse,
        toolUses: parsed.toolUses,
      };
    } catch {
      // JSON mode failed — fall through to --print mode below.
    }
  }

  // Phase 2: try --print mode (v0.33+).
  try {
    const result = await execFilePromise(claudePath, ['--print', prompt], {
      cwd: opts.workspaceRoot,
      timeout: timeoutMs,
      maxBuffer,
      env: { ...sanitized },
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: Date.now() - startTime,
      usedPrintMode: true,
      usedJsonMode: false,
      textResponse: result.stdout?.trim() || '',
      toolUses: [],
    };
  } catch {
    // --print may not be supported in older versions. Fall through.
  }

  // Phase 3: stdin pipe fallback (oldest method).
  const result = await execFilePromise(claudePath, [], {
    cwd: opts.workspaceRoot,
    timeout: timeoutMs,
    maxBuffer,
    input: prompt,
    env: { ...sanitized, CLAUDE_CODE_HEADLESS: '1' },
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: Date.now() - startTime,
    usedPrintMode: false,
    usedJsonMode: false,
    textResponse: result.stdout?.trim() || '',
    toolUses: [],
  };
}

// ── Helper: promisified execFile ─────────────────────────────────────────────
interface ExecFileResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

function execFilePromise(
  file: string,
  args: string[],
  opts: {
    cwd: string;
    timeout: number;
    maxBuffer: number;
    input?: string;
    env: NodeJS.ProcessEnv;
  },
): Promise<ExecFileResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, {
      cwd: opts.cwd,
      timeout: opts.timeout,
      maxBuffer: opts.maxBuffer,
      input: opts.input,
      env: opts.env as any,
    } as any, (error: any, stdout: string, stderr: string) => {
      if (error && error.code === 'ETIMEDOUT') {
        reject(new Error(`Claude Code CLI timed out after ${opts.timeout}ms`));
        return;
      }
      resolve({
        stdout,
        stderr,
        exitCode: error?.code ?? 0,
      });
    });
  });
}

/** Lightweight execFile wrapper without the extra interface indirection. */
function execFileSimple(
  file: string,
  args: string[],
  opts: { timeout: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: opts.timeout }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: stdout || '', stderr: stderr || '' });
    });
  });
}
