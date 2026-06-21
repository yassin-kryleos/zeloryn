// Claude Code CLI integration: runs plan items through `claude` as a
// subprocess instead of the built-in Forge orchestrator.
//
// Usage modes:
//   1) `--print` flag (Claude Code v0.33+): one-shot non-interactive Q&A
//   2) stdin pipe fallback: pipe prompt on stdin, capture stdout
//
// The binary is discovered via PATH, CLAUDE_CODE_PATH env var, or a user-
// configured setting (Desktop-app settings → KRYLEOS_CLAUDE_CODE_PATH).
// Output is parsed into a ClaudeCodeResult suitable for building an
// ExecutionTrace.

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ClaudeCodeResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  /** true if `--print` mode was used (cleaner output to parse) */
  usedPrintMode: boolean;
}

export interface ClaudeCodeRunnerOptions {
  queryText: string;
  workspaceRoot: string;
  planItemId?: string;
  timeoutMs?: number;
}

// ── Binary discovery ─────────────────────────────────────────────────────────
export function findClaudeCodeBinary(): string | null {
  const envPath = process.env.KRYLEOS_CLAUDE_CODE_PATH?.trim();
  if (envPath && fs.existsSync(envPath)) return envPath;

  // Search PATH for `claude` binary
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
function buildClaudePrompt(queryText: string, workspaceRoot: string, planItemId?: string): string {
  const parts: string[] = [];
  parts.push(`You are working in workspace: ${workspaceRoot}`);

  // Include CLAUDE.md if it exists
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

/** Whitelist of env keys safe to pass to the Claude Code subprocess.
 *  Anything sensitive (API keys, DB URLs, KRYLEOS_ secrets) is excluded. */
const ALLOWED_ENV_KEYS = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'USER', 'USERNAME',
  'SHELL', 'LANG', 'LC_ALL', 'TERM', 'TERMINFO', 'TMPDIR', 'TEMP', 'TMP',
  'PWD', 'CLICOLOR', 'FORCE_COLOR', 'PIP_NO_INPUT', 'NPM_CONFIG_LOGLEVEL',
  'EDITOR', 'VISUAL',
]);

function sanitizeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ALLOWED_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  return env;
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
  let usedPrintMode = false;

  const startTime = Date.now();

  try {
    const result = await execFilePromise(claudePath, ['--print', prompt], {
      cwd: opts.workspaceRoot,
      timeout: timeoutMs,
      maxBuffer,
      env: { ...sanitizeEnv() },
    });
    usedPrintMode = true;
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: Date.now() - startTime,
      usedPrintMode,
    };
  } catch (printErr: any) {
    // --print may not be supported in older versions. Fall back to stdin.
    const result = await execFilePromise(claudePath, [], {
      cwd: opts.workspaceRoot,
      timeout: timeoutMs,
      maxBuffer,
      input: prompt,
      env: { ...sanitizeEnv(), CLAUDE_CODE_HEADLESS: '1' },
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: Date.now() - startTime,
      usedPrintMode: false,
    };
  }
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
    }, (error, stdout, stderr) => {
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
