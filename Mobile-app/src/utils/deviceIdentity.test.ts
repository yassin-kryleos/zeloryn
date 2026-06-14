/// <reference types="node" />
import * as crypto from 'crypto';
import { describe, it, expect } from 'vitest';
import { generateDeviceKeypair, buildSignedMessage, signMessage, generateNonce } from './deviceIdentity';

// Mirrors Desktop-app/src/backend/security.ts's verifyEd25519Signature(),
// so these tests prove the mobile signer is compatible with the desktop
// verifier without needing to spin up the desktop backend.
function verifyEd25519Signature(rawPublicKeyB64Url: string, message: string, signatureB64: string): boolean {
  const keyObject = crypto.createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: rawPublicKeyB64Url },
    format: 'jwk',
  });
  return crypto.verify(null, Buffer.from(message), keyObject, Buffer.from(signatureB64, 'base64'));
}

describe('deviceIdentity', () => {
  it('generates a keypair with a 32-byte raw base64url public key', async () => {
    const { publicKey, privateKey } = await generateDeviceKeypair();
    expect(privateKey.length).toBe(32);
    expect(publicKey).not.toMatch(/[+/=]/);
    expect(Buffer.from(publicKey, 'base64url').length).toBe(32);
  });

  it('signs a message verifiable by the desktop Ed25519 verifier', async () => {
    const { publicKey, privateKey } = await generateDeviceKeypair();
    const nonce = generateNonce();
    const message = buildSignedMessage('phone-1', 'STOP_WORKFLOW', 'global_session', nonce);
    const signature = await signMessage(privateKey, message);

    expect(verifyEd25519Signature(publicKey, message, signature)).toBe(true);
  });

  it('rejects a signature from a different keypair', async () => {
    const { privateKey } = await generateDeviceKeypair();
    const { publicKey: otherPublicKey } = await generateDeviceKeypair();
    const nonce = generateNonce();
    const message = buildSignedMessage('phone-1', 'STOP_WORKFLOW', 'global_session', nonce);
    const signature = await signMessage(privateKey, message);

    expect(verifyEd25519Signature(otherPublicKey, message, signature)).toBe(false);
  });

  it('rejects a tampered message', async () => {
    const { publicKey, privateKey } = await generateDeviceKeypair();
    const nonce = generateNonce();
    const message = buildSignedMessage('phone-1', 'APPROVE_COMMAND', 'cmd-1', nonce);
    const signature = await signMessage(privateKey, message);

    const tampered = buildSignedMessage('phone-1', 'APPROVE_COMMAND', 'cmd-2', nonce);
    expect(verifyEd25519Signature(publicKey, tampered, signature)).toBe(false);
  });

  it('generateNonce returns a fresh, >=8-char string each call', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a).not.toBe(b);
  });
});
