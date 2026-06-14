// Device identity for the companion pairing handshake (Phase 5.2/5.3).
//
// Generates an Ed25519 keypair and signs the canonical
// `${deviceId}:${type}:${itemId}:${nonce}` message format that
// Desktop-app/src/backend/security.ts's verifyEd25519Signature() checks.
// The public key is encoded as the raw 32-byte key, base64url (the JWK
// `x` value) - exactly what Node's `crypto.createPublicKey({format:'jwk'})`
// expects, so no DER wrapping or extra dependency is needed on either side.
//
// NOTE: on-device this relies on `globalThis.crypto.getRandomValues` (used
// internally by @noble/ed25519 for key/nonce generation). React Native does
// not provide this without `react-native-get-random-values` - that polyfill
// must be imported once at app entry before this module is used. Vitest's
// Node environment provides it natively, so unit tests below pass without it.

import * as ed from '@noble/ed25519';
import * as forge from 'node-forge';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const triplet = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
    result += BASE64_CHARS[(triplet >> 18) & 0x3f];
    result += BASE64_CHARS[(triplet >> 12) & 0x3f];
    result += b1 === undefined ? '=' : BASE64_CHARS[(triplet >> 6) & 0x3f];
    result += b2 === undefined ? '=' : BASE64_CHARS[triplet & 0x3f];
  }
  return result;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function utf8Encode(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return bytes;
}

export interface DeviceKeypair {
  // Raw 32-byte Ed25519 public key, base64url-encoded (JWK `x` value).
  // Sent to the desktop in PAIR_DEVICE and stored in its device registry.
  publicKey: string;
  // Raw 32-byte Ed25519 secret key seed. Must be persisted securely
  // (e.g. expo-secure-store) and never sent off-device.
  privateKey: Uint8Array;
}

export async function generateDeviceKeypair(): Promise<DeviceKeypair> {
  const privateKey = ed.utils.randomSecretKey();
  const publicKeyBytes = await ed.getPublicKeyAsync(privateKey);
  return { publicKey: bytesToBase64Url(publicKeyBytes), privateKey };
}

// Canonical message format signed for every state-changing companion
// message. `itemId` is the commandId for APPROVE_COMMAND/REJECT_COMMAND, or
// the sessionId (falling back to 'global_session') for STOP_WORKFLOW.
export function buildSignedMessage(deviceId: string, type: string, itemId: string, nonce: string): string {
  return `${deviceId}:${type}:${itemId}:${nonce}`;
}

export async function signMessage(privateKey: Uint8Array, message: string): Promise<string> {
  const signatureBytes = await ed.signAsync(utf8Encode(message), privateKey);
  return bytesToBase64(signatureBytes);
}

// Single-use nonce for replay protection (desktop enforces a 5-min TTL).
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

// Verifies a desktop-originated message (e.g. `command_approval_required`)
// against the RSA-SHA256 signature produced by
// Desktop-app/src/backend/security.ts's signPayload(), using the
// desktopPublicKey (SPKI PEM) received at PAIR_DEVICE. Returns false on any
// malformed input rather than throwing, so a tampered/missing signature is
// treated as "not from the desktop" instead of crashing the message handler.
export function verifyDesktopSignature(desktopPublicKeyPem: string, payload: string, signatureB64: string): boolean {
  try {
    const publicKey = forge.pki.publicKeyFromPem(desktopPublicKeyPem);
    const md = forge.md.sha256.create();
    md.update(payload, 'utf8');
    return publicKey.verify(md.digest().bytes(), forge.util.decode64(signatureB64));
  } catch {
    return false;
  }
}
