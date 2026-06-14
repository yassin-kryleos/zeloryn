import { IncomingMessage } from 'http';
import * as https from 'https';

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
      temperature: config.model === 'deepseek-reasoner' ? undefined : 0.2, // R1 doesn't support custom temp (or defaults are recommended)
      ...config
    };
  }

  public setApiKey(apiKey: string) {
    this.config.apiKey = apiKey;
  }

  public setModel(model: 'deepseek-chat' | 'deepseek-reasoner') {
    this.config.model = model;
    // R1 temperature is fixed by provider
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
    return new Promise<void>((resolve, reject) => {
      if (!this.config.apiKey) {
        const err = new Error('DeepSeek API Key is missing. Configure it in the settings.');
        callbacks.onError?.(err);
        reject(err);
        return;
      }

      let max_tokens = undefined;
      if (this.config.thinkingCapability) {
         if (this.config.thinkingCapability === 'low') max_tokens = 2048;
         if (this.config.thinkingCapability === 'medium') max_tokens = 4096;
         if (this.config.thinkingCapability === 'high') max_tokens = 8192;
         if (this.config.thinkingCapability === 'ultra') max_tokens = 16384; // R1 can go very high
      }

      const postData = JSON.stringify({
        model: this.config.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        ...(max_tokens ? { max_tokens } : {}),
        ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {})
      });

      const url = new URL(`${this.config.baseUrl}/chat/completions`);
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
      let fullReasoning = '';

      const req = https.request(options, (res: IncomingMessage) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          let errorData = '';
          res.on('data', (chunk) => { errorData += chunk; });
          res.on('end', () => {
            let errorMsg = `HTTP Error ${res.statusCode}`;
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
          // Keep the last partial line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            const cleanedLine = line.trim();
            if (!cleanedLine) continue;
            if (cleanedLine === 'data: [DONE]') continue;
            
            if (cleanedLine.startsWith('data: ')) {
              try {
                const jsonStr = cleanedLine.slice(6);
                const data = JSON.parse(jsonStr);
                const delta = data.choices?.[0]?.delta;

                if (delta) {
                  // R1 reasoning tokens
                  if (delta.reasoning_content) {
                    fullReasoning += delta.reasoning_content;
                    callbacks.onReasoningChunk?.(delta.reasoning_content);
                  }
                  // V3 or R1 final content tokens
                  if (delta.content) {
                    fullContent += delta.content;
                    callbacks.onContentChunk?.(delta.content);
                  }
                }
              } catch (err) {
                // Sometimes chunks are cut off, ignore parse errors if we're streaming
              }
            }
          }
        });

        res.on('end', () => {
          // Process any remaining buffer
          if (buffer && buffer.startsWith('data: ')) {
            try {
              const data = JSON.parse(buffer.slice(6));
              const delta = data.choices?.[0]?.delta;
              if (delta) {
                if (delta.reasoning_content) {
                  fullReasoning += delta.reasoning_content;
                  callbacks.onReasoningChunk?.(delta.reasoning_content);
                }
                if (delta.content) {
                  fullContent += delta.content;
                  callbacks.onContentChunk?.(delta.content);
                }
              }
            } catch {}
          }
          callbacks.onComplete?.(fullContent, fullReasoning);
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
