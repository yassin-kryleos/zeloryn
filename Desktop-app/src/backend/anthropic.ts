import { IncomingMessage } from 'http';
import * as https from 'https';
import type { Message } from './deepseek';
import { handleHttpStreamError, streamSseLines } from './providerStream';

export interface AnthropicConfig {
  apiKey: string;
  model: 'claude-3-5-sonnet-latest' | 'claude-3-5-haiku-latest';
  baseUrl?: string;
}

export class AnthropicClient {
  private config: AnthropicConfig;

  constructor(config: AnthropicConfig) {
    this.config = {
      baseUrl: 'https://api.anthropic.com',
      ...config
    };
  }

  public setApiKey(apiKey: string) {
    this.config.apiKey = apiKey;
  }

  public setModel(model: 'claude-3-5-sonnet-latest' | 'claude-3-5-haiku-latest') {
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
        const err = new Error('Anthropic API Key is missing. Configure it in settings.');
        callbacks.onError?.(err);
        reject(err);
        return;
      }

      // Map messages: Anthropic doesn't allow 'system' in messages list
      const systemMsg = messages.find(m => m.role === 'system');
      const apiMessages = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
          content: m.content
        }));

      const postData = JSON.stringify({
        model: this.config.model,
        messages: apiMessages,
        max_tokens: 4096,
        stream: true,
        ...(systemMsg ? { system: systemMsg.content } : {})
      });

      const url = new URL(`${this.config.baseUrl}/v1/messages`);
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      let fullContent = '';

      const req = https.request(options, (res: IncomingMessage) => {
        if (handleHttpStreamError(res, 'Anthropic API Error', callbacks.onError, reject)) return;

        streamSseLines(res, (cleanedLine) => {
          if (cleanedLine.startsWith('event: ')) return;

          if (cleanedLine.startsWith('data: ')) {
            try {
              const jsonStr = cleanedLine.slice(6);
              const data = JSON.parse(jsonStr);

              // Anthropic SSE events include content_block_delta or message_delta
              if (data.type === 'content_block_delta' && data.delta?.text) {
                const content = data.delta.text;
                fullContent += content;
                callbacks.onContentChunk?.(content);
              }
            } catch {}
          }
        }, () => {
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
