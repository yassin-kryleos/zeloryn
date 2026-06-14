import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const homeDir = process.env.USERPROFILE || process.env.HOME || process.cwd();
const PRIVATE_KEY_PATH = path.join(homeDir, '.kryleos_approval_private.pem');
const PUBLIC_KEY_PATH = path.join(homeDir, '.kryleos_approval_public.pem');

export function ensureApprovalKeys() {
  if (!fs.existsSync(PRIVATE_KEY_PATH) || !fs.existsSync(PUBLIC_KEY_PATH)) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
    fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, 'utf-8');
    fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, 'utf-8');
  }
}

export function getPublicKey(): string {
  ensureApprovalKeys();
  return fs.readFileSync(PUBLIC_KEY_PATH, 'utf-8');
}

export function getPrivateKey(): string {
  ensureApprovalKeys();
  return fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8');
}

export function signCommandApproval(commandId: string, command: string, privateKey: string): string {
  const data = `${commandId}:${command}`;
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  sign.end();
  return sign.sign(privateKey, 'base64');
}

export function verifyCommandApproval(commandId: string, command: string, signature: string, publicKey: string): boolean {
  try {
    const data = `${commandId}:${command}`;
    const verify = crypto.createVerify('SHA256');
    verify.update(data);
    verify.end();
    return verify.verify(publicKey, signature, 'base64');
  } catch (e) {
    return false;
  }
}

// Signs an arbitrary payload string with the desktop's RSA approval key, for
// desktop -> companion messages (e.g. command_approval_required) so a paired
// phone can verify they originated from this desktop.
export function signPayload(payload: string): string {
  const sign = crypto.createSign('SHA256');
  sign.update(payload);
  sign.end();
  return sign.sign(getPrivateKey(), 'base64');
}

// Verifies a companion-originated message signed with Ed25519. The device's
// public key is stored (deviceRegistry.ts) as the raw 32-byte key, base64url
// encoded — the format @noble/ed25519 (the RN-side signer) produces directly.
// Node's crypto can import that as a JWK without any DER wrapping.
export function verifyEd25519Signature(rawPublicKeyB64Url: string, message: string, signatureB64: string): boolean {
  try {
    const keyObject = crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: rawPublicKeyB64Url },
      format: 'jwk'
    });
    return crypto.verify(null, Buffer.from(message), keyObject, Buffer.from(signatureB64, 'base64'));
  } catch (e) {
    return false;
  }
}
