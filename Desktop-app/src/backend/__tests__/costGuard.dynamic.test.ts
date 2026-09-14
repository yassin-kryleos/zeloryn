import { describe, it, expect } from 'vitest';
import {
  getPricingForModel,
  registerCustomModelPricing,
  estimateCost,
  getProviderForModel
} from '../costGuard';

describe('Dynamic CostGuard Pricing with Q3 2026 Models', () => {
  it('identifies 2026 flagship providers and pricing', () => {
    expect(getProviderForModel('gemini-3.8-flash')).toBe('Google Gemini');
    expect(getProviderForModel('claude-5-sonnet')).toBe('Anthropic');
    expect(getProviderForModel('gpt-6')).toBe('OpenAI');
    expect(getProviderForModel('deepseek-v4')).toBe('DeepSeek');
    expect(getProviderForModel('glm-5.2')).toBe('Custom Provider');

    const pricing = getPricingForModel('gemini-3.8-flash');
    expect(pricing.input).toBeCloseTo(0.15 / 1000000);
    expect(pricing.output).toBeCloseTo(0.60 / 1000000);

    const claudePricing = getPricingForModel('claude-5-sonnet');
    expect(claudePricing.input).toBeCloseTo(3.00 / 1000000);
    expect(claudePricing.output).toBeCloseTo(15.00 / 1000000);
  });

  it('allows registering and using dynamic custom model pricing', () => {
    registerCustomModelPricing('custom:my-fine-tuned-llm', {
      input: 0.85,
      output: 2.50
    });

    const pricing = getPricingForModel('custom:my-fine-tuned-llm');
    expect(pricing.input).toBeCloseTo(0.85 / 1000000);
    expect(pricing.output).toBeCloseTo(2.50 / 1000000);

    // Estimate cost for 4000 chars (~1000 tokens)
    const sampleText = 'A'.repeat(4000);
    const cost = estimateCost(sampleText, 'custom:my-fine-tuned-llm', false);
    expect(cost).toBeCloseTo(0.00085);
  });

  it('keeps local models at zero cost', () => {
    expect(getPricingForModel('ollama:qwen2.5-coder')).toEqual({ input: 0, output: 0 });
    expect(getPricingForModel('http://localhost:11434/v1')).toEqual({ input: 0, output: 0 });
  });
});
