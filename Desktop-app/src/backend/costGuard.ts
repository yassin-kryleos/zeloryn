import * as fs from 'fs';
import * as path from 'path';

export interface CostRecord {
  id: string;
  sessionId?: string;
  timestamp: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  tokenSavings: number;
}

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'deepseek-chat': { input: 0.14 / 1000000, output: 0.28 / 1000000 },
  'deepseek-reasoner': { input: 0.55 / 1000000, output: 2.19 / 1000000 },
  'gemini-2.0-flash': { input: 0.075 / 1000000, output: 0.30 / 1000000 },
  'gemini-2.5-flash': { input: 0.075 / 1000000, output: 0.30 / 1000000 },
  'gemini-2.5-pro': { input: 1.25 / 1000000, output: 5.00 / 1000000 },
  'gemini-3.5-flash': { input: 0.075 / 1000000, output: 0.30 / 1000000 },
  'gpt-4o': { input: 2.50 / 1000000, output: 10.00 / 1000000 },
  'gpt-4o-mini': { input: 0.15 / 1000000, output: 0.60 / 1000000 },
  'o3-mini': { input: 1.10 / 1000000, output: 4.40 / 1000000 },
  'o1': { input: 15.00 / 1000000, output: 60.00 / 1000000 },
  'claude-3-7-sonnet-latest': { input: 3.00 / 1000000, output: 15.00 / 1000000 },
  'claude-3-5-sonnet-latest': { input: 3.00 / 1000000, output: 15.00 / 1000000 },
  'claude-3-5-haiku-latest': { input: 0.80 / 1000000, output: 4.00 / 1000000 },
  'meta-llama/llama-3.3-70b-instruct': { input: 0.54 / 1000000, output: 0.54 / 1000000 },
  'qwen/qwen-2.5-coder-32b-instruct': { input: 0.40 / 1000000, output: 0.40 / 1000000 },
  // Default general fallback categories:
  'custom': { input: 0.14 / 1000000, output: 0.28 / 1000000 },
  'glm': { input: 0.14 / 1000000, output: 0.28 / 1000000 },
  'gemini': { input: 0.075 / 1000000, output: 0.30 / 1000000 },
  'gpt': { input: 0.15 / 1000000, output: 0.60 / 1000000 },
  'claude': { input: 3.00 / 1000000, output: 15.00 / 1000000 },
  'llama': { input: 0.54 / 1000000, output: 0.54 / 1000000 }
};

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function getProviderForModel(model: string): string {
  const m = model.toLowerCase();
  if (m.startsWith('ollama:') || m === 'llama3' || m === 'qwen2.5-coder') return 'Ollama (Local)';
  if (m.startsWith('custom:') || m.startsWith('glm') || m.startsWith('zlm')) return 'Custom Provider';
  if (m.startsWith('gemini')) return 'Google Gemini';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3')) return 'OpenAI';
  if (m.startsWith('claude')) return 'Anthropic';
  if (m.includes('/') || m.startsWith('meta-') || m.startsWith('qwen/')) return 'OpenRouter';
  if (m.startsWith('deepseek')) return 'DeepSeek';
  return 'Custom Provider';
}

export function getPricingForModel(model: string): { input: number; output: number } {
  const m = model.toLowerCase();
  if (m.startsWith('ollama:') || m === 'llama3' || m === 'qwen2.5-coder') {
    return { input: 0, output: 0 };
  }
  if (MODEL_PRICING[m]) return MODEL_PRICING[m];
  if (m.startsWith('custom:') || m.startsWith('glm') || m.startsWith('zlm')) return MODEL_PRICING['custom'];
  if (m.startsWith('gemini')) return MODEL_PRICING['gemini'];
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3')) return MODEL_PRICING['gpt'];
  if (m.startsWith('claude')) return MODEL_PRICING['claude'];
  if (m.includes('llama')) return MODEL_PRICING['llama'];
  return MODEL_PRICING['custom']; // Fallback
}

export function estimateCost(text: string, model: string, isOutput: boolean = false): number {
  const tokens = estimateTokens(text);
  const pricing = getPricingForModel(model);
  const rate = isOutput ? pricing.output : pricing.input;
  return tokens * rate;
}

export interface SpendCapConfig {
  enabled: boolean;
  maxProjectSpend?: number;
  maxDailySpend?: number;
}

export class CostGuard {
  private workspaceRoot: string;
  // SEC-M5: serialize read-modify-write ops on cost_history.json / spend_cap.json
  // so concurrent card executions cannot lost-update each other's writes.
  private opChain: Promise<unknown> = Promise.resolve();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.opChain.then(fn, fn);
    this.opChain = result.then(() => undefined, () => undefined);
    return result;
  }

  private getHistoryFilePath(): string {
    return path.join(this.workspaceRoot, '.kryleos', 'cost_history.json');
  }

  private getSpendCapFilePath(): string {
    return path.join(this.workspaceRoot, '.kryleos', 'spend_cap.json');
  }

  public async getSpendCap(): Promise<SpendCapConfig> {
    const filePath = this.getSpendCapFilePath();
    try {
      if (!fs.existsSync(filePath)) {
        return { enabled: false };
      }
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { enabled: false };
    }
  }

  public async setSpendCap(cap: Partial<SpendCapConfig>): Promise<SpendCapConfig> {
    return this.runExclusive(async () => {
      const current = await this.getSpendCap();
      const updated: SpendCapConfig = {
        ...current,
        ...cap,
        enabled: cap.enabled !== undefined ? cap.enabled : (current.enabled ?? true)
      };
      const filePath = this.getSpendCapFilePath();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
      return updated;
    });
  }

  public async checkSpendCap(): Promise<{
    allowed: boolean;
    reason?: string;
    projectSpend: number;
    dailySpend: number;
    cap: SpendCapConfig;
  }> {
    const cap = await this.getSpendCap();
    const history = await this.getHistory();

    const projectSpend = history.reduce((sum, r) => sum + (r.cost || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const dailySpend = history
      .filter(r => (r.timestamp || '').slice(0, 10) === today)
      .reduce((sum, r) => sum + (r.cost || 0), 0);

    if (cap.enabled) {
      if (typeof cap.maxProjectSpend === 'number' && projectSpend >= cap.maxProjectSpend) {
        return {
          allowed: false,
          reason: `Project spend cap reached: $${projectSpend.toFixed(4)} >= $${cap.maxProjectSpend.toFixed(4)}. Further agent runs blocked.`,
          projectSpend,
          dailySpend,
          cap
        };
      }
      if (typeof cap.maxDailySpend === 'number' && dailySpend >= cap.maxDailySpend) {
        return {
          allowed: false,
          reason: `Daily spend cap reached: $${dailySpend.toFixed(4)} >= $${cap.maxDailySpend.toFixed(4)}. Further agent runs blocked today.`,
          projectSpend,
          dailySpend,
          cap
        };
      }
    }

    return { allowed: true, projectSpend, dailySpend, cap };
  }

  public async getHistory(): Promise<CostRecord[]> {
    const filePath = this.getHistoryFilePath();
    try {
      if (!fs.existsSync(filePath)) return [];
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content || '[]');
    } catch {
      return [];
    }
  }

  public async addRecord(record: Omit<CostRecord, 'id' | 'timestamp'>): Promise<CostRecord> {
    return this.runExclusive(async () => {
      const history = await this.getHistory();
      const newRecord: CostRecord = {
        ...record,
        id: `cost_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`,
        timestamp: new Date().toISOString()
      };
      history.push(newRecord);

      const filePath = this.getHistoryFilePath();
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, JSON.stringify(history, null, 2), 'utf-8');
      } catch (err) {
        console.error('Failed to save cost record:', err);
      }
      return newRecord;
    });
  }

  public async getStatsBySession(sessionId?: string): Promise<{
    totalCost: number;
    totalTokens: number;
    savings: number;
    breakdownByModel: Record<string, { cost: number; tokens: number }>;
    breakdownByProvider: Record<string, { cost: number; tokens: number }>;
  }> {
    const history = await this.getHistory();
    const filtered = sessionId ? history.filter(r => r.sessionId === sessionId) : history;
    
    let totalCost = 0;
    let totalTokens = 0;
    let savings = 0;
    const breakdownByModel: Record<string, { cost: number; tokens: number }> = {};
    const breakdownByProvider: Record<string, { cost: number; tokens: number }> = {};

    for (const r of filtered) {
      totalCost += r.cost;
      totalTokens += r.inputTokens + r.outputTokens;
      savings += r.tokenSavings;

      if (!breakdownByModel[r.model]) breakdownByModel[r.model] = { cost: 0, tokens: 0 };
      breakdownByModel[r.model].cost += r.cost;
      breakdownByModel[r.model].tokens += r.inputTokens + r.outputTokens;

      if (!breakdownByProvider[r.provider]) breakdownByProvider[r.provider] = { cost: 0, tokens: 0 };
      breakdownByProvider[r.provider].cost += r.cost;
      breakdownByProvider[r.provider].tokens += r.inputTokens + r.outputTokens;
    }

    return { totalCost, totalTokens, savings, breakdownByModel, breakdownByProvider };
  }
}
