import { describe, expect, it, beforeEach } from 'vitest';
import { findClaudeCodeBinary, sanitizeEnv, buildClaudePrompt, tryParseJsonOutput } from '../claudeCodeRunner';

describe('claudeCodeRunner', () => {
  beforeEach(() => {
    delete process.env.KRYLEOS_CLAUDE_CODE_PATH;
  });

  it('findClaudeCodeBinary returns null when not on PATH and env var unset', () => {
    const origPath = process.env.PATH;
    process.env.PATH = '';
    try {
      expect(findClaudeCodeBinary()).toBeNull();
    } finally {
      process.env.PATH = origPath;
    }
  });

  it('findClaudeCodeBinary returns null for env var pointing to non-existent file', () => {
    const origPath = process.env.PATH;
    process.env.PATH = '';
    process.env.KRYLEOS_CLAUDE_CODE_PATH = 'C:\\nonexistent\\claude.exe';
    try {
      expect(findClaudeCodeBinary()).toBeNull();
    } finally {
      process.env.PATH = origPath;
    }
  });

  it('findClaudeCodeBinary returns path when env var points to valid file', () => {
    process.env.KRYLEOS_CLAUDE_CODE_PATH = process.execPath;
    expect(findClaudeCodeBinary()).toBe(process.execPath);
  });

  describe('sanitizeEnv', () => {
    it('filters out non-allowed env keys', () => {
      process.env.MY_SECRET_KEY = 'super-secret';
      process.env.PATH = '/usr/bin';
      process.env.HOME = '/home/user';

      const env = sanitizeEnv();

      expect(env.PATH).toBe('/usr/bin');
      expect(env.HOME).toBe('/home/user');
      expect(env.MY_SECRET_KEY).toBeUndefined();
    });

    it('includes all expected allowed keys that are set', () => {
      process.env.PATH = '/bin';
      process.env.USER = 'testuser';
      process.env.LANG = 'en_US.UTF-8';
      process.env.TERM = 'xterm-256color';
      process.env.SHELL = '/bin/bash';

      const env = sanitizeEnv();
      expect(env.PATH).toBe('/bin');
      expect(env.USER).toBe('testuser');
      expect(env.LANG).toBe('en_US.UTF-8');
      expect(env.TERM).toBe('xterm-256color');
      expect(env.SHELL).toBe('/bin/bash');
    });
  });

  describe('buildClaudePrompt', () => {
    it('includes workspace root and query text', () => {
      const prompt = buildClaudePrompt('write a test', '/workspace');
      expect(prompt).toContain('/workspace');
      expect(prompt).toContain('write a test');
      expect(prompt).toContain('--- Task ---');
    });

    it('includes planItemId when provided', () => {
      const prompt = buildClaudePrompt('fix bug', '/workspace', 'item-42');
      expect(prompt).toContain('item-42');
      expect(prompt).toContain('Plan item ID:');
    });
  });

  describe('tryParseJsonOutput', () => {
    it('extracts text from assistant message content', () => {
      const json = JSON.stringify([
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      ]);

      const result = tryParseJsonOutput(json);
      expect(result.textResponse).toContain('Hello world');
      expect(result.toolUses).toEqual([]);
    });

    it('extracts tool_use blocks', () => {
      const json = JSON.stringify([
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Running command...' },
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'ls -la' },
            },
          ],
        },
      ]);

      const result = tryParseJsonOutput(json);
      expect(result.textResponse).toContain('Running command...');
      expect(result.toolUses).toHaveLength(1);
      expect(result.toolUses[0].name).toBe('Bash');
      expect(result.toolUses[0].input.command).toBe('ls -la');
    });

    it('returns empty for non-JSON input', () => {
      const result = tryParseJsonOutput('not json at all');
      expect(result.textResponse).toBe('');
      expect(result.toolUses).toEqual([]);
    });

    it('parses object-form output with messages array', () => {
      const json = JSON.stringify({
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Done.' }],
          },
        ],
      });

      const result = tryParseJsonOutput(json);
      expect(result.textResponse).toContain('Done.');
    });

    it('handles string content in messages', () => {
      const json = JSON.stringify([
        { role: 'assistant', content: 'Plain string response' },
      ]);

      const result = tryParseJsonOutput(json);
      expect(result.textResponse).toContain('Plain string response');
    });
  });
});
