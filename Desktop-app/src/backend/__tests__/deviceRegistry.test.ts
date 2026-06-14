import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as deviceRegistry from '../deviceRegistry';

describe('deviceRegistry', () => {
  let registryPath: string;

  beforeEach(() => {
    registryPath = path.join(os.tmpdir(), `kryleos_device_registry_test_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    process.env.KRYLEOS_DEVICE_REGISTRY_PATH = registryPath;
  });

  afterEach(() => {
    delete process.env.KRYLEOS_DEVICE_REGISTRY_PATH;
    try { fs.unlinkSync(registryPath); } catch { /* may not exist */ }
  });

  it('returns no devices when the registry file does not exist yet', () => {
    expect(deviceRegistry.listDevices()).toEqual([]);
    expect(deviceRegistry.getDevice('device-1')).toBeNull();
  });

  it('registers a device and persists it', () => {
    const token = deviceRegistry.registerDevice('device-1', 'pubkey-1', 'My Phone');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);

    const device = deviceRegistry.getDevice('device-1');
    expect(device).not.toBeNull();
    expect(device?.deviceId).toBe('device-1');
    expect(device?.publicKey).toBe('pubkey-1');
    expect(device?.label).toBe('My Phone');
    // Raw token is never persisted, only its hash.
    expect(device?.tokenHash).toBe(deviceRegistry.hashToken(token));
  });

  it('looks up a device by its issued token', () => {
    const token = deviceRegistry.registerDevice('device-1', 'pubkey-1', 'My Phone');
    const device = deviceRegistry.getDeviceByToken(token);
    expect(device?.deviceId).toBe('device-1');
  });

  it('returns null for an unknown or empty token', () => {
    deviceRegistry.registerDevice('device-1', 'pubkey-1', 'My Phone');
    expect(deviceRegistry.getDeviceByToken('not-a-real-token')).toBeNull();
    expect(deviceRegistry.getDeviceByToken('')).toBeNull();
  });

  it('re-registering a device replaces its entry and issues a new token', () => {
    const firstToken = deviceRegistry.registerDevice('device-1', 'pubkey-old', 'My Phone');
    const secondToken = deviceRegistry.registerDevice('device-1', 'pubkey-new', 'My Phone (re-paired)');

    expect(secondToken).not.toBe(firstToken);
    expect(deviceRegistry.getDeviceByToken(firstToken)).toBeNull();

    const device = deviceRegistry.getDeviceByToken(secondToken);
    expect(device?.publicKey).toBe('pubkey-new');
    expect(device?.label).toBe('My Phone (re-paired)');
    expect(deviceRegistry.listDevices()).toHaveLength(1);
  });

  it('touchLastSeen updates lastSeenAt without changing other fields', async () => {
    deviceRegistry.registerDevice('device-1', 'pubkey-1', 'My Phone');
    const before = deviceRegistry.getDevice('device-1');

    await new Promise(resolve => setTimeout(resolve, 5));
    deviceRegistry.touchLastSeen('device-1');

    const after = deviceRegistry.getDevice('device-1');
    expect(after?.pairedAt).toBe(before?.pairedAt);
    expect(new Date(after!.lastSeenAt).getTime()).toBeGreaterThanOrEqual(new Date(before!.lastSeenAt).getTime());
  });

  it('touchLastSeen on an unknown device is a no-op', () => {
    expect(() => deviceRegistry.touchLastSeen('does-not-exist')).not.toThrow();
    expect(deviceRegistry.listDevices()).toEqual([]);
  });

  it('listDevices returns summaries without publicKey or tokenHash', () => {
    deviceRegistry.registerDevice('device-1', 'pubkey-1', 'My Phone');
    const list = deviceRegistry.listDevices();
    expect(list).toEqual([{
      deviceId: 'device-1',
      label: 'My Phone',
      pairedAt: expect.any(String),
      lastSeenAt: expect.any(String),
    }]);
  });

  it('revokeDevice removes the device and returns true; false if not found', () => {
    deviceRegistry.registerDevice('device-1', 'pubkey-1', 'My Phone');
    expect(deviceRegistry.revokeDevice('device-1')).toBe(true);
    expect(deviceRegistry.getDevice('device-1')).toBeNull();
    expect(deviceRegistry.revokeDevice('device-1')).toBe(false);
  });

  it('hashToken is deterministic', () => {
    expect(deviceRegistry.hashToken('abc')).toBe(deviceRegistry.hashToken('abc'));
    expect(deviceRegistry.hashToken('abc')).not.toBe(deviceRegistry.hashToken('abd'));
  });
});
