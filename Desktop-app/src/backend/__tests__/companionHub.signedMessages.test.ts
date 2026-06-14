import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import * as http from 'http';
import { WebSocket } from 'ws';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CompanionHub } from '../companionHub';

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

describe('CompanionHub signed device messages (P5.3)', () => {
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

  it('code-only connections (no registered deviceId) cannot STOP_WORKFLOW — unauthorized', async () => {
    const code = hub.generatePairingCode();
    const ws = new MockSocket();
    hub.handleConnection(ws as unknown as WebSocket, makeRequest(`/api/companion/ws?code=${code}`));

    await ws.receive({ type: 'STOP_WORKFLOW' });

    // A connection that has only presented the pairing code has no registered
    // public key to verify a signature against, so signed remote-exec verbs
    // are rejected outright — closes the `if (!deviceId) return true` escape
    // hatch (anyone with the pairing code could otherwise approve/stop
    // workflows unsigned).
    const reply = ws.lastSent();
    expect(reply.type).toBe('error');
    expect(reply.code).toBe('unauthorized');
  });

  it('a paired device must sign STOP_WORKFLOW; unsigned is rejected unauthorized', async () => {
    const { rawPublicKeyB64Url } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    await ws.receive({ type: 'STOP_WORKFLOW' });

    const reply = ws.lastSent();
    expect(reply.type).toBe('error');
    expect(reply.code).toBe('unauthorized');
  });

  it('a paired device with a correctly-signed STOP_WORKFLOW passes signature verification', async () => {
    const { rawPublicKeyB64Url, privateKey } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    const nonce = crypto.randomBytes(16).toString('base64url');
    const message = `phone-1:STOP_WORKFLOW:global_session:${nonce}`;
    const signature = signMessage(privateKey, message);

    await ws.receive({ type: 'STOP_WORKFLOW', signature, nonce });

    const reply = ws.lastSent();
    // No active workflow registered in this test, but it must get past the
    // signature gate to reach that (not 'unauthorized').
    expect(reply.type).toBe('error');
    expect(reply.code).toBeUndefined();
    expect(reply.message).toMatch(/No active workflow/);
  });

  it('rejects a signature from the wrong device keypair', async () => {
    const { rawPublicKeyB64Url } = generateDeviceKeypair();
    const { privateKey: otherPrivateKey } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    const nonce = crypto.randomBytes(16).toString('base64url');
    const message = `phone-1:STOP_WORKFLOW:global_session:${nonce}`;
    const signature = signMessage(otherPrivateKey, message);

    await ws.receive({ type: 'STOP_WORKFLOW', signature, nonce });

    const reply = ws.lastSent();
    expect(reply.type).toBe('error');
    expect(reply.code).toBe('unauthorized');
  });

  it('rejects a replayed nonce on a second message', async () => {
    const { rawPublicKeyB64Url, privateKey } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    const nonce = crypto.randomBytes(16).toString('base64url');
    const message = `phone-1:STOP_WORKFLOW:global_session:${nonce}`;
    const signature = signMessage(privateKey, message);

    await ws.receive({ type: 'STOP_WORKFLOW', signature, nonce });
    expect(ws.lastSent().code).toBeUndefined();

    await ws.receive({ type: 'STOP_WORKFLOW', signature, nonce });
    const reply = ws.lastSent();
    expect(reply.type).toBe('error');
    expect(reply.code).toBe('unauthorized');
  });

  it('rejects a signature whose itemId does not match the message (APPROVE_COMMAND commandId tampering)', async () => {
    const { rawPublicKeyB64Url, privateKey } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    const nonce = crypto.randomBytes(16).toString('base64url');
    // Signed for commandId "cmd-1" but the message claims "cmd-2".
    const signature = signMessage(privateKey, `phone-1:APPROVE_COMMAND:cmd-1:${nonce}`);

    await ws.receive({ type: 'APPROVE_COMMAND', commandId: 'cmd-2', signature, nonce });

    const reply = ws.lastSent();
    expect(reply.type).toBe('error');
    expect(reply.code).toBe('unauthorized');
  });

  it('broadcastCommandApprovalRequired includes a desktop signature', async () => {
    const { rawPublicKeyB64Url } = generateDeviceKeypair();
    const ws = new MockSocket();
    await pairDevice(hub, ws, 'phone-1', rawPublicKeyB64Url);

    hub.broadcastCommandApprovalRequired('global_session', 'cmd-1', 'run_command', 'echo hi', false);

    const reply = ws.lastSent();
    expect(reply.type).toBe('command_approval_required');
    expect(typeof reply.signature).toBe('string');
    expect(reply.signature.length).toBeGreaterThan(0);
  });
});
