import { IncomingMessage } from 'http';
import * as https from 'https';
import type { Message } from './deepseek';

export interface OpenAIConfig {
  apiKey: string;
  model: 'gpt-4o' | 'gpt-4o-mini';
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

  public setModel(model: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-5.5' | 'gpt-5.5-mini' | 'gpt-5.4' | string) {
    this.config.model = model as any;
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
    return new Promise<void>((resolve, reject) => {
      if (!this.config.apiKey) {
        const err = new Error('OpenAI API Key is missing. Configure it in settings.');
        callbacks.onError?.(err);
        reject(err);
        return;
      }

      const postData = JSON.stringify({
        model: this.config.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        ...(this.config.thinkingCapability ? { reasoning_effort: this.config.thinkingCapability === 'ultra' ? 'high' : this.config.thinkingCapability } : {})
      });

      const url = new URL(`${this.config.baseUrl}/v1/chat/completions`);
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      let fullContent = '';

      const req = https.request(options, (res: IncomingMessage) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          let errorData = '';
          res.on('data', (chunk) => { errorData += chunk; });
          res.on('end', () => {
            let errorMsg = `OpenAI API Error ${res.statusCode}`;
            try {
              const parsed = JSON.parse(errorData);
              if (parsed.error?.message) errorMsg += `: ${parsed.error.message}`;
            } catch {
              errorMsg += `: ${errorData}`;
            }
            const err = new Error(errorMsg);
            callbacks.onError?.(err);
            reject(err);
          });
          return;
        }

        res.setEncoding('utf8');
        let buffer = '';

        res.on('data', (chunk: string) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const cleanedLine = line.trim();
            if (!cleanedLine) continue;
            if (cleanedLine === 'data: [DONE]') continue;

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
          }
        });

        res.on('end', () => {
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
