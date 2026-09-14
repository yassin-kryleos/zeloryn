import defaultModelsData from './defaultModels.json';

export type ModelProvider = 'anthropic' | 'gemini' | 'openai' | 'deepseek' | 'custom' | 'ollama';

export type RoleSlot = 'chat' | 'reasoning' | 'coding' | 'review' | 'research' | 'fast';

export interface ModelPricing {
  input: number;  // $ per 1M tokens
  output: number; // $ per 1M tokens
}

export interface ModelDefinition {
  id: string;
  name: string;
  provider: ModelProvider;
  contextWindow: number;
  strengths: RoleSlot[];
  supportsTools: boolean;
  reasoningOnly?: boolean;
  pricing: ModelPricing;
  isCustom?: boolean;
  endpointUrl?: string;
}

export type RoleModelMap = Record<RoleSlot, string>;

export interface ActiveKeySet {
  anthropic?: boolean;
  gemini?: boolean;
  openai?: boolean;
  deepseek?: boolean;
  custom?: boolean;
  ollama?: boolean;
}

export const ROLE_SLOT_DESCRIPTIONS: Record<RoleSlot, { label: string; desc: string; icon: string }> = {
  chat: { label: 'Everyday Chat', desc: 'Main prompt, conversational questions, everyday tasks', icon: '💬' },
  reasoning: { label: 'Reasoning & Architecture', desc: 'Architecture decisions, deep logic, dependency resolution', icon: '🧠' },
  coding: { label: 'Developer / Coding', desc: 'Code writing, card execution, Forge developer agent', icon: '💻' },
  review: { label: 'Review & Diff Verification', desc: 'Post-execution review, diff audit, acceptance criteria', icon: '🔍' },
  research: { label: 'Research & Codebase Scanning', desc: 'Deep workspace reading, doc search, broad context', icon: '📚' },
  fast: { label: 'Fast / Triage / Scope Guard', desc: 'Scope guard, rapid classification, quick validations', icon: '⚡' }
};

export const DEFAULT_REMOTE_CATALOG_URL =
  'https://raw.githubusercontent.com/yassin-kryleos/zeloryn/main/models.json';

export function getDefaultCatalog(): ModelDefinition[] {
  return JSON.parse(JSON.stringify(defaultModelsData)) as ModelDefinition[];
}

/**
 * Sync remote models catalog from GitHub.
 * Returns updated catalog, or falls back to bundled defaults on network failure.
 */
export async function syncRemoteCatalog(
  url: string = DEFAULT_REMOTE_CATALOG_URL,
  zeroEgress: boolean = false
): Promise<{ models: ModelDefinition[]; fromRemote: boolean; error?: string }> {
  if (zeroEgress) {
    return { models: getDefaultCatalog(), fromRemote: false, error: 'Zero Egress mode active: remote sync skipped' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error('Invalid catalog format: expected array');
    }

    // Validate entries
    const validated: ModelDefinition[] = data.filter(
      (m: any) => m && typeof m.id === 'string' && typeof m.provider === 'string'
    ).map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      provider: m.provider,
      contextWindow: m.contextWindow || 128000,
      strengths: Array.isArray(m.strengths) ? m.strengths : ['chat'],
      supportsTools: m.supportsTools !== false,
      reasoningOnly: !!m.reasoningOnly,
      pricing: {
        input: typeof m.pricing?.input === 'number' ? m.pricing.input : 1.0,
        output: typeof m.pricing?.output === 'number' ? m.pricing.output : 3.0
      },
      isCustom: !!m.isCustom
    }));

    if (validated.length === 0) {
      throw new Error('No valid model definitions parsed');
    }

    return { models: validated, fromRemote: true };
  } catch (err: any) {
    return {
      models: getDefaultCatalog(),
      fromRemote: false,
      error: err?.message || 'Failed to fetch remote catalog'
    };
  }
}

/**
 * Resolves the active model ID for a specific role.
 * If the role is empty, 'inherit', or unset, it cascades to masterDefault.
 */
export function resolveModelForRole(
  role: RoleSlot,
  roleMap: Partial<RoleModelMap> | undefined,
  masterDefault: string
): string {
  if (!roleMap) return masterDefault;
  const configured = roleMap[role];
  if (!configured || configured === 'inherit' || configured === '') {
    return masterDefault;
  }
  return configured;
}

/**
 * Intelligent 1-click Auto-Assign algorithm:
 * Inspects active providers and assigns the best-suited model for each role.
 */
export function autoAssignRoles(
  availableModels: ModelDefinition[],
  activeProviders: ActiveKeySet,
  currentMaster?: string
): { masterDefault: string; roles: RoleModelMap } {
  // Filter models to only those whose provider has an active key or connection
  const activePool = availableModels.filter(m => {
    if (m.provider === 'ollama') return !!activeProviders.ollama;
    if (m.provider === 'anthropic') return !!activeProviders.anthropic;
    if (m.provider === 'gemini') return !!activeProviders.gemini;
    if (m.provider === 'openai') return !!activeProviders.openai;
    if (m.provider === 'deepseek') return !!activeProviders.deepseek;
    if (m.provider === 'custom') return !!activeProviders.custom;
    return false;
  });

  // Fallback to all models if no keys configured yet
  const pool = activePool.length > 0 ? activePool : availableModels;

  // Preference order per role
  const rolePreferenceOrder: Record<RoleSlot, string[]> = {
    coding: [
      'claude-5-sonnet',
      'claude-4.5-sonnet',
      'gpt-6',
      'gpt-5.6',
      'glm-5.2',
      'deepseek-v4',
      'gemini-3.5-pro',
      'ollama:qwen2.5-coder'
    ],
    reasoning: [
      'deepseek-reasoner-v4',
      'claude-5-opus',
      'gpt-6',
      'o3-mini',
      'gemini-3.5-pro',
      'ollama:deepseek-r1'
    ],
    research: [
      'gemini-3.8-flash',
      'gemini-3.5-pro',
      'gemini-3.5-flash',
      'claude-5-sonnet',
      'gpt-5.6',
      'ollama:llama3.3'
    ],
    review: [
      'claude-5-sonnet',
      'gpt-6',
      'gpt-5.6',
      'claude-5-opus',
      'glm-5.2',
      'gemini-3.5-pro'
    ],
    fast: [
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'claude-4.5-haiku',
      'gpt-5.5-mini',
      'glm-4-flash',
      'ollama:qwen2.5-coder'
    ],
    chat: [
      'gemini-3.8-flash',
      'claude-5-sonnet',
      'gpt-5.5',
      'glm-5',
      'deepseek-v4',
      'ollama:llama3.3'
    ]
  };

  const pickBestModel = (role: RoleSlot): string => {
    const preferences = rolePreferenceOrder[role];
    for (const prefId of preferences) {
      const match = pool.find(m => m.id === prefId);
      if (match) return match.id;
    }
    // Secondary match: strength tags
    const strengthMatch = pool.find(m => m.strengths.includes(role));
    if (strengthMatch) return strengthMatch.id;
    return pool[0]?.id || 'claude-5-sonnet';
  };

  // Determine master default: prefer currentMaster if still active, else coding pick
  const codingPick = pickBestModel('coding');
  const masterDefault = (currentMaster && pool.some(m => m.id === currentMaster))
    ? currentMaster
    : codingPick;

  return {
    masterDefault,
    roles: {
      coding: codingPick,
      reasoning: pickBestModel('reasoning'),
      research: pickBestModel('research'),
      review: pickBestModel('review'),
      fast: pickBestModel('fast'),
      chat: pickBestModel('chat')
    }
  };
}

/**
 * Finds a model definition from catalog or builds a safe synthetic entry for custom models.
 */
export function getModelDefinition(
  modelId: string,
  catalog: ModelDefinition[]
): ModelDefinition {
  const found = catalog.find(m => m.id.toLowerCase() === modelId.toLowerCase());
  if (found) return found;

  const isOllama = modelId.startsWith('ollama:') || modelId.includes('localhost');
  const isCustom = modelId.startsWith('custom:') || modelId.startsWith('glm') || modelId.startsWith('zlm');

  return {
    id: modelId,
    name: modelId,
    provider: isOllama ? 'ollama' : isCustom ? 'custom' : 'custom',
    contextWindow: 128000,
    strengths: ['chat'],
    supportsTools: true,
    reasoningOnly: modelId.includes('reasoner') || modelId.includes('r1'),
    pricing: {
      input: isOllama ? 0.0 : 2.0,
      output: isOllama ? 0.0 : 6.0
    },
    isCustom: true
  };
}

/**
 * 3-Tier cost calculation helper.
 */
export function calculateModelCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  catalog: ModelDefinition[],
  userCustomPricing?: Record<string, ModelPricing>
): number {
  if (modelId.startsWith('ollama:') || modelId.includes('localhost') || modelId.includes('127.0.0.1')) {
    return 0.0;
  }

  // Tier 1: User custom override for this exact model
  if (userCustomPricing && userCustomPricing[modelId]) {
    const p = userCustomPricing[modelId];
    return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
  }

  // Tier 2: Model catalog entry
  const def = getModelDefinition(modelId, catalog);
  return (inputTokens / 1_000_000) * def.pricing.input + (outputTokens / 1_000_000) * def.pricing.output;
}
