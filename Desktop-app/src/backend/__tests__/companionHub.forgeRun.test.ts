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
  public closed: { code?: number; reason?: string } | null = null;

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close(code?: number, reason?: string) {
    this.readyState = WebSocket.CLOSED;
    this.closed = { code, reason };
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

// Mirrors the Ed25519 keypair generation/signing a phone-side @noble/ed25519
// implementation performs, using Node's built-in Ed25519 (raw key material
// via JWK, matching verifyEd25519Signature's expectations in security.ts).
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

function fakeOrchestrator(isRunning: boolean): AgentOrchestrator {
  return { isRunning } as unknown as AgentOrchestrator;
}

describe('CompanionHub START_FORGE_RUN (P5.4)', () => {
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

  it('rejects an unsigned START_FORGE_RUN from a paired device', async () => {
    const { rawPublicKeyB64Url } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    await ws.receive({ type: 'START_FORGE_RUN', planItemId: 'task-1' });

    const reply = ws.lastSent();
    expect(reply.type).toBe('error');
    expect(reply.code).toBe('unauthorized');
  });

  it('rejects a START_FORGE_RUN signed by the wrong device keypair', async () => {
    const { rawPublicKeyB64Url } = generateDeviceKeypair();
    const { privateKey: otherPrivateKey } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    const nonce = crypto.randomBytes(16).toString('base64url');
    const signature = signMessage(otherPrivateKey, `phone-1:START_FORGE_RUN:task-1:${nonce}`);

    await ws.receive({ type: 'START_FORGE_RUN', planItemId: 'task-1', signature, nonce });

    const reply = ws.lastSent();
    expect(reply.type).toBe('error');
    expect(reply.code).toBe('unauthorized');
  });

  it('responds no_active_session when no desktop session has registered a runner', async () => {
    const { rawPublicKeyB64Url, privateKey } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    const nonce = crypto.randomBytes(16).toString('base64url');
    const signature = signMessage(privateKey, `phone-1:START_FORGE_RUN:task-1:${nonce}`);

    await ws.receive({ type: 'START_FORGE_RUN', planItemId: 'task-1', signature, nonce });

    const reply = ws.lastSent();
    expect(reply.type).toBe('error');
    expect(reply.code).toBe('no_active_session');
  });

  it('responds run_in_progress and does not invoke the runner when the orchestrator is already running', async () => {
    const { rawPublicKeyB64Url, privateKey } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    hub.registerOrchestrator('global_session', fakeOrchestrator(true));
    let invoked = false;
    hub.registerForgeRunner('global_session', async () => { invoked = true; });

    const nonce = crypto.randomBytes(16).toString('base64url');
    const signature = signMessage(privateKey, `phone-1:START_FORGE_RUN:task-1:${nonce}`);

    await ws.receive({ type: 'START_FORGE_RUN', planItemId: 'task-1', signature, nonce });

    const reply = ws.lastSent();
    expect(reply.type).toBe('error');
    expect(reply.code).toBe('run_in_progress');
    expect(invoked).toBe(false);
  });

  it('invokes the registered runner and broadcasts workflow_status started when not already running', async () => {
    const { rawPublicKeyB64Url, privateKey } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    hub.registerOrchestrator('global_session', fakeOrchestrator(false));
    let receivedPlanItemId: string | null = null;
    let resolveRunner: () => void;
    const runnerDone = new Promise<void>((resolve) => { resolveRunner = resolve; });
    hub.registerForgeRunner('global_session', async (planItemId, send) => {
      receivedPlanItemId = planItemId;
      send({ type: 'status', message: 'Orchestrating agents...' });
      resolveRunner();
    });

    const nonce = crypto.randomBytes(16).toString('base64url');
    const signature = signMessage(privateKey, `phone-1:START_FORGE_RUN:task-1:${nonce}`);

    await ws.receive({ type: 'START_FORGE_RUN', planItemId: 'task-1', signature, nonce });
    await runnerDone;
    await Promise.resolve();

    expect(receivedPlanItemId).toBe('task-1');
    const messages = ws.sent.map((m) => m.type);
    expect(messages).toContain('workflow_status');
    const workflowMsg = ws.sent.find((m) => m.type === 'workflow_status');
    expect(workflowMsg.status).toBe('started');
    expect(workflowMsg.planItemId).toBe('task-1');
    expect(messages).toContain('status');
  });

  it('broadcasts an error to companions if the runner throws', async () => {
    const { rawPublicKeyB64Url, privateKey } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    hub.registerOrchestrator('global_session', fakeOrchestrator(false));
    let resolveRunner: () => void;
    const runnerDone = new Promise<void>((resolve) => { resolveRunner = resolve; });
    hub.registerForgeRunner('global_session', async () => {
      resolveRunner();
      throw new Error('boom');
    });

    const nonce = crypto.randomBytes(16).toString('base64url');
    const signature = signMessage(privateKey, `phone-1:START_FORGE_RUN:task-1:${nonce}`);

    await ws.receive({ type: 'START_FORGE_RUN', planItemId: 'task-1', signature, nonce });
    await runnerDone;
    await Promise.resolve();
    await Promise.resolve();

    const errorMsg = ws.sent.find((m) => m.type === 'error');
    expect(errorMsg).toBeDefined();
    expect(errorMsg.message).toMatch(/execution failed/);
  });
});
