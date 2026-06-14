import { describe, it, expect } from 'vitest';
import { redactSensitiveData } from './src/utils/redact';

describe('redactSensitiveData Utility', () => {
  it('should redact email addresses correctly', () => {
    const input = 'My email is test.user@gmail.com, please contact me.';
    const expected = 'My email is [REDACTED_EMAIL], please contact me.';
    expect(redactSensitiveData(input)).toBe(expected);
  });

  it('should redact phone numbers correctly', () => {
    const input = 'My phone number is +1-555-0199 or 555-555-5555.';
    const expected = 'My phone number is [REDACTED_PHONE] or [REDACTED_PHONE].';
    expect(redactSensitiveData(input)).toBe(expected);
  });

  it('should redact hosted API keys correctly', () => {
    const openaiKey = 'Here is the key sk-proj-1234567890abcdefABCDEF1234567890abcdef';
    const expectedOpenai = 'Here is the key [REDACTED_API_KEY]';
    expect(redactSensitiveData(openaiKey)).toBe(expectedOpenai);

    const anthropicKey = 'My Anthropic key: sk-ant-sid-1234567890abcdefABCDEF1234567890abcdef';
    const expectedAnthropic = 'My Anthropic key: [REDACTED_API_KEY]';
    expect(redactSensitiveData(anthropicKey)).toBe(expectedAnthropic);

    const googleKey = 'Google Key is AIzaSy1234567890abcdefABCDEF1234567890abcdef';
    const expectedGoogle = 'Google Key is [REDACTED_API_KEY]';
    expect(redactSensitiveData(googleKey)).toBe(expectedGoogle);
  });

  it('should leave normal non-sensitive messages unchanged', () => {
    const input = 'This is a normal query about database indices.';
    expect(redactSensitiveData(input)).toBe(input);
  });
});
