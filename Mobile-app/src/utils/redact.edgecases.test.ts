/**
 * PII redaction edge-case audit (Mobile companion).
 *
 * redactSensitiveData() runs before offline notes are synced to the desktop
 * (SYNC_PLANNING_NOTES → scratchbook). These tests exercise the real exported
 * function against edge cases and document gaps as `it.fails`.
 *
 * Pass/fail: green = the redactor behaves as asserted. The `it.fails` cases mark
 * PII types that leak today; flip them to `it` when the redactor is hardened.
 */
import { describe, it, expect } from 'vitest';
import { redactSensitiveData } from './redact';

describe('redactSensitiveData — confirmed behavior', () => {
  it('redacts a bare email', () => {
    expect(redactSensitiveData('contact me at jane.doe@example.com'))
      .toContain('[REDACTED_EMAIL]');
  });

  it('redacts an OpenAI-style key', () => {
    expect(redactSensitiveData('key sk-1234567890abcdef1234567890'))
      .toContain('[REDACTED_API_KEY]');
  });

  it('redacts an Anthropic key', () => {
    expect(redactSensitiveData('sk-ant-1234567890abcdefghijklmnop'))
      .toContain('[REDACTED_API_KEY]');
  });

  it('redacts a Google key', () => {
    expect(redactSensitiveData('AIzaSy1234567890abcdefghijklmnopqrst'))
      .toContain('[REDACTED_API_KEY]');
  });

  it('redacts a phone number with 7+ digits', () => {
    expect(redactSensitiveData('call +1 (555) 123-4567')).toContain('[REDACTED_PHONE]');
  });

  it('leaves benign text untouched', () => {
    const benign = 'Refactor the parser and add a unit test.';
    expect(redactSensitiveData(benign)).toBe(benign);
  });

  it('redacts multiple PII items in one string', () => {
    const out = redactSensitiveData('me@x.io and sk-aaaaaaaaaaaaaaaaaaaaaa');
    expect(out).toContain('[REDACTED_EMAIL]');
    expect(out).toContain('[REDACTED_API_KEY]');
  });

  it('does not redact a short number (e.g. a 4-digit year)', () => {
    expect(redactSensitiveData('shipped in 2026')).toBe('shipped in 2026');
  });
});

describe('redactSensitiveData — incidental masking (correct privacy, wrong label)', () => {
  // Credit-card and SSN digit runs are caught by the PHONE regex (>=7 digits),
  // so they ARE masked — but mislabeled as [REDACTED_PHONE]. Privacy is
  // preserved; the type label is wrong. Documented, not a leak.
  it('masks a 16-digit credit-card number (as PHONE — mislabeled but redacted)', () => {
    const out = redactSensitiveData('card 4111 1111 1111 1111');
    expect(out).toContain('[REDACTED_PHONE]');
    expect(out).not.toContain('4111');
  });

  it('masks a US SSN (as PHONE — mislabeled but redacted)', () => {
    const out = redactSensitiveData('ssn 123-45-6789');
    expect(out).toContain('[REDACTED_PHONE]');
    expect(out).not.toContain('6789');
  });
});

describe('redactSensitiveData — AWS access key redaction (SEC-PII-01, fixed)', () => {
  it('redacts AWS access keys (AKIA…)', () => {
    expect(redactSensitiveData('AKIAIOSFODNN7EXAMPLE')).toContain('[REDACTED');
    expect(redactSensitiveData('AKIAIOSFODNN7EXAMPLE')).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('redacts temporary/STS access keys (ASIA…)', () => {
    expect(redactSensitiveData('ASIAIOSFODNN7EXAMPLE')).toContain('[REDACTED');
  });

  it('leaves ordinary uppercase words untouched', () => {
    expect(redactSensitiveData('THIS IS A NORMAL SENTENCE')).toBe('THIS IS A NORMAL SENTENCE');
  });
});
