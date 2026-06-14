import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Persistent store of companion devices that have completed the PAIR_DEVICE
// handshake (companionHub.ts). Lives in the user's home directory — devices
// are paired to this desktop install, not to any single project workspace.
const homeDir = process.env.USERPROFILE || process.env.HOME || process.cwd();

function getRegistryPath(): string {
  // Test-only override so unit tests don't read/write the real user registry.
  return process.env.KRYLEOS_DEVICE_REGISTRY_PATH || path.join(homeDir, '.kryleos', 'paired_devices.json');
}

export interface PairedDevice {
  deviceId: string;
  publicKey: string;
  label: string;
  pairedAt: string;
  lastSeenAt: string;
  tokenHash: string;
}

export interface PairedDeviceSummary {
  deviceId: string;
  label: string;
  pairedAt: string;
  lastSeenAt: string;
}

function readRegistry(): PairedDevice[] {
  try {
    const raw = fs.readFileSync(getRegistryPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRegistry(devices: PairedDevice[]): void {
  const registryPath = getRegistryPath();
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(devices, null, 2), 'utf-8');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Registers (or re-registers, on re-pairing) a device and issues a fresh
// 32-byte device token for reconnection. The raw token is returned once and
// never persisted — only its SHA-256 hash is stored.
export function registerDevice(deviceId: string, publicKey: string, label: string): string {
  const devices = readRegistry().filter(d => d.deviceId !== deviceId);
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  devices.push({ deviceId, publicKey, label, pairedAt: now, lastSeenAt: now, tokenHash: hashToken(token) });
  writeRegistry(devices);
  return token;
}

export function getDevice(deviceId: string): PairedDevice | null {
  return readRegistry().find(d => d.deviceId === deviceId) ?? null;
}

export function getDeviceByToken(token: string): PairedDevice | null {
  if (!token) return null;
  const hash = hashToken(token);
  return readRegistry().find(d => d.tokenHash === hash) ?? null;
}

export function touchLastSeen(deviceId: string): void {
  const devices = readRegistry();
  const device = devices.find(d => d.deviceId === deviceId);
  if (!device) return;
  device.lastSeenAt = new Date().toISOString();
  writeRegistry(devices);
}

export function listDevices(): PairedDeviceSummary[] {
  return readRegistry().map(({ deviceId, label, pairedAt, lastSeenAt }) => ({ deviceId, label, pairedAt, lastSeenAt }));
}

export function revokeDevice(deviceId: string): boolean {
  const devices = readRegistry();
  const next = devices.filter(d => d.deviceId !== deviceId);
  if (next.length === devices.length) return false;
  writeRegistry(next);
  return true;
}
