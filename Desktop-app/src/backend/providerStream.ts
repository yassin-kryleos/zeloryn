import { IncomingMessage } from 'http';

// Shared HTTP-error handling for streaming provider responses. All 4
// streaming providers (Anthropic/OpenAI/OpenRouter/DeepSeek) had identical
// status-check + error-body-parse logic, differing only in the error prefix.
// Returns true if the response was an error (and has been fully handled);
// callers should `return` immediately when this returns true.
export function handleHttpStreamError(
  res: IncomingMessage,
  errorPrefix: string,
  onError: ((err: Error) => void) | undefined,
  reject: (err: Error) => void
): boolean {
  if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
    let errorData = '';
    res.on('data', (chunk) => { errorData += chunk; });
    res.on('end', () => {
      let errorMsg = `${errorPrefix} ${res.statusCode}`;
      try {
        const parsed = JSON.parse(errorData);
        if (parsed.error?.message) errorMsg += `: ${parsed.error.message}`;
      } catch {
        errorMsg += `: ${errorData}`;
      }
      const err = new Error(errorMsg);
      onError?.(err);
      reject(err);
    });
    return true;
  }
  return false;
}

// Shared SSE line-buffering loop. Accumulates chunks, splits on newlines,
// and calls `onLine` for each complete trimmed non-empty line. The trailing
// partial line is kept in the buffer until more data arrives; on stream end
// it is passed to `onEnd` so providers that need an end-of-buffer flush can
// process a final unterminated `data: ` line.
export function streamSseLines(
  res: IncomingMessage,
  onLine: (line: string) => void,
  onEnd: (trailingBuffer: string) => void
) {
  res.setEncoding('utf8');
  let buffer = '';

  res.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const cleanedLine = line.trim();
      if (!cleanedLine) continue;
      onLine(cleanedLine);
    }
  });

  res.on('end', () => onEnd(buffer));
}

import * as https from 'https';
import * as http from 'http';

export interface OpenAiStreamOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  errorPrefix: string;
  endpointPath?: string;
  allowEmptyKey?: boolean;
  extraBody?: Record<string, any>;
  extraHeaders?: Record<string, string>;
  onContentChunk?: (chunk: string) => void;
  onReasoningChunk?: (chunk: string) => void;
  onComplete?: (fullContent: string, fullReasoning: string) => void;
  onError?: (err: Error) => void;
}

export function streamOpenAiCompatibleChat(opts: OpenAiStreamOptions): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!opts.apiKey && !opts.allowEmptyKey) {
      const err = new Error(`${opts.errorPrefix} Key is missing. Configure it in settings.`);
      opts.onError?.(err);
      reject(err);
      return;
    }

    const postData = JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
      ...opts.extraBody
    });

    const rawBase = (opts.baseUrl || 'https://api.openai.com').trim().replace(/\/+$/, '');
    let endpoint = opts.endpointPath;
    if (!endpoint) {
      if (rawBase.endsWith('/chat/completions')) {
        endpoint = '';
      } else if (rawBase.endsWith('/v1') || rawBase.endsWith('/v4')) {
        endpoint = '/chat/completions';
      } else {
        endpoint = '/v1/chat/completions';
      }
    }
    const url = new URL(`${rawBase}${endpoint}`);
    const client = url.protocol === 'http:' ? http : https;
    const headers: Record<string, any> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      ...opts.extraHeaders
    };
    if (opts.apiKey) {
      headers['Authorization'] = `Bearer ${opts.apiKey}`;
    }

    const requestOptions = {
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers
    };

    let fullContent = '';
    let fullReasoning = '';

    const handleDelta = (jsonStr: string) => {
      try {
        const data = JSON.parse(jsonStr);
        const delta = data.choices?.[0]?.delta;
        if (delta?.reasoning_content) {
          fullReasoning += delta.reasoning_content;
          opts.onReasoningChunk?.(delta.reasoning_content);
        }
        if (delta?.content) {
          fullContent += delta.content;
          opts.onContentChunk?.(delta.content);
        }
      } catch {}
    };

    const req = client.request(requestOptions, (res: IncomingMessage) => {
      if (handleHttpStreamError(res, `${opts.errorPrefix} Error`, opts.onError, reject)) return;

      streamSseLines(
        res,
        (cleanedLine) => {
          if (cleanedLine === 'data: [DONE]') return;
          if (cleanedLine.startsWith('data: ')) {
            handleDelta(cleanedLine.slice(6));
          }
        },
        (trailing) => {
          if (trailing && trailing.startsWith('data: ')) {
            handleDelta(trailing.slice(6));
          }
          opts.onComplete?.(fullContent, fullReasoning);
          resolve();
        }
      );
    });

    req.on('error', (err) => {
      opts.onError?.(err);
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

