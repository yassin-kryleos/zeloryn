import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocket } from 'ws';
import { TerminalManager } from '../terminalManager';
import { classifyCommand } from '../tools';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

vi.mock('node-pty', () => {
  const ptyFactory = () => ({
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    cols: 80,
    rows: 24,
    _onDataCb: null as any,
    _onExitCb: null as any,
  });
  return {
    spawn: vi.fn(() => {
      const pty = ptyFactory();
      pty.onData = vi.fn((cb: any) => { pty._onDataCb = cb; });
      pty.onExit = vi.fn((cb: any) => { pty._onExitCb = cb; });
      return pty;
    }),
  };
});

vi.mock('../tools', () => ({
  classifyCommand: vi.fn((cmd: string) => {
    // Block rm -rf /
    if (cmd.includes('rm -rf /')) {
      return { blocked: true, destructive: true, reason: 'Blocked by security policy' };
    }
    // Destructive (but not blocked) for rm -rf with a relative path
    if (cmd.includes('rm -rf')) {
      return { blocked: false, destructive: true };
    }
    // Everything else is safe
    return { blocked: false, destructive: false };
  }),
}));

/** A deferred promise whose resolve is exposed synchronously. */
function createDeferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

class FakeWebSocket {
  public readyState: number = WebSocket.OPEN;
  public sent: any[] = [];

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = WebSocket.CLOSED;
  }

  lastSent() {
    return this.sent[this.sent.length - 1];
  }
}

describe('TerminalManager', () => {
  let tmpDir: string;
  let manager: TerminalManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kryleos-term-test-'));
    manager = new TerminalManager({
      workspaceRoot: tmpDir,
      maxSessions: 3,
      idleTimeoutMs: 300_000,
    });
  });

  afterEach(() => {
    manager.closeAll();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    vi.clearAllMocks();
  });

  // ─── Session lifecycle ──────────────────────────────────────────────

  it('createSession returns a session with id and binds to WS', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const session = manager.createSession(ws, tmpDir);

    expect(session.id).toMatch(/^term_/);
    expect(session.ws).toBe(ws);
    expect(session.cwd).toBe(tmpDir);
    expect(session.pty).toBeDefined();
    expect(manager.activeCount).toBe(1);

    const reply = (ws as any).lastSent();
    expect(reply.type).toBe('terminal_created');
    expect(reply.sessionId).toBe(session.id);
  });

  it('createSession throws when session limit is exceeded', () => {
    const ws1 = new FakeWebSocket() as unknown as WebSocket;
    const ws2 = new FakeWebSocket() as unknown as WebSocket;
    const ws3 = new FakeWebSocket() as unknown as WebSocket;
    const ws4 = new FakeWebSocket() as unknown as WebSocket;

    manager.createSession(ws1, tmpDir);
    manager.createSession(ws2, tmpDir);
    manager.createSession(ws3, tmpDir);

    expect(() => manager.createSession(ws4, tmpDir)).toThrow(/session limit.*3/i);
  });

  it('createSession throws when cwd is outside workspace root', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const outsidePath = os.tmpdir();

    expect(() => manager.createSession(ws, outsidePath)).toThrow(/outside the workspace root/i);
  });

  it('rejects paths outside workspace root', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const parentDir = path.resolve(tmpDir, '..');
    expect(() => manager.createSession(ws, parentDir)).toThrow(/outside the workspace root/i);
  });

  it('accepts workspace root itself', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    expect(() => manager.createSession(ws, tmpDir)).not.toThrow();
  });

  it('accepts subdirectories of workspace root', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const subDir = path.join(tmpDir, 'src', 'components');
    fs.mkdirSync(subDir, { recursive: true });
    expect(() => manager.createSession(ws, subDir)).not.toThrow();
  });

  it('defaults cwd to workspaceRoot when not specified', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const session = manager.createSession(ws);
    expect(session.cwd).toBe(tmpDir);
  });

  // ─── PTY I/O ────────────────────────────────────────────────────────

  it('writeInput for safe command writes text chars then \\r separately', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const session = manager.createSession(ws, tmpDir);

    manager.writeInput(session.id, 'echo hello\r');

    // Text before \r is written to PTY immediately
    expect(session.pty.write).toHaveBeenNthCalledWith(1, 'echo hello');
    // After classification (safe), \r passes through
    expect(session.pty.write).toHaveBeenNthCalledWith(2, '\r');
  });

  it('writeInput for non-\\r data passes straight through', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const session = manager.createSession(ws, tmpDir);

    manager.writeInput(session.id, 'incremental type');

    expect(session.pty.write).toHaveBeenCalledWith('incremental type');
    // classifyCommand should NOT have been called (no \r boundary)
    expect(classifyCommand).not.toHaveBeenCalled();
  });

  it('writeInput throws for unknown session id', () => {
    expect(() => manager.writeInput('nonexistent', 'data')).toThrow(/session.*not found/i);
  });

  it('writeInput for empty line sends \\r through', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const session = manager.createSession(ws, tmpDir);

    // Just \r with nothing before it — empty line
    manager.writeInput(session.id, '\r');

    // No text chars to write before \r
    // classifyCommand should not be called (trim is empty)
    expect(session.pty.write).toHaveBeenCalledWith('\r');
    expect(classifyCommand).not.toHaveBeenCalled();
  });

  // ─── Approval gate: safe commands ───────────────────────────────────

  it('safe command passes \\r through immediately', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const session = manager.createSession(ws, tmpDir);

    manager.writeInput(session.id, 'echo hello\r');

    // Text chars written first
    expect(session.pty.write).toHaveBeenNthCalledWith(1, 'echo hello');
    // Then \r (safe → non-destructive)
    expect(session.pty.write).toHaveBeenNthCalledWith(2, '\r');

    // No pending approval for safe commands
    expect(session.pendingApproval).toBe(false);
  });

  // ─── Approval gate: blocked commands ────────────────────────────────

  it('blocked command never reaches PTY as \\r, gets bell instead', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const session = manager.createSession(ws, tmpDir);

    manager.writeInput(session.id, 'rm -rf /\r');

    // Text chars ARE written to PTY (so the user sees their typed input echo)
    expect(session.pty.write).toHaveBeenCalledWith('rm -rf /');

    // But \r is NOT written — bell is written instead
    const writeCalls = (session.pty.write as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0]);
    expect(writeCalls).not.toContain('\r');
    expect(writeCalls).toContain('\x07');

    // WS should have received terminal_command_blocked message
    const blockedMsg = (ws as any).sent.find((m: any) => m.type === 'terminal_command_blocked');
    expect(blockedMsg).toBeDefined();
    expect(blockedMsg.sessionId).toBe(session.id);
    expect(blockedMsg.command).toBe('rm -rf /');
    expect(blockedMsg.reason).toBe('Blocked by security policy');
  });

  // ─── Approval gate: destructive commands ────────────────────────────

  it('destructive command triggers onCommand callback', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const onCommand = vi.fn(() => Promise.resolve(true));
    manager = new TerminalManager({ workspaceRoot: tmpDir, onCommand });
    const session = manager.createSession(ws, tmpDir);

    manager.writeInput(session.id, 'rm -rf .\r');

    // onCommand should have been called with sessionId, command, and classification
    expect(onCommand).toHaveBeenCalledWith(
      session.id,
      'rm -rf .',
      { blocked: false, destructive: true },
    );
  });

  it('destructive command accepted via onCommand sends \\r', async () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const onCommand = vi.fn(() => Promise.resolve(true));
    manager = new TerminalManager({ workspaceRoot: tmpDir, onCommand });
    const session = manager.createSession(ws, tmpDir);

    manager.writeInput(session.id, 'rm -rf .\r');

    // Text chars written immediately
    expect(session.pty.write).toHaveBeenCalledWith('rm -rf .');

    // Wait for the onCommand promise to settle
    await vi.waitFor(() => {
      expect(onCommand).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 10));

    // After onCommand resolves with true, \r should have been written
    const allCalls = (session.pty.write as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0]);
    expect(allCalls).toContain('\r');
    expect(session.pendingApproval).toBe(false);
  });

  it('destructive command rejected via onCommand sends bell and reject message', async () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const onCommand = vi.fn(() => Promise.resolve(false));
    manager = new TerminalManager({ workspaceRoot: tmpDir, onCommand });
    const session = manager.createSession(ws, tmpDir);

    manager.writeInput(session.id, 'rm -rf .\r');

    // Wait for onCommand to settle
    await new Promise((r) => setTimeout(r, 10));

    // PTY should have gotten bell, not \r
    const allCalls = (session.pty.write as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0]);
    expect(allCalls).not.toContain('\r');
    expect(allCalls).toContain('\x07');
    expect(session.pendingApproval).toBe(false);

    // WS should have terminal_command_rejected message
    const rejectedMsg = (ws as any).sent.find((m: any) => m.type === 'terminal_command_rejected');
    expect(rejectedMsg).toBeDefined();
    expect(rejectedMsg.sessionId).toBe(session.id);
    expect(rejectedMsg.command).toBe('rm -rf .');
    expect(rejectedMsg.reason).toBe('Rejected by user');
  });

  it('destructive command held until approval resolves', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    // onCommand returns a promise that never resolves — resolveApproval
    // is the mechanism that unblocks the session.
    const onCommand = vi.fn(() => new Promise<boolean>(() => {}));
    manager = new TerminalManager({ workspaceRoot: tmpDir, onCommand });
    const session = manager.createSession(ws, tmpDir);

    manager.writeInput(session.id, 'rm -rf .\r');

    // Text chars written to PTY
    expect(session.pty.write).toHaveBeenCalledWith('rm -rf .');

    // \r should NOT have been written yet
    const writeCallsBefore = (session.pty.write as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0]);
    expect(writeCallsBefore).not.toContain('\r');

    // Session is pending approval
    expect(session.pendingApproval).toBe(true);

    // Resolve via resolveApproval
    manager.resolveApproval(session.id, true);

    // Now \r should have been written
    const writeCallsAfter = (session.pty.write as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0]);
    expect(writeCallsAfter).toContain('\r');
    expect(session.pendingApproval).toBe(false);
  });

  it('input buffers while awaiting approval, then flushed', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    // onCommand returns a never-resolving promise
    const onCommand = vi.fn(() => new Promise<boolean>(() => {}));
    manager = new TerminalManager({ workspaceRoot: tmpDir, onCommand });
    const session = manager.createSession(ws, tmpDir);

    // Write a destructive command that triggers pending approval
    manager.writeInput(session.id, 'rm -rf .\r');
    expect(session.pendingApproval).toBe(true);

    // Clear the pty.write mock counts from the first write
    (session.pty.write as ReturnType<typeof vi.fn>).mockClear();

    // Write additional input while approval is pending
    manager.writeInput(session.id, 'y');
    manager.writeInput(session.id, '\r');

    // Nothing should have been written to PTY — it's all buffered
    expect(session.pty.write).not.toHaveBeenCalled();
    expect(session.inputBuffer).toBe('y\r');

    // Resolve approval
    manager.resolveApproval(session.id, true);

    // \r should be written first, then buffered data flushed
    expect(session.pty.write).toHaveBeenNthCalledWith(1, '\r');
    expect(session.pty.write).toHaveBeenNthCalledWith(2, 'y\r');
    expect(session.pendingApproval).toBe(false);
  });

  // ─── PTY events ────────────────────────────────────────────────────

  it('PTY onData forwards output to WS', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const session = manager.createSession(ws, tmpDir);

    expect(session.pty._onDataCb).toBeDefined();
    session.pty._onDataCb('hello from shell\r\n');

    const dataSent = (ws as any).sent.find((m: any) => m.type === 'terminal_data');
    expect(dataSent).toBeDefined();
    expect(dataSent.sessionId).toBe(session.id);
    expect(dataSent.data).toBe('hello from shell\r\n');
  });

  it('PTY onExit cleans up session and notifies WS', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const session = manager.createSession(ws, tmpDir);

    expect(session.pty._onExitCb).toBeDefined();
    session.pty._onExitCb({ exitCode: 0 });

    const exitMsg = (ws as any).sent.find((m: any) => m.type === 'terminal_exit');
    expect(exitMsg).toBeDefined();
    expect(exitMsg.sessionId).toBe(session.id);
    expect(exitMsg.exitCode).toBe(0);
    expect(manager.activeCount).toBe(0);
  });

  // ─── Session management ─────────────────────────────────────────────

  it('resize resizes the PTY', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const session = manager.createSession(ws, tmpDir);

    manager.resize(session.id, 120, 40);

    expect(session.pty.resize).toHaveBeenCalledWith(120, 40);
  });

  it('resize throws for unknown session id', () => {
    expect(() => manager.resize('nonexistent', 80, 24)).toThrow(/session.*not found/i);
  });

  it('closeSession kills PTY and removes session', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    const session = manager.createSession(ws, tmpDir);

    expect(manager.activeCount).toBe(1);
    manager.closeSession(session.id);
    expect(manager.activeCount).toBe(0);
    expect(session.pty.kill).toHaveBeenCalled();
  });

  it('closeSession is idempotent for unknown id', () => {
    expect(() => manager.closeSession('nonexistent')).not.toThrow();
  });

  it('closeSessionByWs closes all sessions owned by a given WS', () => {
    const ws1 = new FakeWebSocket() as unknown as WebSocket;
    const ws2 = new FakeWebSocket() as unknown as WebSocket;

    manager.createSession(ws1, tmpDir);
    manager.createSession(ws1, tmpDir);
    manager.createSession(ws2, tmpDir);

    expect(manager.activeCount).toBe(3);

    manager.closeSessionByWs(ws1);
    expect(manager.activeCount).toBe(1);
  });

  it('closeAll closes every session', () => {
    const ws1 = new FakeWebSocket() as unknown as WebSocket;
    const ws2 = new FakeWebSocket() as unknown as WebSocket;

    manager.createSession(ws1, tmpDir);
    manager.createSession(ws2, tmpDir);
    expect(manager.activeCount).toBe(2);

    manager.closeAll();
    expect(manager.activeCount).toBe(0);
  });

  it('reapStale removes sessions past idle timeout', () => {
    const ws = new FakeWebSocket() as unknown as WebSocket;
    manager = new TerminalManager({
      workspaceRoot: tmpDir,
      maxSessions: 3,
      idleTimeoutMs: 100,
    });

    const session = manager.createSession(ws, tmpDir);
    expect(manager.activeCount).toBe(1);

    (session as any).lastActivity = Date.now() - 500;

    const reaped = manager.reapStale();
    expect(reaped).toContain(session.id);
    expect(manager.activeCount).toBe(0);
  });

  it('activeCount returns correct count', () => {
    expect(manager.activeCount).toBe(0);

    const ws1 = new FakeWebSocket() as unknown as WebSocket;
    manager.createSession(ws1, tmpDir);
    expect(manager.activeCount).toBe(1);

    const ws2 = new FakeWebSocket() as unknown as WebSocket;
    manager.createSession(ws2, tmpDir);
    expect(manager.activeCount).toBe(2);
  });
});
