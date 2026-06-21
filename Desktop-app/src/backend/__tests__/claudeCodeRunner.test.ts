import { describe, expect, it, beforeEach } from 'vitest';
import { findClaudeCodeBinary } from '../claudeCodeRunner';

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
});
