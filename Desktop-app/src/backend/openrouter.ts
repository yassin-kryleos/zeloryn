import type { Message } from './deepseek';
import { streamOpenAiCompatibleChat } from './providerStream';

export interface OpenRouterConfig {
  apiKey: string;
  model: 'meta-llama/llama-3.3-70b-instruct' | 'qwen/qwen-2.5-coder-32b-instruct';
  baseUrl?: string;
}

export class OpenRouterClient {
  private config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    this.config = {
      baseUrl: 'https://openrouter.ai/api',
      ...config
    };
  }

  public setApiKey(apiKey: string) {
    this.config.apiKey = apiKey;
  }

  public setModel(model: 'meta-llama/llama-3.3-70b-instruct' | 'qwen/qwen-2.5-coder-32b-instruct') {
    this.config.model = model;
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
      baseUrl: this.config.baseUrl || 'https://openrouter.ai/api',
      model: this.config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      errorPrefix: 'OpenRouter API',
      extraHeaders: {
        'HTTP-Referer': 'https://github.com/Kryleos/kryleos-forge',
        'X-Title': 'Kryleos Forge'
      },
      onContentChunk: callbacks.onContentChunk,
      onComplete: (content) => callbacks.onComplete?.(content),
      onError: callbacks.onError,
    });
  }
}
