// CliAgentRunner: Unified, pluggable interface for terminal-capable AI coding agents.
// Allows Claude Code, Codex CLI, Gemini CLI, Aider, and future agent CLIs to register
// and execute through a standardized runner interface with live PTY streaming and
// command approval safety gates.

import { execFile, execSync, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { TerminalManager, TerminalSession } from './terminalManager';
import { WebSocket } from 'ws';
import { loadDecisionsSync, formatDecisionsForPrompt } from './decisionMemory';

// ── Types and Contracts ───────────────────────────────────────────────────

export interface CliAgentToolUse {
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface CliAgentCapabilities {
  version: string;
  supportsJsonMode: boolean;
  supportsBare: boolean;
  supportsStreaming: boolean;
  supportsPty: boolean;
}

export interface CliAgentProbeOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  onSpawn?: (child: ChildProcess) => void;
}

export interface CliAgentRunOptions {
  queryText: string;
  workspaceRoot: string;
  planItemId?: string;
  timeoutMs?: number;
  /** Optional callback invoked for each live output chunk (stdout/pty) */
  onOutput?: (chunk: string, isStderr?: boolean) => void;
  /** Optional callback invoked when a tool call is detected */
  onToolUse?: (toolUse: CliAgentToolUse) => void;
  /** Environment variable overrides */
  env?: NodeJS.ProcessEnv;
  /** Optional associated session ID */
  sessionId?: string;
}

export interface CliAgentResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  usedPrintMode?: boolean;
  usedJsonMode?: boolean;
  textResponse: string;
  toolUses: CliAgentToolUse[];
}

export interface CliAgentRunner {
  readonly id: string;
  readonly name: string;
  readonly binaryName: string;

  /** Discover the agent binary path on the local system */
  findBinary(): string | null;

  /** Probe the installed binary for capabilities and version */
  probeCapabilities(
    binaryPath?: string,
    opts?: CliAgentProbeOptions
  ): Promise<CliAgentCapabilities | null>;

  /** Execute a task in buffered mode */
  run(options: CliAgentRunOptions): Promise<CliAgentResult>;

  /** Execute a task live inside a terminalManager PTY session */
  runPty?(
    options: CliAgentRunOptions,
    terminalManager: TerminalManager,
    ws?: WebSocket
  ): Promise<CliAgentResult>;
}

// ── Environment Sanitization ───────────────────────────────────────────────

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

// ── Claude Code Implementation ─────────────────────────────────────────────

const MIN_JSON_MODE_VERSION = '2.1.0';

export class ClaudeCodeRunner implements CliAgentRunner {
  readonly id = 'claude-code';
  readonly name = 'Claude Code';
  readonly binaryName = 'claude';

  findBinary(): string | null {
    const envPath = process.env.KRYLEOS_CLAUDE_CODE_PATH?.trim();
    if (envPath && fs.existsSync(envPath)) return envPath;

    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    const candidates = os.platform() === 'win32' ? ['claude.cmd', 'claude.exe', 'claude'] : ['claude'];
    for (const dir of pathDirs) {
      for (const name of candidates) {
        const full = path.join(dir, name);
        try {
          if (fs.existsSync(full)) return full;
        } catch { /* skip */ }
      }
    }
    return null;
  }

  async probeCapabilities(
    binaryPath?: string,
    opts?: CliAgentProbeOptions
  ): Promise<CliAgentCapabilities | null> {
    const bin = binaryPath || this.findBinary();
    if (!bin) return null;

    try {
      const { stdout } = await execFileSimple(bin, ['--version'], {
        timeout: opts?.timeoutMs ?? 5000,
        signal: opts?.signal,
        onSpawn: opts?.onSpawn,
      });
      const raw = stdout?.trim() || '';
      const match = raw.match(/(\d+\.\d+\.\d+)/);
      if (!match) {
        return {
          version: raw,
          supportsJsonMode: false,
          supportsBare: false,
          supportsStreaming: true,
          supportsPty: true,
        };
      }
      const version = match[1];
      const semver = version.split('.').map(Number);
      const minSemver = MIN_JSON_MODE_VERSION.split('.').map(Number);
      const supportsJsonMode =
        semver[0] > minSemver[0] ||
        (semver[0] === minSemver[0] && semver[1] > minSemver[1]) ||
        (semver[0] === minSemver[0] && semver[1] === minSemver[1] && semver[2] >= minSemver[2]);

      return {
        version,
        supportsJsonMode,
        supportsBare: supportsJsonMode,
        supportsStreaming: true,
        supportsPty: true,
      };
    } catch {
      return null;
    }
  }

  buildPrompt(queryText: string, workspaceRoot: string, planItemId?: string): string {
    const parts: string[] = [];
    parts.push(`You are working in workspace: ${workspaceRoot}`);

    const claudeMdPath = path.join(workspaceRoot, 'CLAUDE.md');
    try {
      if (fs.existsSync(claudeMdPath)) {
        parts.push(`\n--- Workspace instructions (CLAUDE.md) ---\n${fs.readFileSync(claudeMdPath, 'utf-8')}\n--- End workspace instructions ---`);
      }
    } catch { /* ignore */ }

    const decisions = loadDecisionsSync(workspaceRoot);
    if (decisions) {
      parts.push(formatDecisionsForPrompt(decisions));
    }

    if (planItemId) {
      parts.push(`\nPlan item ID: ${planItemId}`);
    }

    parts.push(`\n--- Task ---\n${queryText}\n--- End task ---`);
    parts.push('\nExecute this task against the workspace. Report what you changed, what commands you ran, and the results.');

    return parts.join('\n');
  }

  tryParseJsonOutput(stdout: string): { textResponse: string; toolUses: CliAgentToolUse[] } {
    const result: { textResponse: string; toolUses: CliAgentToolUse[] } = {
      textResponse: '',
      toolUses: [],
    };

    try {
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
      // Non-JSON output
    }

    return result;
  }

  /** Run Claude Code in buffered mode */
  async run(opts: CliAgentRunOptions): Promise<CliAgentResult> {
    const claudePath = this.findBinary();
    if (!claudePath) {
      throw new Error(
        'Claude Code CLI not found. Install it, ensure `claude` is on your PATH, ' +
        'or set the KRYLEOS_CLAUDE_CODE_PATH environment variable to the full binary path.'
      );
    }

    const prompt = this.buildPrompt(opts.queryText, opts.workspaceRoot, opts.planItemId);
    const timeoutMs = opts.timeoutMs ?? 120_000;
    const maxBuffer = 10 * 1024 * 1024;
    const sanitized = sanitizeEnv();
    const startTime = Date.now();

    // Mode 1: JSON mode (--output-format json --bare)
    const capabilities = await this.probeCapabilities(claudePath);
    if (capabilities?.supportsJsonMode) {
      try {
        const printArgs = ['--print', prompt, '--output-format', 'json'];
        if (capabilities.supportsBare) printArgs.push('--bare');

        const result = await execFilePromise(claudePath, printArgs, {
          cwd: opts.workspaceRoot,
          timeout: timeoutMs,
          maxBuffer,
          env: { ...sanitized, ...(opts.env || {}) },
        });

        if (opts.onOutput && result.stdout) opts.onOutput(result.stdout, false);
        if (opts.onOutput && result.stderr) opts.onOutput(result.stderr, true);

        const parsed = result.stdout ? this.tryParseJsonOutput(result.stdout) : { textResponse: '', toolUses: [] };
        if (opts.onToolUse) {
          for (const tu of parsed.toolUses) opts.onToolUse(tu);
        }

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
        // Fall through to --print mode
      }
    }

    // Mode 2: --print mode
    try {
      const result = await execFilePromise(claudePath, ['--print', prompt], {
        cwd: opts.workspaceRoot,
        timeout: timeoutMs,
        maxBuffer,
        env: { ...sanitized, ...(opts.env || {}) },
      });

      if (opts.onOutput && result.stdout) opts.onOutput(result.stdout, false);
      if (opts.onOutput && result.stderr) opts.onOutput(result.stderr, true);

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
      // Fall through to stdin
    }

    // Mode 3: Stdin fallback
    const result = await execFilePromise(claudePath, [], {
      cwd: opts.workspaceRoot,
      timeout: timeoutMs,
      maxBuffer,
      input: prompt,
      env: { ...sanitized, ...(opts.env || {}), CLAUDE_CODE_HEADLESS: '1' },
    });

    if (opts.onOutput && result.stdout) opts.onOutput(result.stdout, false);
    if (opts.onOutput && result.stderr) opts.onOutput(result.stderr, true);

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

  /** Run Claude Code live inside a PTY session with streaming and command approvals */
  async runPty(
    opts: CliAgentRunOptions,
    terminalManager: TerminalManager,
    ws?: WebSocket
  ): Promise<CliAgentResult> {
    const claudePath = this.findBinary();
    if (!claudePath) {
      throw new Error('Claude Code CLI not found.');
    }

    const prompt = this.buildPrompt(opts.queryText, opts.workspaceRoot, opts.planItemId);
    const startTime = Date.now();
    const timeoutMs = opts.timeoutMs ?? 180_000;

    // Use print mode args for deterministic task execution in PTY
    const args = ['--print', prompt];

    return new Promise<CliAgentResult>((resolve, reject) => {
      let stdoutAcc = '';
      let stderrAcc = '';
      let timer: NodeJS.Timeout | null = null;

      // Spawn process through terminalManager's PTY infrastructure
      const session = terminalManager.createAgentSession({
        command: claudePath,
        args,
        cwd: opts.workspaceRoot,
        ws: ws || null,
        onData: (chunk: string) => {
          stdoutAcc += chunk;
          if (opts.onOutput) {
            opts.onOutput(chunk, false);
          }
        },
        onExit: (exitCode: number) => {
          if (timer) clearTimeout(timer);
          const durationMs = Date.now() - startTime;
          const parsed = this.tryParseJsonOutput(stdoutAcc);
          resolve({
            stdout: stdoutAcc,
            stderr: stderrAcc,
            exitCode,
            durationMs,
            usedPrintMode: true,
            usedJsonMode: parsed.toolUses.length > 0,
            textResponse: parsed.textResponse || stdoutAcc.trim(),
            toolUses: parsed.toolUses,
          });
        },
      });

      timer = setTimeout(() => {
        try {
          terminalManager.closeSession(session.id);
        } catch { /* ignore */ }
        reject(new Error(`Claude Code execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }
}

// ── Tier 1 Runner: Codex CLI (Production BYOK) ──────────────────────────────

export class CodexCliRunner implements CliAgentRunner {
  readonly id = 'codex-cli';
  readonly name = 'Codex CLI';
  readonly binaryName = 'codex';

  findBinary(): string | null {
    const envPath = process.env.KRYLEOS_CODEX_PATH?.trim();
    if (envPath && fs.existsSync(envPath)) return envPath;

    const pathDirs = (process.env.PATH || '').split(path.delimiter);
    // Include ~/.local/bin fallback where user installs often put codex
    const localBin = path.join(os.homedir(), '.local', 'bin');
    if (!pathDirs.includes(localBin)) {
      pathDirs.push(localBin);
    }

    const candidates = os.platform() === 'win32' ? ['codex.cmd', 'codex.exe', 'codex'] : ['codex'];
    for (const dir of pathDirs) {
      for (const name of candidates) {
        const full = path.join(dir, name);
        try {
          if (fs.existsSync(full)) return full;
        } catch { /* skip */ }
      }
    }
    return null;
  }

  async probeCapabilities(
    binaryPath?: string,
    opts?: CliAgentProbeOptions
  ): Promise<CliAgentCapabilities | null> {
    const bin = binaryPath || this.findBinary();
    if (!bin) return null;

    try {
      const { stdout } = await execFileSimple(bin, ['--version'], {
        timeout: opts?.timeoutMs ?? 5000,
        signal: opts?.signal,
        onSpawn: opts?.onSpawn,
      });
      const raw = stdout?.trim() || '';
      const match = raw.match(/(\d+\.\d+\.\d+)/);
      const version = match ? match[1] : raw;

      return {
        version,
        supportsJsonMode: true,
        supportsBare: false,
        supportsStreaming: true,
        supportsPty: true,
      };
    } catch {
      return null;
    }
  }

  buildPrompt(queryText: string, workspaceRoot: string, planItemId?: string): string {
    const parts: string[] = [];
    parts.push(`You are working in workspace: ${workspaceRoot}`);

    // Check for CODEX.md, AGENTS.md, or CLAUDE.md instruction files
    const candidateFiles = ['CODEX.md', 'AGENTS.md', 'CLAUDE.md'];
    for (const cf of candidateFiles) {
      const p = path.join(workspaceRoot, cf);
      try {
        if (fs.existsSync(p)) {
          parts.push(`\n--- Workspace instructions (${cf}) ---\n${fs.readFileSync(p, 'utf-8')}\n--- End workspace instructions ---`);
          break;
        }
      } catch { /* ignore */ }
    }

    const decisions = loadDecisionsSync(workspaceRoot);
    if (decisions) {
      parts.push(formatDecisionsForPrompt(decisions));
    }

    if (planItemId) {
      parts.push(`\nPlan item ID: ${planItemId}`);
    }

    parts.push(`\n--- Task ---\n${queryText}\n--- End task ---`);
    parts.push('\nExecute this task against the workspace. Report changes made, commands executed, and verification outcomes.');

    return parts.join('\n');
  }

  tryParseJsonLines(stdout: string): { textResponse: string; toolUses: CliAgentToolUse[] } {
    const result = { textResponse: '', toolUses: [] as CliAgentToolUse[] };
    const lines = stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) {
        if (trimmed) result.textResponse += trimmed + '\n';
        continue;
      }
      try {
        const obj = JSON.parse(trimmed);
        if (obj.item?.type === 'message' && obj.item?.text) {
          result.textResponse += obj.item.text + '\n';
        } else if (obj.type === 'response' && obj.content) {
          result.textResponse += obj.content + '\n';
        } else if (obj.type === 'tool_use' || obj.item?.type === 'command_execution') {
          result.toolUses.push({
            id: obj.id || `tu_${result.toolUses.length}`,
            name: obj.name || obj.command || 'tool',
            input: obj.input || { command: obj.command },
          });
        }
      } catch {
        if (trimmed) result.textResponse += trimmed + '\n';
      }
    }
    return result;
  }

  /** Run Codex CLI in buffered mode */
  async run(opts: CliAgentRunOptions): Promise<CliAgentResult> {
    const codexPath = this.findBinary();
    if (!codexPath) {
      throw new Error(
        'Codex CLI not found. Install it, ensure `codex` is on your PATH, ' +
        'or set the KRYLEOS_CODEX_PATH environment variable to the full binary path.'
      );
    }

    const prompt = this.buildPrompt(opts.queryText, opts.workspaceRoot, opts.planItemId);
    const timeoutMs = opts.timeoutMs ?? 120_000;
    const maxBuffer = 10 * 1024 * 1024;
    const sanitized = sanitizeEnv();
    const startTime = Date.now();

    try {
      // Primary execution mode: codex exec --cd <dir> <prompt>
      const args = ['exec', '--cd', opts.workspaceRoot, prompt];
      const result = await execFilePromise(codexPath, args, {
        cwd: opts.workspaceRoot,
        timeout: timeoutMs,
        maxBuffer,
        env: { ...sanitized, ...(opts.env || {}) },
      });

      if (opts.onOutput && result.stdout) opts.onOutput(result.stdout, false);
      if (opts.onOutput && result.stderr) opts.onOutput(result.stderr, true);

      const parsed = this.tryParseJsonLines(result.stdout || '');
      if (opts.onToolUse) {
        for (const tu of parsed.toolUses) opts.onToolUse(tu);
      }

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: Date.now() - startTime,
        usedPrintMode: true,
        usedJsonMode: parsed.toolUses.length > 0,
        textResponse: parsed.textResponse.trim() || result.stdout.trim(),
        toolUses: parsed.toolUses,
      };
    } catch (err: any) {
      // Fallback: direct prompt argument
      try {
        const result = await execFilePromise(codexPath, [prompt], {
          cwd: opts.workspaceRoot,
          timeout: timeoutMs,
          maxBuffer,
          env: { ...sanitized, ...(opts.env || {}) },
        });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          durationMs: Date.now() - startTime,
          usedPrintMode: false,
          usedJsonMode: false,
          textResponse: result.stdout.trim(),
          toolUses: [],
        };
      } catch (fallbackErr: any) {
        throw new Error(`Codex CLI execution failed: ${err.message || fallbackErr.message}`);
      }
    }
  }

  /** Run Codex CLI live inside a PTY session with streaming */
  async runPty(
    opts: CliAgentRunOptions,
    terminalManager: TerminalManager,
    ws?: WebSocket
  ): Promise<CliAgentResult> {
    const codexPath = this.findBinary();
    if (!codexPath) {
      throw new Error(
        'Codex CLI not found. Install it, ensure `codex` is on your PATH, ' +
        'or set the KRYLEOS_CODEX_PATH environment variable to the full binary path.'
      );
    }

    const prompt = this.buildPrompt(opts.queryText, opts.workspaceRoot, opts.planItemId);
    const startTime = Date.now();
    const timeoutMs = opts.timeoutMs ?? 180_000;

    // Use exec mode with directory scope for PTY streaming
    const args = ['exec', '--cd', opts.workspaceRoot, prompt];

    return new Promise<CliAgentResult>((resolve, reject) => {
      let stdoutAcc = '';
      let stderrAcc = '';
      let timer: NodeJS.Timeout | null = null;

      const session = terminalManager.createAgentSession({
        command: codexPath,
        args,
        cwd: opts.workspaceRoot,
        ws: ws || null,
        onData: (chunk: string) => {
          stdoutAcc += chunk;
          if (opts.onOutput) {
            opts.onOutput(chunk, false);
          }
        },
        onExit: (exitCode: number) => {
          if (timer) clearTimeout(timer);
          const durationMs = Date.now() - startTime;
          const parsed = this.tryParseJsonLines(stdoutAcc);
          resolve({
            stdout: stdoutAcc,
            stderr: stderrAcc,
            exitCode,
            durationMs,
            usedPrintMode: true,
            usedJsonMode: parsed.toolUses.length > 0,
            textResponse: parsed.textResponse.trim() || stdoutAcc.trim(),
            toolUses: parsed.toolUses,
          });
        },
      });

      timer = setTimeout(() => {
        try {
          terminalManager.closeSession(session.id);
        } catch { /* ignore */ }
        reject(new Error(`Codex CLI execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }
}

// ── Registry ───────────────────────────────────────────────────────────────

export class CliAgentRegistry {
  private runners = new Map<string, CliAgentRunner>();
  private defaultRunnerId = 'claude-code';

  constructor() {
    this.register(new ClaudeCodeRunner());
    this.register(new CodexCliRunner());
  }

  register(runner: CliAgentRunner): void {
    this.runners.set(runner.id, runner);
  }

  has(id: string): boolean {
    return this.runners.has(id);
  }

  unregister(id: string): boolean {
    return this.runners.delete(id);
  }

  get(id: string): CliAgentRunner | undefined {
    return this.runners.get(id);
  }

  list(): CliAgentRunner[] {
    return Array.from(this.runners.values());
  }

  getDefault(): CliAgentRunner {
    const runner = this.runners.get(this.defaultRunnerId);
    if (!runner) {
      throw new Error(`Default runner '${this.defaultRunnerId}' is not registered.`);
    }
    return runner;
  }

  setDefault(id: string): void {
    if (!this.runners.has(id)) {
      throw new Error(`Cannot set default runner: runner '${id}' not found.`);
    }
    this.defaultRunnerId = id;
  }
}

export const cliAgentRegistry = new CliAgentRegistry();

// ── Helpers ────────────────────────────────────────────────────────────────

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
    execFile(file, args, {
      cwd: opts.cwd,
      timeout: opts.timeout,
      maxBuffer: opts.maxBuffer,
      input: opts.input,
      env: opts.env as any,
    } as any, (error: any, stdout: string, stderr: string) => {
      if (error && error.code === 'ETIMEDOUT') {
        reject(new Error(`CLI agent timed out after ${opts.timeout}ms`));
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

/**
 * Recursively kills a child process and all its descendants / process group.
 * Uses `taskkill /F /T` on Windows, and recursive `pgrep -P` + process group kill on POSIX.
 */
export function killProcessTree(
  childOrPid: ChildProcess | number | null | undefined,
  signal: NodeJS.Signals = 'SIGKILL'
): void {
  if (!childOrPid) return;
  const pid = typeof childOrPid === 'number' ? childOrPid : childOrPid.pid;
  if (!pid || pid <= 0) return;

  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /F /T /PID ${pid} 2>nul`, { stdio: 'ignore' });
    } catch {
      // Process may already be dead
    }
    return;
  }

  // POSIX implementation:
  // Collect all descendant PIDs recursively
  const getDescendants = (parentPid: number): number[] => {
    try {
      const out = execSync(`pgrep -P ${parentPid}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      const directChildren = out
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(p => parseInt(p, 10))
        .filter(p => !isNaN(p) && p > 0);
      const allDescendants: number[] = [...directChildren];
      for (const child of directChildren) {
        allDescendants.push(...getDescendants(child));
      }
      return allDescendants;
    } catch {
      return [];
    }
  };

  const descendants = getDescendants(pid);
  for (const descPid of descendants) {
    try {
      process.kill(descPid, signal);
    } catch {
      // Ignore ESRCH / dead process
    }
  }

  // Kill process group if process was leader (negative pid)
  try {
    process.kill(-pid, signal);
  } catch {
    // Ignore ESRCH / EPERM
  }

  // Kill direct pid
  try {
    process.kill(pid, signal);
  } catch {
    // Ignore ESRCH / dead process
  }
}

export interface ExecFileSimpleOptions {
  timeout?: number;
  signal?: AbortSignal;
  onSpawn?: (child: ChildProcess) => void;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export function execFileSimple(
  file: string,
  args: string[],
  opts?: ExecFileSimpleOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const timeout = opts?.timeout;
    let timer: NodeJS.Timeout | null = null;
    let finished = false;
    let childProcess: ChildProcess | null = null;

    const cleanup = () => {
      finished = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (opts?.signal) {
        opts.signal.removeEventListener('abort', onAbort);
      }
    };

    const killChild = () => {
      if (childProcess) {
        killProcessTree(childProcess, 'SIGKILL');
      }
    };

    const onAbort = () => {
      if (finished) return;
      cleanup();
      killChild();
      const err = new Error('This operation was aborted');
      err.name = 'AbortError';
      reject(err);
    };

    if (opts?.signal) {
      if (opts.signal.aborted) {
        const err = new Error('This operation was aborted');
        err.name = 'AbortError';
        reject(err);
        return;
      }
      opts.signal.addEventListener('abort', onAbort);
    }

    try {
      childProcess = execFile(
        file,
        args,
        {
          cwd: opts?.cwd,
          env: opts?.env,
          detached: process.platform !== 'win32',
        } as any,
        (error: any, stdout: string, stderr: string) => {
          if (finished) return;
          cleanup();
          if (error) {
            killChild();
            reject(error);
            return;
          }
          resolve({ stdout: stdout || '', stderr: stderr || '' });
        }
      );

      if (opts?.onSpawn && childProcess) {
        opts.onSpawn(childProcess);
      }

      if (timeout && timeout > 0) {
        timer = setTimeout(() => {
          if (finished) return;
          cleanup();
          killChild();
          const err = new Error(`Command timed out after ${timeout}ms: ${file}`);
          (err as any).code = 'ETIMEDOUT';
          reject(err);
        }, timeout);
      }
    } catch (err) {
      cleanup();
      killChild();
      reject(err);
    }
  });
}

// ── Backward Compatibility Shims ───────────────────────────────────────────

export type ClaudeCodeToolUse = CliAgentToolUse;
export type ClaudeCodeResult = CliAgentResult;
export type ClaudeCodeRunnerOptions = CliAgentRunOptions;
export type ClaudeCodeCapabilities = CliAgentCapabilities;

const defaultClaudeRunner = new ClaudeCodeRunner();

export const findClaudeCodeBinary = () => defaultClaudeRunner.findBinary();
export const probeClaudeCapabilities = (
  bin?: string,
  opts?: CliAgentProbeOptions
) => defaultClaudeRunner.probeCapabilities(bin, opts);
export const buildClaudePrompt = (q: string, w: string, p?: string) => defaultClaudeRunner.buildPrompt(q, w, p);
export const tryParseJsonOutput = (s: string) => defaultClaudeRunner.tryParseJsonOutput(s);
export const claudeCodeRun = (opts: CliAgentRunOptions) => defaultClaudeRunner.run(opts);
