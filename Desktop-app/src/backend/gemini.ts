import { GoogleGenAI } from '@google/genai';
import type { Message } from './deepseek';

export interface GeminiConfig {
  apiKey: string;
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro';
  useSearch?: boolean;
}

export class GeminiClient {
  private config: GeminiConfig;
  private ai: GoogleGenAI | null = null;

  constructor(config: GeminiConfig) {
    this.config = config;
    if (config.apiKey) {
      this.ai = new GoogleGenAI({ apiKey: config.apiKey });
    }
  }

  public setApiKey(apiKey: string) {
    this.config.apiKey = apiKey;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    } else {
      this.ai = null;
    }
  }

  public setModel(model: 'gemini-2.5-flash' | 'gemini-2.5-pro') {
    this.config.model = model;
  }

  public setUseSearch(useSearch: boolean) {
    this.config.useSearch = useSearch;
  }

  public async chatStream(
    messages: Message[],
    callbacks: {
      onReasoningChunk?: (chunk: string) => void;
      onContentChunk?: (chunk: string) => void;
      onComplete?: (fullContent: string, fullReasoning: string) => void;
      onError?: (err: Error) => void;
    }
  ): Promise<void> {
    if (!this.config.apiKey || !this.ai) {
      const err = new Error('Gemini API Key is missing. Configure it in the settings.');
      callbacks.onError?.(err);
      throw err;
    }

    try {
      // Map system role or regular messages to Gemini content format.
      // Gemini contents expect 'user' or 'model' roles.
      // A system instruction is typically passed as systemInstruction configuration.
      const systemMessage = messages.find(m => m.role === 'system');
      const chatHistory = messages.filter(m => m.role !== 'system');

      const contents = chatHistory.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      const config: any = {};
      if (systemMessage) {
        config.systemInstruction = systemMessage.content;
      }
      if (this.config.useSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const responseStream = await this.ai.models.generateContentStream({
        model: this.config.model,
        contents,
        config
      });

      let fullContent = '';
      let fullReasoning = '';

      for await (const chunk of responseStream) {
        // If there's candidate-level thinking/reasoning in future versions, handle it.
        // For now, grab the text.
        const text = chunk.text || '';
        if (text) {
          fullContent += text;
          callbacks.onContentChunk?.(text);
        }
      }

      callbacks.onComplete?.(fullContent, fullReasoning);
    } catch (err: any) {
      callbacks.onError?.(err);
      throw err;
    }
  }
}
