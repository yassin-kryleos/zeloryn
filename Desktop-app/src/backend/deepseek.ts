import { streamOpenAiCompatibleChat } from './providerStream';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning_content?: string;
}

export interface DeepSeekConfig {
  apiKey: string;
  model: 'deepseek-chat' | 'deepseek-reasoner';
  baseUrl?: string;
  temperature?: number;
  thinkingCapability?: 'low' | 'medium' | 'high' | 'ultra';
}

export class DeepSeekClient {
  private config: DeepSeekConfig;

  constructor(config: DeepSeekConfig) {
    this.config = {
      baseUrl: 'https://api.deepseek.com',
      temperature: config.model === 'deepseek-reasoner' ? undefined : 0.2, // R1 doesn't support custom temp
      ...config
    };
  }

  public setApiKey(apiKey: string) {
    this.config.apiKey = apiKey;
  }

  public setModel(model: 'deepseek-chat' | 'deepseek-reasoner') {
    this.config.model = model;
    this.config.temperature = model === 'deepseek-reasoner' ? undefined : 0.2;
  }

  public setThinkingCapability(capability: 'low' | 'medium' | 'high' | 'ultra') {
    this.config.thinkingCapability = capability;
  }

  public chatStream(
    messages: Message[],
    callbacks: {
      onReasoningChunk?: (chunk: string) => void;
      onContentChunk?: (chunk: string) => void;
      onComplete?: (fullContent: string, fullReasoning: string) => void;
      onError?: (err: Error) => void;
    }
  ): Promise<void> {
    return streamOpenAiCompatibleChat({
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl || 'https://api.deepseek.com',
      endpointPath: '/chat/completions',
      model: this.config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      errorPrefix: 'DeepSeek API',
      extraBody: this.config.temperature !== undefined ? { temperature: this.config.temperature } : undefined,
      onReasoningChunk: callbacks.onReasoningChunk,
      onContentChunk: callbacks.onContentChunk,
      onComplete: callbacks.onComplete,
      onError: callbacks.onError,
    });
  }
}
