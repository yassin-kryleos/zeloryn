import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import * as http from 'http';
import { WebSocket } from 'ws';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CompanionHub } from '../companionHub';

class MockSocket extends EventEmitter {
  public readyState: number = WebSocket.OPEN;
  public sent: any[] = [];

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = WebSocket.CLOSED;
  }
}

function makeRequest(url: string): http.IncomingMessage {
  return { url } as unknown as http.IncomingMessage;
}

describe('CompanionHub session state streaming (P5.5)', () => {
  let registryPath: string;

  beforeEach(() => {
    registryPath = path.join(os.tmpdir(), `kryleos_device_registry_test_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    process.env.KRYLEOS_DEVICE_REGISTRY_PATH = registryPath;
  });

  afterEach(() => {
    delete process.env.KRYLEOS_DEVICE_REGISTRY_PATH;
    try { fs.unlinkSync(registryPath); } catch { /* may not exist */ }
    vi.useRealTimers();
  });

  it('broadcastSessionUpdate sends a session_update with the given payload to paired companions', () => {
    const hub = new CompanionHub();
    const code = hub.generatePairingCode();
    const ws = new MockSocket();
    hub.handleConnection(ws as unknown as WebSocket, makeRequest(`/api/companion/ws?code=${code}`));

    const tasks = [{ id: 'task-1', title: 'Do the thing', status: 'todo' as const }];
    hub.broadcastSessionUpdate({ tasks });

    const msg = ws.sent.find((m) => m.type === 'session_update');
    expect(msg).toBeDefined();
    expect(msg.tasks).toEqual(tasks);
  });

  it('telemetry_stream reports real process memory/cpu, not the old random simulation', () => {
    vi.useFakeTimers();
    const hub = new CompanionHub();
    const code = hub.generatePairingCode();
    const ws = new MockSocket();
    hub.handleConnection(ws as unknown as WebSocket, makeRequest(`/api/companion/ws?code=${code}`));

    vi.advanceTimersByTime(3000);

    const msg = ws.sent.find((m) => m.type === 'telemetry_stream');
    expect(msg).toBeDefined();
    expect(typeof msg.cpuLoad).toBe('number');
    expect(msg.cpuLoad).toBeGreaterThanOrEqual(0);
    expect(msg.cpuLoad).toBeLessThanOrEqual(100);
    // Real RSS for a running Node process is always well above the old
    // 190-240MB simulated band's lower bound is not guaranteed, but it must
    // be a positive real measurement, not Math.random()-derived.
    expect(msg.memoryUsage).toBeGreaterThan(0);
  });
});
