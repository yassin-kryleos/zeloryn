import * as crypto from 'crypto';
import * as os from 'os';
import type { TierId } from '../pricing.generated';

// Offline-verifiable license keys (Ed25519 over a JSON payload).
//
// Key format: "<base64url(payload-json)>.<base64url(signature)>"
// Payload:    { tier, expiry: ISO date, email?, hwid? }
//
// Verification is fully local — no network round-trip. Production keys are
// issued out-of-band via scripts/issue-license.mjs (private key never lives
// in this repo). This module only ever holds the PUBLIC key.

// Production Ed25519 public key (SPKI, DER, base64). Generated for Kryleos
// Forge license signing — pair with LICENSE_SIGNING_KEY held by ops.
const PRODUCTION_PUBLIC_KEY_DER_B64 = 'MCowBQYDK2VwAyEAYkH563YX1tkzDZp0REOlEiTYWwkPWmM3B9MPoo2f6nU=';

const GRACE_DAYS = 3;

export interface LicensePayload {
  tier: TierId;
  expiry: string; // ISO date (yyyy-mm-dd or full ISO timestamp)
  email?: string;
  hwid?: string;
}

export type LicenseVerifyResult =
  | { ok: true; tier: TierId; expiry: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'hwid_mismatch' }
  | { ok: false; reason: 'expired'; expiry: string };

function getProductionPublicKey(): crypto.KeyObject {
  // Test-only override: lets HTTP-level tests verify the full activation flow
  // (including signature checks) against a throwaway keypair instead of the
  // production key, whose private half never lives in this repo. Only honored
  // under NODE_ENV=test (set automatically by vitest).
  const testKey = process.env.LICENSE_TEST_PUBLIC_KEY_DER_B64;
  if (process.env.NODE_ENV === 'test' && testKey) {
    return crypto.createPublicKey({
      key: Buffer.from(testKey, 'base64'),
      format: 'der',
      type: 'spki'
    });
  }
  return crypto.createPublicKey({
    key: Buffer.from(PRODUCTION_PUBLIC_KEY_DER_B64, 'base64'),
    format: 'der',
    type: 'spki'
  });
}

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Stable per-machine identifier for optional HWID binding. Not a security
// boundary on its own (it's derivable), only a deterrent against casual
// key-sharing.
export function getMachineId(): string {
  const raw = `${os.hostname()}|${os.platform()}|${os.arch()}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function verifyLicenseKey(
  key: string,
  opts: { publicKey?: crypto.KeyObject; now?: Date } = {}
): LicenseVerifyResult {
  const publicKey = opts.publicKey ?? getProductionPublicKey();
  const now = opts.now ?? new Date();

  const parts = (key || '').trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'malformed' };
  }

  let payloadBuf: Buffer;
  let sigBuf: Buffer;
  let payload: LicensePayload;
  try {
    payloadBuf = b64urlDecode(parts[0]);
    sigBuf = b64urlDecode(parts[1]);
    payload = JSON.parse(payloadBuf.toString('utf-8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (!payload || typeof payload.tier !== 'string' || typeof payload.expiry !== 'string') {
    return { ok: false, reason: 'malformed' };
  }

  let signatureValid = false;
  try {
    signatureValid = crypto.verify(null, payloadBuf, publicKey, sigBuf);
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }
  if (!signatureValid) {
    return { ok: false, reason: 'bad_signature' };
  }

  const expiryDate = new Date(payload.expiry);
  if (Number.isNaN(expiryDate.getTime())) {
    return { ok: false, reason: 'malformed' };
  }
  const graceMs = GRACE_DAYS * 24 * 60 * 60 * 1000;
  if (now.getTime() > expiryDate.getTime() + graceMs) {
    return { ok: false, reason: 'expired', expiry: payload.expiry };
  }

  if (payload.hwid && payload.hwid !== getMachineId()) {
    return { ok: false, reason: 'hwid_mismatch' };
  }

  return { ok: true, tier: payload.tier as TierId, expiry: payload.expiry };
}

// Test/ops helper: signs a payload with the given Ed25519 private key,
// producing a key string in the same format verifyLicenseKey() consumes.
export function signLicensePayload(payload: LicensePayload, privateKey: crypto.KeyObject): string {
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf-8');
  const sigBuf = crypto.sign(null, payloadBuf, privateKey);
  return `${b64urlEncode(payloadBuf)}.${b64urlEncode(sigBuf)}`;
}
