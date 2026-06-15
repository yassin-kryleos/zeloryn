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
