import { describe, expect, it } from 'vitest';
import { hostedProviderForModel } from './providerDisclosure';

describe('hostedProviderForModel', () => {
  it('treats Ollama and known local models as local', () => {
    expect(hostedProviderForModel('ollama:qwen2.5:7b')).toBeNull();
    expect(hostedProviderForModel('llama3')).toBeNull();
    expect(hostedProviderForModel('qwen2.5-coder')).toBeNull();
    expect(hostedProviderForModel('')).toBeNull();
  });

  it('maps hosted model prefixes to their provider', () => {
    expect(hostedProviderForModel('deepseek-chat')).toBe('DeepSeek');
    expect(hostedProviderForModel('gemini-2.5-flash')).toBe('Google Gemini');
    expect(hostedProviderForModel('gpt-4o-mini')).toBe('OpenAI');
    expect(hostedProviderForModel('claude-3-5-sonnet-latest')).toBe('Anthropic');
    expect(hostedProviderForModel('meta-llama/llama-3.3-70b-instruct')).toBe('OpenRouter');
    expect(hostedProviderForModel('qwen/qwen-2.5-coder-32b-instruct')).toBe('OpenRouter');
  });

  it('falls back to a generic hosted label for unknown models', () => {
    expect(hostedProviderForModel('mystery-model')).toBe('Hosted provider');
  });
});
