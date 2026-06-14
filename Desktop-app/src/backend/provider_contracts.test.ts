import { describe, expect, it, afterEach } from 'vitest';
import nock from 'nock';
import { OllamaClient } from './ollama';
import { DeepSeekClient } from './deepseek';

// Beta-scoped provider contract tests: verify our HTTP request/response
// parsing against recorded-shape fixtures for one local provider (Ollama)
// and one paid provider (DeepSeek), without any real network calls. The full
// 7-provider matrix is demoted to post-beta.
afterEach(() => {
  nock.cleanAll();
});

describe('Ollama provider contract', () => {
  it('parses NDJSON chat stream chunks into content', async () => {
    nock('http://localhost:11434')
      .post('/api/chat')
      .reply(200, [
        JSON.stringify({ message: { role: 'assistant', content: 'Hello' }, done: false }),
        JSON.stringify({ message: { role: 'assistant', content: ' world' }, done: false }),
        JSON.stringify({ message: { role: 'assistant', content: '' }, done: true })
      ].join('\n') + '\n');

    const client = new OllamaClient({ model: 'qwen2.5-coder' });
    let content = '';
    let complete = '';
    await client.chatStream([{ role: 'user', content: 'hi' }], {
      onContentChunk: chunk => { content += chunk; },
      onComplete: full => { complete = full; }
    });

    expect(content).toBe('Hello world');
    expect(complete).toBe('Hello world');
  });

  it('lists available models from /api/tags', async () => {
    nock('http://localhost:11434')
      .get('/api/tags')
      .reply(200, { models: [{ name: 'qwen2.5-coder:1.5b', model: 'qwen2.5-coder:1.5b' }] });

    const client = new OllamaClient({ model: 'qwen2.5-coder' });
    const models = await client.listModels();
    expect(models).toHaveLength(1);
    expect(models[0].name).toBe('qwen2.5-coder:1.5b');
  });

  it('surfaces a non-2xx response as an error', async () => {
    nock('http://localhost:11434')
      .post('/api/chat')
      .reply(500, 'internal error');

    const client = new OllamaClient({ model: 'qwen2.5-coder' });
    let error: Error | undefined;
    await expect(
      client.chatStream([{ role: 'user', content: 'hi' }], { onError: e => { error = e; } })
    ).rejects.toThrow();
    expect(error?.message).toContain('Ollama Error 500');
  });
});

describe('DeepSeek provider contract', () => {
  it('parses SSE content and reasoning deltas, ignoring [DONE]', async () => {
    const sse = [
      'data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: 'Thinking...' } }] }),
      'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] }),
      'data: ' + JSON.stringify({ choices: [{ delta: { content: ' world' } }] }),
      'data: [DONE]',
      ''
    ].join('\n\n');

    nock('https://api.deepseek.com')
      .post('/chat/completions')
      .reply(200, sse, { 'Content-Type': 'text/event-stream' });

    const client = new DeepSeekClient({ apiKey: 'test-key', model: 'deepseek-chat' });
    let content = '';
    let reasoning = '';
    let finalContent = '';
    let finalReasoning = '';
    await client.chatStream([{ role: 'user', content: 'hi' }], {
      onContentChunk: chunk => { content += chunk; },
      onReasoningChunk: chunk => { reasoning += chunk; },
      onComplete: (full, fullReasoning) => { finalContent = full; finalReasoning = fullReasoning; }
    });

    expect(content).toBe('Hello world');
    expect(reasoning).toBe('Thinking...');
    expect(finalContent).toBe('Hello world');
    expect(finalReasoning).toBe('Thinking...');
  });

  it('surfaces a structured API error from a non-2xx response', async () => {
    nock('https://api.deepseek.com')
      .post('/chat/completions')
      .reply(401, { error: { message: 'Invalid API key' } });

    const client = new DeepSeekClient({ apiKey: 'bad-key', model: 'deepseek-chat' });
    let error: Error | undefined;
    await expect(
      client.chatStream([{ role: 'user', content: 'hi' }], { onError: e => { error = e; } })
    ).rejects.toThrow();
    expect(error?.message).toContain('Invalid API key');
  });

  it('rejects immediately when no API key is configured', async () => {
    const client = new DeepSeekClient({ apiKey: '', model: 'deepseek-chat' });
    await expect(client.chatStream([{ role: 'user', content: 'hi' }], {})).rejects.toThrow(/API Key/);
  });
});
