import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import * as http from 'http';
import { WebSocket } from 'ws';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CompanionHub } from '../companionHub';
import type { AgentOrchestrator } from '../agents';

class MockSocket extends EventEmitter {
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

  async receive(payload: any) {
    this.emit('message', JSON.stringify(payload));
    await Promise.resolve();
    await Promise.resolve();
  }
}

function makeRequest(url: string): http.IncomingMessage {
  return { url } as unknown as http.IncomingMessage;
}

function generateDeviceKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const rawPublicKeyB64Url = (publicKey.export({ format: 'jwk' }) as any).x as string;
  return { rawPublicKeyB64Url, privateKey };
}

function signMessage(privateKey: crypto.KeyObject, message: string): string {
  return crypto.sign(null, Buffer.from(message), privateKey).toString('base64');
}

async function pairDevice(hub: CompanionHub, ws: MockSocket, deviceId: string, rawPublicKeyB64Url: string) {
  const code = hub.generatePairingCode();
  const secret = hub.getPairingSecret()!;
  hub.handleConnection(ws as unknown as WebSocket, makeRequest(`/api/companion/ws?code=${code}`));
  await ws.receive({ type: 'PAIR_DEVICE', deviceId, publicKey: rawPublicKeyB64Url, label: 'My Phone', pairingSecret: secret });
  return ws.lastSent();
}

function fakeOrchestrator() {
  return {
    isRunning: false,
    commandPendingApproval: {
      tool: 'runCommand',
      args: { command: 'echo hi' },
      resolve: (_decision: string) => {}
    },
    pendingCommandId: 'cmd-1',
    pendingCommandText: 'echo hi',
    pendingApprovalSource: null as { source: 'local' | 'remote'; deviceId?: string } | null,
    abortExecution: () => 0
  } as unknown as AgentOrchestrator;
}

describe('CompanionHub remote audit trail (P5.6)', () => {
  let hub: CompanionHub;
  let registryPath: string;

  beforeEach(() => {
    registryPath = path.join(os.tmpdir(), `kryleos_device_registry_test_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    process.env.KRYLEOS_DEVICE_REGISTRY_PATH = registryPath;
    hub = new CompanionHub();
  });

  afterEach(() => {
    delete process.env.KRYLEOS_DEVICE_REGISTRY_PATH;
    try { fs.unlinkSync(registryPath); } catch { /* may not exist */ }
  });

  it('tags pendingApprovalSource as remote with the device id before resolving APPROVE_COMMAND', async () => {
    const { rawPublicKeyB64Url, privateKey } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    const orchestrator = fakeOrchestrator();
    hub.registerOrchestrator('global_session', orchestrator);

    const nonce = crypto.randomBytes(16).toString('base64url');
    const signature = signMessage(privateKey, `phone-1:APPROVE_COMMAND:cmd-1:${nonce}`);

    await ws.receive({ type: 'APPROVE_COMMAND', commandId: 'cmd-1', signature, nonce });

    expect(orchestrator.pendingApprovalSource).toEqual({ source: 'remote', deviceId: 'phone-1' });
  });

  it('tags pendingApprovalSource as remote with the device id before resolving REJECT_COMMAND', async () => {
    const { rawPublicKeyB64Url, privateKey } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    const orchestrator = fakeOrchestrator();
    hub.registerOrchestrator('global_session', orchestrator);

    const nonce = crypto.randomBytes(16).toString('base64url');
    const signature = signMessage(privateKey, `phone-1:REJECT_COMMAND:cmd-1:${nonce}`);

    await ws.receive({ type: 'REJECT_COMMAND', commandId: 'cmd-1', signature, nonce });

    expect(orchestrator.pendingApprovalSource).toEqual({ source: 'remote', deviceId: 'phone-1' });
  });

  it('tags pendingApprovalSource as remote with the device id before STOP_WORKFLOW aborts', async () => {
    const { rawPublicKeyB64Url, privateKey } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    const orchestrator = fakeOrchestrator();
    hub.registerOrchestrator('global_session', orchestrator);

    const nonce = crypto.randomBytes(16).toString('base64url');
    const signature = signMessage(privateKey, `phone-1:STOP_WORKFLOW:global_session:${nonce}`);

    await ws.receive({ type: 'STOP_WORKFLOW', signature, nonce });

    expect(orchestrator.pendingApprovalSource).toEqual({ source: 'remote', deviceId: 'phone-1' });
  });

  it('passes the paired device id to the FORGE runner on START_FORGE_RUN', async () => {
    const { rawPublicKeyB64Url, privateKey } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    hub.registerOrchestrator('global_session', { isRunning: false } as unknown as AgentOrchestrator);
    let receivedDeviceId: string | undefined;
    hub.registerForgeRunner('global_session', async (_planItemId, _send, deviceId) => {
      receivedDeviceId = deviceId;
    });

    const nonce = crypto.randomBytes(16).toString('base64url');
    const signature = signMessage(privateKey, `phone-1:START_FORGE_RUN:task-1:${nonce}`);

    await ws.receive({ type: 'START_FORGE_RUN', planItemId: 'task-1', signature, nonce });

    expect(receivedDeviceId).toBe('phone-1');
  });
});
