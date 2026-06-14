import { describe, it, expect, beforeAll } from 'vitest';
import { getPublicKey, getPrivateKey, signCommandApproval, verifyCommandApproval, ensureApprovalKeys } from './security';

describe('Cryptographic command approval security gating', () => {
  beforeAll(() => {
    ensureApprovalKeys();
  });

  it('should generate valid PEM keys on ensure', () => {
    const pub = getPublicKey();
    const priv = getPrivateKey();
    expect(pub).toContain('BEGIN PUBLIC KEY');
    expect(priv).toContain('BEGIN PRIVATE KEY');
  });

  it('should sign and verify valid commands correctly', () => {
    const commandId = 'cmd_12345';
    const command = 'npm run test';
    const priv = getPrivateKey();
    const pub = getPublicKey();

    const signature = signCommandApproval(commandId, command, priv);
    expect(signature).toBeDefined();
    expect(typeof signature).toBe('string');

    const isValid = verifyCommandApproval(commandId, command, signature, pub);
    expect(isValid).toBe(true);
  });

  it('should reject validations with modified commands', () => {
    const commandId = 'cmd_12345';
    const command = 'npm run test';
    const priv = getPrivateKey();
    const pub = getPublicKey();

    const signature = signCommandApproval(commandId, command, priv);
    const isValid = verifyCommandApproval(commandId, 'npm run build', signature, pub);
    expect(isValid).toBe(false);
  });

  it('should reject validations with modified nonces', () => {
    const commandId = 'cmd_12345';
    const command = 'npm run test';
    const priv = getPrivateKey();
    const pub = getPublicKey();

    const signature = signCommandApproval(commandId, command, priv);
    const isValid = verifyCommandApproval('cmd_modified', command, signature, pub);
    expect(isValid).toBe(false);
  });
});
