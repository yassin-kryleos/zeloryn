import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import * as http from 'http';
import { WebSocket } from 'ws';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CompanionHub } from '../companionHub';
import * as deviceRegistry from '../deviceRegistry';

// Minimal stand-in for a `ws` WebSocket: enough surface for handleConnection
// (readyState, send, close, on('message'/'close')) without a real socket.
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
    // Let the async message handler's microtasks settle.
    await Promise.resolve();
    await Promise.resolve();
  }
}

function makeRequest(url: string): http.IncomingMessage {
  return { url } as unknown as http.IncomingMessage;
}

describe('CompanionHub pairing v2 (device registry)', () => {
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

  it('generatePairingCode also issues a pairing secret with the same TTL', () => {
    const code = hub.generatePairingCode();
    const secret = hub.getPairingSecret();
    expect(code).toMatch(/^\d{6}$/);
    expect(typeof secret).toBe('string');
    expect(secret!.length).toBeGreaterThan(20);
    expect(hub.verifyPairingSecret(secret!)).toBe(true);
  });

  it('verifyPairingSecret rejects a wrong or empty secret', () => {
    hub.generatePairingCode();
    expect(hub.verifyPairingSecret('wrong-secret')).toBe(false);
    expect(hub.verifyPairingSecret('')).toBe(false);
  });

  it('rejects a connection with neither a valid code nor a device token', async () => {
    hub.generatePairingCode();
    const ws = new MockSocket();
    hub.handleConnection(ws as unknown as WebSocket, makeRequest('/api/companion/ws'));
    expect(ws.closed?.code).toBe(4001);
    expect(ws.lastSent().type).toBe('error');
  });

  it('PAIR_DEVICE registers a device and returns a deviceToken + desktop public key', async () => {
    const code = hub.generatePairingCode();
    const secret = hub.getPairingSecret()!;

    const ws = new MockSocket();
    hub.handleConnection(ws as unknown as WebSocket, makeRequest(`/api/companion/ws?code=${code}`));
    expect(ws.lastSent().type).toBe('connection_status');
    expect(ws.lastSent().deviceId).toBeNull();

    await ws.receive({ type: 'PAIR_DEVICE', deviceId: 'phone-1', publicKey: 'phone-pubkey', label: 'My Phone', pairingSecret: secret });

    const reply = ws.lastSent();
    expect(reply.type).toBe('device_paired');
    expect(reply.deviceId).toBe('phone-1');
    expect(typeof reply.deviceToken).toBe('string');
    expect(typeof reply.desktopPublicKey).toBe('string');

    const stored = deviceRegistry.getDevice('phone-1');
    expect(stored?.publicKey).toBe('phone-pubkey');
    expect(stored?.label).toBe('My Phone');
  });

  it('PAIR_DEVICE rejects an invalid pairing secret without registering the device', async () => {
    const code = hub.generatePairingCode();

    const ws = new MockSocket();
    hub.handleConnection(ws as unknown as WebSocket, makeRequest(`/api/companion/ws?code=${code}`));

    await ws.receive({ type: 'PAIR_DEVICE', deviceId: 'phone-1', publicKey: 'phone-pubkey', label: 'My Phone', pairingSecret: 'wrong-secret' });

    const reply = ws.lastSent();
    expect(reply.type).toBe('error');
    expect(reply.code).toBe('unauthorized');
    expect(deviceRegistry.getDevice('phone-1')).toBeNull();
  });

  it('PAIR_DEVICE rejects a malformed payload', async () => {
    const code = hub.generatePairingCode();
    const ws = new MockSocket();
    hub.handleConnection(ws as unknown as WebSocket, makeRequest(`/api/companion/ws?code=${code}`));

    await ws.receive({ type: 'PAIR_DEVICE', deviceId: 'phone-1' });

    const reply = ws.lastSent();
    expect(reply.type).toBe('error');
    expect(reply.code).toBe('unauthorized');
  });

  it('a previously-paired device reconnects via deviceToken', async () => {
    const code = hub.generatePairingCode();
    const secret = hub.getPairingSecret()!;

    const ws1 = new MockSocket();
    hub.handleConnection(ws1 as unknown as WebSocket, makeRequest(`/api/companion/ws?code=${code}`));
    await ws1.receive({ type: 'PAIR_DEVICE', deviceId: 'phone-1', publicKey: 'phone-pubkey', label: 'My Phone', pairingSecret: secret });
    const { deviceToken } = ws1.lastSent();

    const ws2 = new MockSocket();
    hub.handleConnection(ws2 as unknown as WebSocket, makeRequest(`/api/companion/ws?deviceToken=${deviceToken}`));

    const reply = ws2.lastSent();
    expect(reply.type).toBe('connection_status');
    expect(reply.deviceId).toBe('phone-1');
    expect(ws2.closed).toBeNull();
  });

  it('rejects reconnection with an invalid or revoked deviceToken', () => {
    const ws = new MockSocket();
    hub.handleConnection(ws as unknown as WebSocket, makeRequest('/api/companion/ws?deviceToken=not-a-real-token'));

    expect(ws.closed?.code).toBe(4001);
    const reply = ws.lastSent();
    expect(reply.type).toBe('error');
    expect(reply.code).toBe('unauthorized');
  });

  it('listDevices reflects paired devices', async () => {
    const code = hub.generatePairingCode();
    const secret = hub.getPairingSecret()!;
    const ws = new MockSocket();
    hub.handleConnection(ws as unknown as WebSocket, makeRequest(`/api/companion/ws?code=${code}`));
    await ws.receive({ type: 'PAIR_DEVICE', deviceId: 'phone-1', publicKey: 'phone-pubkey', label: 'My Phone', pairingSecret: secret });

    const devices = hub.listDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceId).toBe('phone-1');
    expect(devices[0].label).toBe('My Phone');
  });

  it('revokeDevice removes the registry entry and disconnects the live connection', async () => {
    const code = hub.generatePairingCode();
    const secret = hub.getPairingSecret()!;
    const ws = new MockSocket();
    hub.handleConnection(ws as unknown as WebSocket, makeRequest(`/api/companion/ws?code=${code}`));
    await ws.receive({ type: 'PAIR_DEVICE', deviceId: 'phone-1', publicKey: 'phone-pubkey', label: 'My Phone', pairingSecret: secret });
    const { deviceToken } = ws.lastSent();

    expect(hub.revokeDevice('phone-1')).toBe(true);

    expect(ws.closed?.code).toBe(4001);
    expect(ws.lastSent().type).toBe('error');
    expect(ws.lastSent().code).toBe('unauthorized');

    expect(deviceRegistry.getDevice('phone-1')).toBeNull();

    // Old token no longer authenticates a new connection.
    const ws2 = new MockSocket();
    hub.handleConnection(ws2 as unknown as WebSocket, makeRequest(`/api/companion/ws?deviceToken=${deviceToken}`));
    expect(ws2.closed?.code).toBe(4001);
  });

  it('revokeDevice on an unknown device returns false', () => {
    expect(hub.revokeDevice('does-not-exist')).toBe(false);
  });
});
