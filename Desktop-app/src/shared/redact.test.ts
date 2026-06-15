import { describe, expect, it } from 'vitest';
import { redactSensitiveData } from './redact';

describe('redactSensitiveData', () => {
  it('redacts an email', () => {
    expect(redactSensitiveData('contact me at jane.doe@example.com')).toContain('[REDACTED_EMAIL]');
  });

  it('redacts a phone number with 7+ digits', () => {
    expect(redactSensitiveData('call +1 (555) 123-4567')).toContain('[REDACTED_PHONE]');
  });

  it('redacts an OpenAI-style key', () => {
    expect(redactSensitiveData('key sk-aaaaaaaaaaaaaaaaaaaaaa')).toContain('[REDACTED_API_KEY]');
  });

  it('redacts an AWS access key (AKIA...)', () => {
    const out = redactSensitiveData('AKIAIOSFODNN7EXAMPLE');
    expect(out).toContain('[REDACTED_API_KEY]');
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('redacts an AWS STS access key (ASIA...)', () => {
    expect(redactSensitiveData('ASIAIOSFODNN7EXAMPLE')).toContain('[REDACTED_API_KEY]');
  });

  it('leaves benign text untouched', () => {
    const benign = 'Refactor the parser and add a unit test.';
    expect(redactSensitiveData(benign)).toBe(benign);
  });
});
