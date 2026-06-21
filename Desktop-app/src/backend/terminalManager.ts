// TerminalManager: manages node-pty sessions with WebSocket I/O.
// Each session is a terminal process bound to one WebSocket connection.
// Sessions are sandboxed to the workspace root and subject to
// command classification + approval gate.

import { spawn, type IPty } from 'node-pty';
import * as os from 'os';
import * as path from 'path';
import { WebSocket } from 'ws';
import { classifyCommand, type CommandClassification } from './tools';

export interface TerminalSession {
  id: string;
  pty: IPty;
  ws: WebSocket;
  createdAt: number;
  lastActivity: number;
  cwd: string;
  /** Accumulated input since the last \r boundary. */
  inputBuffer: string;
  /** True while awaiting user approval for a destructive command. */
  pendingApproval: boolean;
}

export interface TerminalManagerOptions {
  workspaceRoot: string;
  maxSessions?: number;
  idleTimeoutMs?: number;
  /** Called for destructive terminal commands pending user approval.
   *  Return true to allow execution (send \r), false to reject (discard line). */
  onCommand?: (sessionId: string, command: string, classification: CommandClassification) => Promise<boolean>;
  shellPath?: string;
  shellArgs?: string[];
}

const DEFAULT_MAX_SESSIONS = 3;
const DEFAULT_IDLE_TIMEOUT_MS = 300_000; // 5 min

export class TerminalManager {
  private sessions = new Map<string, TerminalSession>();
  private options: Required<TerminalManagerOptions>;

  constructor(opts: TerminalManagerOptions) {
    this.options = {
      workspaceRoot: opts.workspaceRoot,
      maxSessions: opts.maxSessions ?? DEFAULT_MAX_SESSIONS,
      idleTimeoutMs: opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      onCommand: opts.onCommand ?? (() => Promise.resolve(true)),
      shellPath: opts.shellPath ?? (os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash'),
      shellArgs: opts.shellArgs ?? [],
    };
  }

  get activeCount(): number {
    return this.sessions.size;
  }

  /** Create a new terminal session and bind it to a WebSocket. */
  createSession(ws: WebSocket, cwd?: string): TerminalSession {
    if (this.sessions.size >= this.options.maxSessions) {
      throw new Error(
        `Terminal session limit (${this.options.maxSessions}) reached. Close an existing session first.`
      );
    }

    const sessionId = `term_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const resolvedCwd = cwd || this.options.workspaceRoot;

    if (!this.isPathInsideWorkspace(resolvedCwd)) {
      throw new Error(`Path "${resolvedCwd}" is outside the workspace root.`);
    }

    const shellEnv: { [key: string]: string } = {
      ...process.env,
      TERM: 'xterm-256color',
      ...(os.platform() !== 'win32' ? { PWD: resolvedCwd } : {}),
    };

    const pty = spawn(this.options.shellPath, this.options.shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: resolvedCwd,
      env: shellEnv,
    });

    const session: TerminalSession = {
      id: sessionId,
      pty,
      ws,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      cwd: resolvedCwd,
      inputBuffer: '',
      pendingApproval: false,
    };

    this.sessions.set(sessionId, session);

    pty.onData((data: string) => {
      session.lastActivity = Date.now();
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'terminal_data', sessionId, data }));
        }
      } catch { /* ws may have closed */ }
    });

    pty.onExit(({ exitCode }) => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'terminal_exit', sessionId, exitCode }));
        }
      } catch { /* ignore */ }
      this.sessions.delete(sessionId);
    });

    try {
      ws.send(JSON.stringify({
        type: 'terminal_created',
        sessionId,
        cols: pty.cols,
        rows: pty.rows,
      }));
    } catch { /* ignore */ }

    return session;
  }

  /** Write input to a terminal session.
   *  Applies command classification at \r boundaries: blocked commands are
   *  rejected with a bell, destructive commands are gated through the
   *  onCommand approval callback. */
  writeInput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Terminal session ${sessionId} not found.`);
    }
    session.lastActivity = Date.now();

    // If awaiting approval, buffer input but don't send to PTY.
    if (session.pendingApproval) {
      session.inputBuffer += data;
      return;
    }

    // Accumulate input and detect newline boundaries.
    session.inputBuffer += data;

    // Non-\r data passes through to the PTY immediately and is accumulated
    // in the buffer for line reconstruction.
    if (!data.includes('\r')) {
      session.pty.write(data);
      return;
    }

    // Data contains \r — write the text characters to PTY first (so the
    // shell receives and echoes the typed text), then gate the \r itself.
    const textChars = data.replace(/\r/g, '');
    if (textChars) {
      session.pty.write(textChars);
    }

    // Extract the complete line(s) up to the last \r.
    const lines = session.inputBuffer.split('\r');
    const completeLine = lines.slice(0, -1).join('\r');
    session.inputBuffer = lines[lines.length - 1] || '';

    if (!completeLine.trim()) {
      session.pty.write('\r');
      return;
    }

    const classification = classifyCommand(completeLine.trim());

    // Hard-blocked command: never reaches the PTY.
    if (classification.blocked) {
      session.pty.write('\x07');
      try {
        if (session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify({
            type: 'terminal_command_blocked',
            sessionId,
            command: completeLine.trim(),
            reason: classification.reason || 'Blocked by security policy',
          }));
        }
      } catch { /* ignore */ }
      return;
    }

    // Safe command: pass \r through immediately.
    if (!classification.destructive) {
      session.pty.write('\r');
      return;
    }

    // Destructive command: gate through approval callback.
    if (this.options.onCommand) {
      session.pendingApproval = true;
      this.options.onCommand(session.id, completeLine.trim(), classification)
        .then((approved) => {
          session.pendingApproval = false;
          if (approved) {
            session.pty.write('\r');
            // Flush any buffered input that accumulated during approval wait.
            if (session.inputBuffer) {
              session.pty.write(session.inputBuffer);
            }
          } else {
            session.pty.write('\x07');
            try {
              if (session.ws.readyState === WebSocket.OPEN) {
                session.ws.send(JSON.stringify({
                  type: 'terminal_command_rejected',
                  sessionId,
                  command: completeLine.trim(),
                  reason: 'Rejected by user',
                }));
              }
            } catch { /* ignore */ }
            session.inputBuffer = '';
          }
        })
        .catch(() => {
          session.pendingApproval = false;
          session.pty.write('\x07');
          session.inputBuffer = '';
        });
    }
  }

  /** Resolve a pending terminal approval. Called from server.ts on user response. */
  resolveApproval(sessionId: string, approved: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.pendingApproval) return;
    session.pendingApproval = false;
    if (approved) {
      session.pty.write('\r');
      if (session.inputBuffer) {
        session.pty.write(session.inputBuffer);
      }
    } else {
      session.pty.write('\x07');
      session.inputBuffer = '';
    }
  }

  /** Resize a terminal session. */
  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Terminal session ${sessionId} not found.`);
    }
    session.pty.resize(cols, rows);
  }

  /** Close a terminal session. */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try { session.pty.kill(); } catch { /* already dead */ }
    this.sessions.delete(sessionId);
  }

  /** Close all sessions owned by a given WebSocket. */
  closeSessionByWs(ws: WebSocket): void {
    for (const [id, session] of this.sessions) {
      if (session.ws === ws) {
        try { session.pty.kill(); } catch { /* skip */ }
        this.sessions.delete(id);
      }
    }
  }

  /** Close all sessions (e.g., on server shutdown). */
  closeAll(): void {
    for (const [id, session] of this.sessions) {
      try { session.pty.kill(); } catch { /* skip */ }
      this.sessions.delete(id);
    }
  }

  /** Remove stale (idle-timeout) sessions. Returns reaped session IDs. */
  reapStale(): string[] {
    const now = Date.now();
    const reaped: string[] = [];
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > this.options.idleTimeoutMs) {
        try { session.pty.kill(); } catch { /* skip */ }
        this.sessions.delete(id);
        reaped.push(id);
      }
    }
    return reaped;
  }

  private isPathInsideWorkspace(targetPath: string): boolean {
    const resolved = path.resolve(targetPath);
    const workspace = path.resolve(this.options.workspaceRoot);
    return resolved === workspace || resolved.startsWith(workspace + path.sep);
  }
}
