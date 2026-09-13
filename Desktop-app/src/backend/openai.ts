import type { Message } from './deepseek';
import { streamOpenAiCompatibleChat } from './providerStream';

export type OpenAIModel = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-5.5' | 'gpt-5.5-mini' | 'gpt-5.4';

export interface OpenAIConfig {
  apiKey: string;
  model: OpenAIModel;
  baseUrl?: string;
  thinkingCapability?: 'low' | 'medium' | 'high' | 'ultra';
}

export class OpenAIClient {
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = {
      baseUrl: 'https://api.openai.com',
      ...config
    };
  }

  public setApiKey(apiKey: string) {
    this.config.apiKey = apiKey;
  }

  public setModel(model: OpenAIModel) {
    this.config.model = model;
  }

  public setThinkingCapability(capability: 'low' | 'medium' | 'high' | 'ultra') {
    this.config.thinkingCapability = capability;
  }

  public chatStream(
    messages: Message[],
    callbacks: {
      onContentChunk?: (chunk: string) => void;
      onComplete?: (fullContent: string) => void;
      onError?: (err: Error) => void;
    }
  ): Promise<void> {
    return streamOpenAiCompatibleChat({
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl || 'https://api.openai.com',
      model: this.config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      errorPrefix: 'OpenAI API',
      extraBody: this.config.thinkingCapability
        ? { reasoning_effort: this.config.thinkingCapability === 'ultra' ? 'high' : this.config.thinkingCapability }
        : undefined,
      onContentChunk: callbacks.onContentChunk,
      onComplete: (content) => callbacks.onComplete?.(content),
      onError: callbacks.onError,
    });
  }
}
