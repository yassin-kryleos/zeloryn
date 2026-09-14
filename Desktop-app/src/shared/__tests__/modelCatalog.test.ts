import { describe, it, expect } from 'vitest';
import {
  getDefaultCatalog,
  resolveModelForRole,
  autoAssignRoles,
  getModelDefinition,
  calculateModelCost,
  type ActiveKeySet,
  type RoleModelMap
} from '../modelCatalog';

describe('modelCatalog', () => {
  it('loads bundled default models with Q3 2026 models', () => {
    const catalog = getDefaultCatalog();
    expect(catalog.length).toBeGreaterThan(10);
    expect(catalog.some(m => m.id === 'gemini-3.8-flash')).toBe(true);
    expect(catalog.some(m => m.id === 'claude-5-sonnet')).toBe(true);
    expect(catalog.some(m => m.id === 'gpt-6')).toBe(true);
    expect(catalog.some(m => m.id === 'deepseek-reasoner-v4')).toBe(true);
    expect(catalog.some(m => m.id === 'glm-5.2')).toBe(true);
  });

  it('resolves model for role using fallback cascade', () => {
    const master = 'claude-5-sonnet';
    const roleMap: Partial<RoleModelMap> = {
      coding: 'gpt-6',
      reasoning: 'inherit',
      research: ''
    };

    expect(resolveModelForRole('coding', roleMap, master)).toBe('gpt-6');
    expect(resolveModelForRole('reasoning', roleMap, master)).toBe('claude-5-sonnet');
    expect(resolveModelForRole('research', roleMap, master)).toBe('claude-5-sonnet');
    expect(resolveModelForRole('fast', roleMap, master)).toBe('claude-5-sonnet');
  });

  it('auto-assigns optimal roles when multi-provider keys are active', () => {
    const catalog = getDefaultCatalog();
    const activeKeys: ActiveKeySet = {
      anthropic: true,
      gemini: true,
      deepseek: true
    };

    const roster = autoAssignRoles(catalog, activeKeys);
    expect(roster.roles.coding).toBe('claude-5-sonnet');
    expect(roster.roles.reasoning).toBe('deepseek-reasoner-v4');
    expect(roster.roles.research).toBe('gemini-3.8-flash');
    expect(roster.roles.fast).toBe('gemini-3.8-flash');
  });

  it('auto-assigns local models when only Ollama is active', () => {
    const catalog = getDefaultCatalog();
    const activeKeys: ActiveKeySet = {
      ollama: true
    };

    const roster = autoAssignRoles(catalog, activeKeys);
    expect(roster.roles.coding).toBe('ollama:qwen2.5-coder');
    expect(roster.roles.reasoning).toBe('ollama:deepseek-r1');
    expect(roster.roles.chat).toBe('ollama:llama3.3');
  });

  it('correctly calculates costs across local and cloud models', () => {
    const catalog = getDefaultCatalog();
    // Local is $0
    const localCost = calculateModelCost('ollama:qwen2.5-coder', 1_000_000, 1_000_000, catalog);
    expect(localCost).toBe(0.0);

    // Claude 5 Sonnet: $3 in / $15 out per 1M tokens
    const claudeCost = calculateModelCost('claude-5-sonnet', 1_000_000, 1_000_000, catalog);
    expect(claudeCost).toBe(18.0);

    // Custom pricing override
    const customCost = calculateModelCost('custom:my-model', 1_000_000, 1_000_000, catalog, {
      'custom:my-model': { input: 1.0, output: 2.0 }
    });
    expect(customCost).toBe(3.0);
  });
});
