/**
 * Secret-scanner COVERAGE audit (QA finding M3).
 *
 * Goal: pin down exactly what the production secret scanner does and does NOT
 * detect, so the gap is visible and regression-tested. Tests in the "detects"
 * block assert real, working behavior (green = good). Tests in the
 * "KNOWN GAPS" block use `it.fails` — they pass *because* the scanner currently
 * misses the secret, turning each gap into an explicit, tracked assertion.
 * When the scanner is hardened, the corresponding `it.fails` will start FAILING,
 * prompting the author to flip it to a normal `it`. That is the intended signal.
 *
 * Pass/fail: `npm test` stays green while the gaps exist; flips red the moment a
 * gap is closed (telling us to update the test) — never silently stale.
 */
import { describe, it, expect } from 'vitest';
import { scanSecrets } from '../secretScanner';

describe('secretScanner — confirmed detections', () => {
  it('detects an OpenAI key', () => {
    expect(scanSecrets('key sk-proj-123456789012345678901234')[0]?.secretType)
      .toBe('OpenAI API Key');
  });

  it('detects an Anthropic key', () => {
    expect(scanSecrets('sk-ant-abcdefghijklmnopqrstuvwx')[0]?.secretType)
      .toBe('Anthropic API Key');
  });

  it('detects a Google API key', () => {
    expect(scanSecrets('AIzaSyabcdefghijklmnopqrstuvwxyz1234567')[0]?.secretType)
      .toBe('Google API Key');
  });

  it('detects a PEM private key header', () => {
    expect(scanSecrets('-----BEGIN RSA PRIVATE KEY-----')[0]?.secretType)
      .toBe('Private Key');
  });

  it('detects a generic password assignment', () => {
    expect(scanSecrets('const password = "hunter2hunter2"')[0]?.secretType)
      .toBe('Generic Password/Token Assignment');
  });

  it('does not flag benign text (no false positive)', () => {
    expect(scanSecrets('const total = subtotal + tax; // sum it up')).toHaveLength(0);
  });

  it('reports the line number of a finding', () => {
    const r = scanSecrets('line one\nline two sk-proj-abcdefghijklmnopqrstuvwx');
    expect(r[0]?.line).toBe(2);
  });

  it('truncates the matched secret to 8 chars + ellipsis (no full leak in report)', () => {
    const r = scanSecrets('sk-ant-abcdefghijklmnopqrstuvwx');
    expect(r[0]?.foundText.endsWith('...')).toBe(true);
    expect(r[0]?.foundText.length).toBeLessThanOrEqual(11);
  });
});

describe('secretScanner — expanded coverage (SEC-M3 fixed)', () => {
  it('detects AWS access key ids (AKIA…)', () => {
    const r = scanSecrets('AKIAIOSFODNN7EXAMPLE');
    expect(r.length).toBeGreaterThan(0);
    expect(r.some(x => x.secretType === 'AWS Access Key ID')).toBe(true);
  });

  it('detects GitHub tokens (ghp_…)', () => {
    const r = scanSecrets('ghp_1234567890abcdefghijklmnopqrstuvwxyz12');
    expect(r.some(x => x.secretType === 'GitHub Token')).toBe(true);
  });

  it('detects Stripe live keys (sk_live_…)', () => {
    const r = scanSecrets('sk_live_1234567890abcdefghijklmnop');
    expect(r.some(x => x.secretType === 'Stripe Live Key')).toBe(true);
  });

  it('detects Slack tokens (xoxb-…)', () => {
    const r = scanSecrets('xoxb-123456789012-1234567890123-abcdEFGHijklMNOPqrstUVWX');
    expect(r.some(x => x.secretType === 'Slack Token')).toBe(true);
  });

  it('detects JWTs (eyJ…)', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(scanSecrets(jwt).some(x => x.secretType === 'JWT')).toBe(true);
  });

  it('still does not flag benign code after expansion (no new false positives)', () => {
    expect(scanSecrets('const total = subtotal + tax; // AKIA is a prefix, not a key'))
      .toHaveLength(0);
  });
});
