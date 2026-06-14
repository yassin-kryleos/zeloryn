import { describe, it, expect } from 'vitest';
import { scanSecrets } from '../secretScanner';

describe('secretScanner', () => {
  it('should detect OpenAI API keys', () => {
    const text = 'Here is my key: sk-proj-123456789012345678901234';
    const results = scanSecrets(text);
    expect(results).toHaveLength(1);
    expect(results[0].secretType).toBe('OpenAI API Key');
    expect(results[0].foundText).toBe('sk-proj-...');
  });

  it('should detect Anthropic API keys', () => {
    const text = 'Some text sk-ant-abcdefghijklmnopqrstuvwx';
    const results = scanSecrets(text);
    expect(results).toHaveLength(1);
    expect(results[0].secretType).toBe('Anthropic API Key');
    expect(results[0].foundText).toBe('sk-ant-a...');
  });

  it('should detect Google Gemini API keys', () => {
    const text = 'AIzaSyabcdefghijklmnopqrstuvwxyz1234567 is my key';
    const results = scanSecrets(text);
    expect(results).toHaveLength(1);
    expect(results[0].secretType).toBe('Google API Key');
  });

  it('should detect private keys', () => {
    const text = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0y6...\n-----END RSA PRIVATE KEY-----';
    const results = scanSecrets(text);
    expect(results).toHaveLength(1);
    expect(results[0].secretType).toBe('Private Key');
  });

  it('should detect generic passwords or tokens', () => {
    const text = 'const db_password = "mySecretPassword123"';
    const results = scanSecrets(text);
    expect(results).toHaveLength(1);
    expect(results[0].secretType).toBe('Generic Password/Token Assignment');
    expect(results[0].foundText).toBe('mySecret...');
  });

  it('should not detect benign text', () => {
    const text = 'This is a normal paragraph with standard code. const count = 10;';
    const results = scanSecrets(text);
    expect(results).toHaveLength(0);
  });
});
