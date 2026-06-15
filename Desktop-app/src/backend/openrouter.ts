import { IncomingMessage } from 'http';
import * as https from 'https';
import type { Message } from './deepseek';
import { handleHttpStreamError, streamSseLines } from './providerStream';

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
    return new Promise<void>((resolve, reject) => {
      if (!this.config.apiKey) {
        const err = new Error('OpenRouter API Key is missing. Configure it in settings.');
        callbacks.onError?.(err);
        reject(err);
        return;
      }

      const postData = JSON.stringify({
        model: this.config.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true
      });

      const url = new URL(`${this.config.baseUrl}/v1/chat/completions`);
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': 'https://github.com/Kryleos/kryleos-forge',
          'X-Title': 'Kryleos Forge',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      let fullContent = '';

      const req = https.request(options, (res: IncomingMessage) => {
        if (handleHttpStreamError(res, 'OpenRouter API Error', callbacks.onError, reject)) return;

        streamSseLines(res, (cleanedLine) => {
          if (cleanedLine === 'data: [DONE]') return;

          if (cleanedLine.startsWith('data: ')) {
            try {
              const jsonStr = cleanedLine.slice(6);
              const data = JSON.parse(jsonStr);
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                callbacks.onContentChunk?.(content);
              }
            } catch {}
          }
        }, (buffer) => {
          if (buffer && buffer.startsWith('data: ')) {
            try {
              const data = JSON.parse(buffer.slice(6));
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                callbacks.onContentChunk?.(content);
              }
            } catch {}
          }
          callbacks.onComplete?.(fullContent);
          resolve();
        });
      });

      req.on('error', (err) => {
        callbacks.onError?.(err);
        reject(err);
      });

      req.write(postData);
      req.end();
    });
  }
}
