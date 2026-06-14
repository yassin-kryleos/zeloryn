import * as crypto from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import * as syncController from '../sync';
import { verifyLicenseKey, signLicensePayload } from '../license';

describe('Stripe Billing & License Activation System', () => {
  const testEmail = 'billing_test_user@example.com';
  let testUser: any;

  beforeEach(async () => {
    // The local sync DB persists in the user's home directory across runs, so
    // delete any leftover user first to guarantee a deterministic fresh free
    // user regardless of prior state.
    await syncController.deleteUser(testEmail);
    testUser = await syncController.register(testEmail, 'test-password-hash');
  });

  it('should register users with the default free subscription tier', async () => {
    expect(testUser.email).toBe(testEmail);
    expect(testUser.tier).toBe('free');
    expect(testUser.isPremium).toBe(false);
  });

  it('should successfully upgrade user subscription tier via subscribeByEmail', async () => {
    const updated = await syncController.subscribeByEmail(testEmail, 'founder');
    expect(updated.tier).toBe('founder');
    expect(updated.isPremium).toBe(true);

    const checkUser = await syncController.getUserByToken(updated.token);
    expect(checkUser).not.toBeNull();
    expect(checkUser?.tier).toBe('founder');
  });

  it('should successfully demote user tier back to free on subscription deletion', async () => {
    // 1. Upgrade user first
    await syncController.subscribeByEmail(testEmail, 'agency');
    
    // 2. Cancel/demote
    const updated = await syncController.subscribeByEmail(testEmail, 'free');
    expect(updated.tier).toBe('free');
    expect(updated.isPremium).toBe(false);
  });

  describe('Ed25519 offline license keys (license.ts)', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });

    it('accepts a validly-signed, unexpired key and reports its tier', () => {
      const key = signLicensePayload({ tier: 'founder', expiry: '2099-01-01' }, privateKey);
      const result = verifyLicenseKey(key, { publicKey: crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' }) });
      expect(result).toEqual({ ok: true, tier: 'founder', expiry: '2099-01-01' });
    });

    it('rejects a key signed by a different (untrusted) keypair', () => {
      const { privateKey: otherPrivateKey } = crypto.generateKeyPairSync('ed25519');
      const key = signLicensePayload({ tier: 'founder', expiry: '2099-01-01' }, otherPrivateKey);
      const result = verifyLicenseKey(key, { publicKey: crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' }) });
      expect(result).toEqual({ ok: false, reason: 'bad_signature' });
    });

    it('rejects an expired key beyond the grace window', () => {
      const key = signLicensePayload({ tier: 'founder', expiry: '2020-01-01' }, privateKey);
      const result = verifyLicenseKey(key, {
        publicKey: crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' }),
        now: new Date('2020-01-10'),
      });
      expect(result).toEqual({ ok: false, reason: 'expired', expiry: '2020-01-01' });
    });

    it('accepts an expired key still within the grace window', () => {
      const key = signLicensePayload({ tier: 'solo', expiry: '2020-01-01' }, privateKey);
      const result = verifyLicenseKey(key, {
        publicKey: crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' }),
        now: new Date('2020-01-02'),
      });
      expect(result).toEqual({ ok: true, tier: 'solo', expiry: '2020-01-01' });
    });

    it('rejects a malformed key string', () => {
      expect(verifyLicenseKey('not-a-license-key')).toEqual({ ok: false, reason: 'malformed' });
      expect(verifyLicenseKey('')).toEqual({ ok: false, reason: 'malformed' });
    });

    it('rejects a key bound to a different device (hwid mismatch)', () => {
      const key = signLicensePayload({ tier: 'agency', expiry: '2099-01-01', hwid: 'not-this-machine' }, privateKey);
      const result = verifyLicenseKey(key, { publicKey: crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' }) });
      expect(result).toEqual({ ok: false, reason: 'hwid_mismatch' });
    });

    it('verified tier can drive subscribeByEmail (activation path)', async () => {
      const key = signLicensePayload({ tier: 'founder', expiry: '2099-01-01' }, privateKey);
      const result = verifyLicenseKey(key, { publicKey: crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' }) });
      expect(result.ok).toBe(true);

      const user = await syncController.subscribeByEmail(testEmail, (result as { ok: true; tier: syncController.SubscriptionTier }).tier);
      expect(user.tier).toBe('founder');
      expect(user.isPremium).toBe(true);
    });
  });
});
