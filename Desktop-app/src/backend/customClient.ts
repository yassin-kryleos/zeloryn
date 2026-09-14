import type { Message } from './deepseek';
import { streamOpenAiCompatibleChat } from './providerStream';
import type { ChatClient } from './agents';

export interface CustomClientConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  providerName?: string;
  endpointPath?: string;
  extraHeaders?: Record<string, string>;
}

export class CustomOpenAiClient implements ChatClient {
  private config: CustomClientConfig;

  constructor(config: CustomClientConfig = {}) {
    this.config = {
      baseUrl: 'http://localhost:8000/v1',
      providerName: 'Custom Provider',
      ...config
    };
  }

  public setApiKey(apiKey: string) {
    this.config.apiKey = apiKey;
  }

  public setBaseUrl(baseUrl: string) {
    this.config.baseUrl = baseUrl;
  }

  public setModel(model: string) {
    this.config.model = model;
  }

  public setProviderName(name: string) {
    this.config.providerName = name;
  }

  public getModel(): string {
    return this.config.model || '';
  }

  public getBaseUrl(): string {
    return this.config.baseUrl || '';
  }

  public getProviderName(): string {
    return this.config.providerName || 'Custom Provider';
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
    const errorPrefix = this.config.providerName || 'Custom API';
    const baseUrl = this.config.baseUrl || 'http://localhost:8000/v1';
    const model = this.config.model || 'default';

    return streamOpenAiCompatibleChat({
      apiKey: this.config.apiKey || '',
      baseUrl,
      model,
      allowEmptyKey: true,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      errorPrefix,
      endpointPath: this.config.endpointPath,
      extraHeaders: this.config.extraHeaders,
      onContentChunk: callbacks.onContentChunk,
      onReasoningChunk: callbacks.onReasoningChunk,
      onComplete: (content, reasoning) => callbacks.onComplete?.(content, reasoning || ''),
      onError: callbacks.onError,
    });
  }
}
