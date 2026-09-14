import { describe, expect, it } from 'vitest';
import { AgentOrchestrator, type ChatClient } from './agents';
import { WorkspaceSandbox } from './tools';

const noopClient: ChatClient = {
  async chatStream(_messages, callbacks) { callbacks.onComplete?.('', ''); }
};

function parse(text: string) {
  const o = new AgentOrchestrator(new WorkspaceSandbox(process.cwd()), noopClient, () => {});
  // parseActionBlock is private; exercise it directly for parser hardening coverage.
  return (o as any).parseActionBlock(text) as any;
}

describe('parseActionBlock — local-model tolerant parsing', () => {
  it('parses a standard <action> block', () => {
    const a = parse('thinking...\n<action>{"type":"tool","tool":"runCommand","arguments":{"command":"node -v"}}</action>');
    expect(a.type).toBe('tool');
    expect(a.tool).toBe('runCommand');
    expect(a.arguments.command).toBe('node -v');
  });

  it('parses a ```json fenced block when no action tag', () => {
    const a = parse('Sure, here is the action:\n```json\n{"type":"tool","tool":"runCommand","arguments":{"command":"node -v"}}\n```');
    expect(a.type).toBe('tool');
    expect(a.tool).toBe('runCommand');
  });

  it('parses bare JSON with no tag or fence', () => {
    const a = parse('I will run it. {"type":"tool","tool":"runCommand","arguments":{"command":"npm test"}} done');
    expect(a.type).toBe('tool');
    expect(a.arguments.command).toBe('npm test');
  });

  it('skips leading objects without a type and finds the action object', () => {
    const a = parse('context {"foo":1} then {"type":"respond","message":"hi"}');
    expect(a.type).toBe('respond');
    expect(a.message).toBe('hi');
  });

  it('defaults type to tool when tool is present in JSON without explicit type', () => {
    const a = parse('<action>{"tool":"writeFile","arguments":{"path":"src/test.ts","content":"hello"}}</action>');
    expect(a.type).toBe('tool');
    expect(a.tool).toBe('writeFile');
    expect(a.arguments.path).toBe('src/test.ts');
  });

  it('parses bare JSON containing tool without type', () => {
    const a = parse('Writing file: {"tool":"writeFile","arguments":{"path":"src/test.ts","content":"hello"}}');
    expect(a.type).toBe('tool');
    expect(a.tool).toBe('writeFile');
  });

  it('parses action with unescaped newlines and curly braces in content string', () => {
    const raw = '<action>\n{\n  "type": "tool",\n  "tool": "writeFile",\n  "arguments": {\n    "path": "src/greeting.ts",\n    "content": "export function greetUser(name: string): string {\n  return `Hello, ${name}!`;\n}"\n  }\n}\n</action>';
    const a = parse(raw);
    expect(a.type).toBe('tool');
    expect(a.tool).toBe('writeFile');
    expect(a.arguments.path).toBe('src/greeting.ts');
    expect(a.arguments.content).toContain('greetUser');
    expect(a.arguments.content).toContain('return `Hello');
  });

  it('collects root-level properties into arguments if arguments is missing', () => {
    const raw = '<action>\n{"tool":"writeFile","path":"src/root.ts","content":"const x = 1;"}\n</action>';
    const a = parse(raw);
    expect(a.type).toBe('tool');
    expect(a.tool).toBe('writeFile');
    expect(a.arguments.path).toBe('src/root.ts');
    expect(a.arguments.content).toBe('const x = 1;');
  });

  it('handles parameters object alias for arguments', () => {
    const raw = '<action>\n{"tool":"writeFile","parameters":{"path":"src/param.ts","content":"let y = 2;"}}\n</action>';
    const a = parse(raw);
    expect(a.type).toBe('tool');
    expect(a.tool).toBe('writeFile');
    expect(a.arguments.path).toBe('src/param.ts');
    expect(a.arguments.content).toBe('let y = 2;');
  });

  it('returns null when there is no JSON action at all', () => {
    expect(parse('Node version is v20. No action needed.')).toBeNull();
  });
});
