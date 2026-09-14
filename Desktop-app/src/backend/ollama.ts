import { IncomingMessage } from 'http';
import * as http from 'http';
import * as https from 'https';
import type { Message } from './deepseek';

export interface OllamaConfig {
  model: 'llama3' | 'qwen2.5-coder' | string;
  baseUrl?: string;
  options?: Record<string, any>;
}

export interface OllamaModelInfo {
  name: string;
  model?: string;
  modified_at?: string;
  size?: number;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
    context_length?: number;
  };
  capabilities?: string[];
}

export class OllamaClient {
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = {
      baseUrl: 'http://localhost:11434',
      ...config
    };
  }

  public setBaseUrl(url: string) {
    this.config.baseUrl = url || 'http://localhost:11434';
  }

  public setModel(model: string) {
    this.config.model = model;
  }

  public setOptions(options?: Record<string, any>) {
    this.config.options = options;
  }

  public listModels(baseUrl = this.config.baseUrl || 'http://localhost:11434'): Promise<OllamaModelInfo[]> {
    return new Promise<OllamaModelInfo[]>((resolve, reject) => {
      const endpoint = `${baseUrl.replace(/\/$/, '')}/api/tags`;
      const isHttps = endpoint.startsWith('https://');
      const requestLib = isHttps ? https : http;
      const url = new URL(endpoint);

      const req = requestLib.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'GET'
      }, (res: IncomingMessage) => {
        let response = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { response += chunk; });
        res.on('end', () => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            reject(new Error(`Ollama Error ${res.statusCode}: ${response}`));
            return;
          }
          try {
            const parsed = JSON.parse(response || '{}');
            resolve(Array.isArray(parsed.models) ? parsed.models : []);
          } catch (err: any) {
            reject(new Error(`Could not parse Ollama model list: ${err.message}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
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
      const postData = JSON.stringify({
        model: this.config.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        ...(this.config.options ? { options: this.config.options } : {})
      });

      const endpoint = `${this.config.baseUrl}/api/chat`;
      const isHttps = endpoint.startsWith('https://');
      const requestLib = isHttps ? https : http;

      const url = new URL(endpoint);
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      let fullContent = '';

      const req = requestLib.request(options, (res: IncomingMessage) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          let errorData = '';
          res.on('data', (chunk) => { errorData += chunk; });
          res.on('end', () => {
            const err = new Error(`Ollama Error ${res.statusCode}: ${errorData}`);
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

            try {
              const data = JSON.parse(cleanedLine);
              if (data.message?.content) {
                const content = data.message.content;
                fullContent += content;
                callbacks.onContentChunk?.(content);
              }
            } catch {}
          }
        });

        res.on('end', () => {
          if (buffer) {
            try {
              const data = JSON.parse(buffer.trim());
              if (data.message?.content) {
                const content = data.message.content;
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
