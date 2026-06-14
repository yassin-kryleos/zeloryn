/**
 * Secret scanner — extended edge-case coverage.
 *
 * secretScanner.coverage.test.ts already pins the happy-path detections
 * (OpenAI, Anthropic, Google, PEM key, generic password, AWS, GitHub,
 * Stripe live, Slack, JWT) and confirms truncation + line reporting.
 *
 * This file adds:
 *  - Alternative AWS prefixes (ASIA, AGPA, AIDA, AROA, ANPA, ANVA)
 *  - Alternative GitHub token prefixes (gho_, ghs_, ghu_, ghr_)
 *  - Stripe restricted-key variant (rk_live_)
 *  - Alternative Slack token types (xoxp-, xoxs-, xoxa-)
 *  - EC / PGP private key headers
 *  - Multi-line content (secret is not on line 1)
 *  - Multiple secrets in a single payload (all reported)
 *  - Context strings that SHOULD NOT trigger false positives
 */
import { describe, it, expect } from 'vitest';
import { scanSecrets } from '../secretScanner';

// ─── AWS alternative prefixes ─────────────────────────────────────────────────

describe('AWS access key — all valid prefixes', () => {
  const prefixes = ['AKIA', 'ASIA', 'AGPA', 'AIDA', 'AROA', 'ANPA', 'ANVA'];

  for (const prefix of prefixes) {
    it(`detects ${prefix}IOSFODNN7EXAMPLE as AWS Access Key ID`, () => {
      const r = scanSecrets(`${prefix}IOSFODNN7EXAMPLE`);
      expect(r.some(x => x.secretType === 'AWS Access Key ID')).toBe(true);
    });
  }
});

// ─── GitHub token alternative prefixes ───────────────────────────────────────

describe('GitHub tokens — all valid prefixes', () => {
  const prefixes = ['ghp', 'gho', 'ghs', 'ghu', 'ghr'];

  for (const prefix of prefixes) {
    it(`detects ${prefix}_... as GitHub Token`, () => {
      const token = `${prefix}_1234567890abcdefghijklmnopqrstuvwxyz12`;
      const r = scanSecrets(token);
      expect(r.some(x => x.secretType === 'GitHub Token')).toBe(true);
    });
  }
});

// ─── Stripe restricted key ────────────────────────────────────────────────────

describe('Stripe live key variants', () => {
  it('detects rk_live_ restricted key', () => {
    const r = scanSecrets('rk_live_abcdefghijklmnopqrstuvwxyz0123');
    expect(r.some(x => x.secretType === 'Stripe Live Key')).toBe(true);
  });

  it('does NOT flag sk_test_ keys (they are intentional in dev)', () => {
    const r = scanSecrets('sk_test_mock_key');
    const stripeFindings = r.filter(x => x.secretType === 'Stripe Live Key');
    expect(stripeFindings).toHaveLength(0);
  });
});

// ─── Slack alternative token types ───────────────────────────────────────────

describe('Slack tokens — all types', () => {
  it('detects xoxp- (user token)', () => {
    const r = scanSecrets('xoxp-123456789012-1234567890123-abcdEFGH12345678');
    expect(r.some(x => x.secretType === 'Slack Token')).toBe(true);
  });

  it('detects xoxs- (workspace token)', () => {
    const r = scanSecrets('xoxs-123456789012-1234567890123-abcdEFGH12345678');
    expect(r.some(x => x.secretType === 'Slack Token')).toBe(true);
  });

  it('detects xoxa- (app-level token)', () => {
    const r = scanSecrets('xoxa-123456789012-1234567890123-abcdEFGH12345678');
    expect(r.some(x => x.secretType === 'Slack Token')).toBe(true);
  });
});

// ─── Private key header variants ─────────────────────────────────────────────

describe('Private key header variants', () => {
  it('detects EC PRIVATE KEY header', () => {
    const r = scanSecrets('-----BEGIN EC PRIVATE KEY-----');
    expect(r.some(x => x.secretType === 'Private Key')).toBe(true);
  });

  it('detects plain PRIVATE KEY header (PKCS#8)', () => {
    const r = scanSecrets('-----BEGIN PRIVATE KEY-----');
    expect(r.some(x => x.secretType === 'Private Key')).toBe(true);
  });
});

// ─── Multi-line and embedded content ─────────────────────────────────────────

describe('Multi-line content scanning', () => {
  it('detects a secret on line 5 of a multi-line string', () => {
    const content = [
      'line 1: normal content',
      'line 2: const config = {}',
      'line 3: // setup',
      'line 4: const host = "localhost"',
      'line 5: const token = "ghp_abcdefghijklmnopqrstuvwxyz1234567890ab"',
      'line 6: module.exports = { host, token }',
    ].join('\n');
    const r = scanSecrets(content);
    expect(r.some(x => x.secretType === 'GitHub Token')).toBe(true);
    const finding = r.find(x => x.secretType === 'GitHub Token');
    expect(finding?.line).toBe(5);
  });

  it('reports all secrets when multiple are present in one payload', () => {
    const content = [
      'AKIAIOSFODNN7EXAMPLE',
      'ghp_abcdefghijklmnopqrstuvwxyz1234567890ab',
      'sk_live_abcdefghijklmnopqrstuvwxyz0123',
    ].join('\n');
    const r = scanSecrets(content);
    const types = r.map(x => x.secretType);
    expect(types).toContain('AWS Access Key ID');
    expect(types).toContain('GitHub Token');
    expect(types).toContain('Stripe Live Key');
  });
});

// ─── False positive guard ─────────────────────────────────────────────────────

describe('No false positives on benign content', () => {
  const benign = [
    'const total = subtotal + tax;',
    'AKIA is a name in Greek mythology',
    'xoxb is not a token without dashes',
    'ghp is a common abbreviation for "good housekeeping practice"',
    'rk_live_ needs more characters to match',
    'const apiVersion = "2025-01-27"',
    '// no secrets here, just comments',
  ];

  for (const line of benign) {
    it(`does not flag: "${line.slice(0, 50)}"`, () => {
      const r = scanSecrets(line);
      expect(r.filter(x =>
        x.secretType === 'AWS Access Key ID' ||
        x.secretType === 'GitHub Token' ||
        x.secretType === 'Stripe Live Key' ||
        x.secretType === 'Slack Token'
      )).toHaveLength(0);
    });
  }
});
