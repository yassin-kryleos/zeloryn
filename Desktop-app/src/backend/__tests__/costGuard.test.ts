import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { 
  estimateTokens, 
  estimateCost, 
  getProviderForModel, 
  getPricingForModel, 
  CostGuard 
} from '../costGuard';

describe('CostGuard Token & Cost Utilities', () => {
  it('should estimate tokens correctly as characters / 4', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });

  it('should retrieve correct provider names', () => {
    expect(getProviderForModel('deepseek-chat')).toBe('DeepSeek');
    expect(getProviderForModel('gpt-4o-mini')).toBe('OpenAI');
    expect(getProviderForModel('claude-3-5-sonnet-latest')).toBe('Anthropic');
    expect(getProviderForModel('gemini-2.5-flash')).toBe('Google Gemini');
    expect(getProviderForModel('ollama:qwen2.5-coder')).toBe('Ollama (Local)');
  });

  it('should return 0 pricing for local models', () => {
    const localPricing = getPricingForModel('ollama:llama3');
    expect(localPricing.input).toBe(0);
    expect(localPricing.output).toBe(0);
    expect(estimateCost('hello', 'ollama:llama3', false)).toBe(0);
  });

  it('should return correct pricing for known models', () => {
    // Claude 3.5 Sonnet: input 3.00 per 1M, output 15.00 per 1M
    const pricing = getPricingForModel('claude-3-5-sonnet-latest');
    expect(pricing.input).toBe(3.00 / 1000000);
    expect(pricing.output).toBe(15.00 / 1000000);

    // estimateCost for 'a'.repeat(400) -> 100 tokens. input -> 100 * 3.00/1M = 0.0003
    const cost = estimateCost('a'.repeat(400), 'claude-3-5-sonnet-latest', false);
    expect(cost).toBeCloseTo(0.0003, 6);
  });
});

describe('CostGuard Class', () => {
  const testWorkspace = path.resolve(process.cwd(), 'scratch/test_workspace_cost');

  beforeEach(() => {
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(testWorkspace, { recursive: true });
  });

  it('should write and retrieve cost records correctly', async () => {
    const costGuard = new CostGuard(testWorkspace);
    const history1 = await costGuard.getHistory();
    expect(history1).toEqual([]);

    await costGuard.addRecord({
      sessionId: 'session_123',
      model: 'gpt-4o-mini',
      provider: 'OpenAI',
      inputTokens: 100,
      outputTokens: 200,
      cost: 0.0005,
      tokenSavings: 20
    });

    const history2 = await costGuard.getHistory();
    expect(history2.length).toBe(1);
    expect(history2[0].sessionId).toBe('session_123');
    expect(history2[0].cost).toBe(0.0005);

    const stats = await costGuard.getStatsBySession('session_123');
    expect(stats.totalCost).toBe(0.0005);
    expect(stats.totalTokens).toBe(300);
    expect(stats.savings).toBe(20);
    expect(stats.breakdownByModel['gpt-4o-mini'].cost).toBe(0.0005);
  });
});
