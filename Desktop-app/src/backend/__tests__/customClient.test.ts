import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'http';
import { CustomOpenAiClient } from '../customClient';
import { getProviderForModel, getPricingForModel, estimateCost } from '../costGuard';

describe('CustomOpenAiClient (Mode A Custom Provider & Dynamic Models)', () => {
  let server: http.Server;
  let serverPort: number;
  let lastRequest: {
    method?: string;
    url?: string;
    headers?: http.IncomingHttpHeaders;
    body?: any;
  } = {};

  beforeEach(async () => {
    lastRequest = {};
    server = http.createServer((req, res) => {
      lastRequest.method = req.method;
      lastRequest.url = req.url;
      lastRequest.headers = req.headers;

      let rawBody = '';
      req.on('data', chunk => { rawBody += chunk; });
      req.on('end', () => {
        try {
          lastRequest.body = JSON.parse(rawBody);
        } catch {
          lastRequest.body = rawBody;
        }

        if (req.url === '/v1/models' || req.url === '/models') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            data: [
              { id: 'glm-4-plus' },
              { id: 'glm-4-flash' },
              { id: 'deepseek-r1-local' }
            ]
          }));
          return;
        }

        // Stream chat completion chunks
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        // Send reasoning chunk first
        res.write(`data: ${JSON.stringify({
          choices: [{ delta: { reasoning_content: 'Thinking about the solution...' } }]
        })}\n\n`);

        // Send content chunk
        res.write(`data: ${JSON.stringify({
          choices: [{ delta: { content: 'Here is the answer.' } }]
        })}\n\n`);

        // Send done
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('correctly configures provider name, model, and base URL', () => {
    const client = new CustomOpenAiClient({
      providerName: 'Zhipu GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4-plus'
    });

    expect(client.getProviderName()).toBe('Zhipu GLM');
    expect(client.getBaseUrl()).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(client.getModel()).toBe('glm-4-plus');

    client.setModel('glm-4-flash');
    expect(client.getModel()).toBe('glm-4-flash');
  });

  it('streams content and captures reasoning chunks from custom server', async () => {
    const client = new CustomOpenAiClient({
      apiKey: 'test-custom-key',
      baseUrl: `http://127.0.0.1:${serverPort}/v1`,
      model: 'glm-4-plus',
      providerName: 'Test GLM'
    });

    let contentReceived = '';
    let reasoningReceived = '';
    let completed = false;

    await client.chatStream(
      [{ role: 'user', content: 'What is 2+2?' }],
      {
        onContentChunk: (chunk) => { contentReceived += chunk; },
        onReasoningChunk: (chunk) => { reasoningReceived += chunk; },
        onComplete: (content, reasoning) => {
          completed = true;
          expect(content).toBe('Here is the answer.');
          expect(reasoning).toBe('Thinking about the solution...');
        }
      }
    );

    expect(completed).toBe(true);
    expect(contentReceived).toBe('Here is the answer.');
    expect(reasoningReceived).toBe('Thinking about the solution...');
    expect(lastRequest.url).toBe('/v1/chat/completions');
    expect(lastRequest.headers?.authorization).toBe('Bearer test-custom-key');
    expect(lastRequest.body?.model).toBe('glm-4-plus');
  });

  it('allows empty API keys for local endpoints without throwing', async () => {
    const client = new CustomOpenAiClient({
      baseUrl: `http://127.0.0.1:${serverPort}`,
      model: 'local-model'
    });

    let completed = false;
    await client.chatStream(
      [{ role: 'user', content: 'Hello' }],
      {
        onContentChunk: () => {},
        onComplete: () => { completed = true; }
      }
    );

    expect(completed).toBe(true);
    expect(lastRequest.headers?.authorization).toBeUndefined();
    expect(lastRequest.url).toBe('/v1/chat/completions');
  });

  it('avoids path duplication when baseUrl already ends in /chat/completions', async () => {
    const client = new CustomOpenAiClient({
      baseUrl: `http://127.0.0.1:${serverPort}/chat/completions`,
      model: 'local-model'
    });

    let completed = false;
    await client.chatStream(
      [{ role: 'user', content: 'Hello' }],
      {
        onContentChunk: () => {},
        onComplete: () => { completed = true; }
      }
    );

    expect(completed).toBe(true);
    expect(lastRequest.url).toBe('/chat/completions');
  });

  it('recognizes custom and glm models in CostGuard pricing', () => {
    expect(getProviderForModel('glm-4-plus')).toBe('Custom Provider');
    expect(getProviderForModel('custom:my-own-model')).toBe('Custom Provider');
    expect(getProviderForModel('zlm-chat')).toBe('Custom Provider');

    const pricing = getPricingForModel('glm-4-plus');
    expect(pricing.input).toBeGreaterThan(0);
    expect(pricing.output).toBeGreaterThan(0);

    const cost = estimateCost('Hello world this is a test prompt', 'glm-4-plus', false);
    expect(cost).toBeGreaterThan(0);
  });
});
