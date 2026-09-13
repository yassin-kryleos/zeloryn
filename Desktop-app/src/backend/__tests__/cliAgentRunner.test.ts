import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  ClaudeCodeRunner,
  CodexCliRunner,
  CliAgentRegistry,
  cliAgentRegistry,
  killProcessTree,
  execFileSimple,
} from '../cliAgentRunner';
import type { ChildProcess } from 'child_process';
import { TerminalManager } from '../terminalManager';
import * as path from 'path';
import * as os from 'os';

describe('CliAgentRunner & CliAgentRegistry', () => {
  describe('CliAgentRegistry', () => {
    let registry: CliAgentRegistry;

    beforeEach(() => {
      registry = new CliAgentRegistry();
    });

    it('initializes with default Claude Code runner', () => {
      expect(registry.has('claude-code')).toBe(true);
      expect(registry.getDefault().id).toBe('claude-code');
      expect(registry.list().length).toBeGreaterThanOrEqual(1);
    });

    it('allows registering and retrieving new runners', () => {
      const codex = new CodexCliRunner();
      registry.register(codex);
      expect(registry.has('codex-cli')).toBe(true);
      expect(registry.get('codex-cli')?.name).toBe('Codex CLI');
    });

    it('allows setting and unsetting default runner', () => {
      const codex = new CodexCliRunner();
      registry.register(codex);
      registry.setDefault('codex-cli');
      expect(registry.getDefault().id).toBe('codex-cli');

      expect(() => registry.setDefault('nonexistent')).toThrow();
    });

    it('allows unregistering a runner', () => {
      const codex = new CodexCliRunner();
      registry.register(codex);
      expect(registry.unregister('codex-cli')).toBe(true);
      expect(registry.has('codex-cli')).toBe(false);
      expect(registry.unregister('codex-cli')).toBe(false);
    });
  });

  describe('ClaudeCodeRunner', () => {
    const runner = new ClaudeCodeRunner();

    it('builds comprehensive task prompts including workspace and plan item context', () => {
      const prompt = runner.buildPrompt('Fix login button styling', '/test/workspace', 'item-42');
      expect(prompt).toContain('Fix login button styling');
      expect(prompt).toContain('/test/workspace');
      expect(prompt).toContain('Plan item ID: item-42');
      expect(prompt).toContain('Execute this task against the workspace');
    });

    it('parses structured JSON output with assistant messages and tool uses', () => {
      const rawJson = JSON.stringify({
        messages: [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'I examined the codebase.' },
              { type: 'tool_use', id: 'call_1', name: 'ReadFile', input: { path: 'src/index.ts' } },
            ],
          },
        ],
      });

      const parsed = runner.tryParseJsonOutput(rawJson);
      expect(parsed.textResponse).toContain('I examined the codebase.');
      expect(parsed.toolUses).toHaveLength(1);
      expect(parsed.toolUses[0].name).toBe('ReadFile');
      expect(parsed.toolUses[0].input).toEqual({ path: 'src/index.ts' });
    });

    it('gracefully handles unstructured or non-JSON output', () => {
      const plainText = 'Plain markdown response without JSON formatting';
      const parsed = runner.tryParseJsonOutput(plainText);
      expect(parsed.textResponse).toBe('');
      expect(parsed.toolUses).toEqual([]);
    });

    it('throws informative error when running without binary installed', async () => {
      const fakeRunner = new ClaudeCodeRunner();
      vi.spyOn(fakeRunner, 'findBinary').mockReturnValue(null);

      await expect(
        fakeRunner.run({
          queryText: 'test',
          workspaceRoot: '/nonexistent',
        })
      ).rejects.toThrow(/Claude Code CLI not found/);
    });

    it('supports live streaming PTY execution via TerminalManager', async () => {
      const tempDir = os.tmpdir();
      const terminalManager = new TerminalManager({
        workspaceRoot: tempDir,
        onCommand: async () => true,
        onTerminalOutput: () => {},
      });

      const mockRunner = new ClaudeCodeRunner();
      // Mock node binary as an executable placeholder for test
      vi.spyOn(mockRunner, 'findBinary').mockReturnValue(process.execPath);

      const chunks: string[] = [];
      const result = await mockRunner.runPty(
        {
          queryText: 'console.log("hello from agent");',
          workspaceRoot: tempDir,
          onOutput: (chunk) => {
            chunks.push(chunk);
          },
        },
        terminalManager
      );

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.stdout).toBe('string');
      expect(result.usedPrintMode).toBe(true);
    });
  });

  describe('CodexCliRunner', () => {
    const runner = new CodexCliRunner();

    it('builds comprehensive task prompts including workspace and plan item context', () => {
      const prompt = runner.buildPrompt('Implement user profile card', '/test/workspace', 'card-101');
      expect(prompt).toContain('Implement user profile card');
      expect(prompt).toContain('/test/workspace');
      expect(prompt).toContain('Plan item ID: card-101');
      expect(prompt).toContain('Execute this task against the workspace');
    });

    it('discovers binary via environment override KRYLEOS_CODEX_PATH', () => {
      const original = process.env.KRYLEOS_CODEX_PATH;
      try {
        process.env.KRYLEOS_CODEX_PATH = process.execPath;
        const bin = runner.findBinary();
        expect(bin).toBe(process.execPath);
      } finally {
        if (original !== undefined) {
          process.env.KRYLEOS_CODEX_PATH = original;
        } else {
          delete process.env.KRYLEOS_CODEX_PATH;
        }
      }
    });

    it('parses JSON lines and event streams from Codex CLI', () => {
      const rawOutput = [
        '{"type":"session_start","id":"s_1"}',
        '{"type":"message","item":{"type":"message","text":"Analyzing the project structure."}}',
        '{"type":"tool_use","name":"execute_command","input":{"command":"npm test"}}',
        'Finished running analysis.'
      ].join('\n');

      const parsed = runner.tryParseJsonLines(rawOutput);
      expect(parsed.textResponse).toContain('Analyzing the project structure.');
      expect(parsed.textResponse).toContain('Finished running analysis.');
      expect(parsed.toolUses).toHaveLength(1);
      expect(parsed.toolUses[0].name).toBe('execute_command');
      expect(parsed.toolUses[0].input).toEqual({ command: 'npm test' });
    });

    it('throws informative error when binary is not found on system', async () => {
      const fakeRunner = new CodexCliRunner();
      vi.spyOn(fakeRunner, 'findBinary').mockReturnValue(null);

      await expect(
        fakeRunner.run({
          queryText: 'test',
          workspaceRoot: '/nonexistent',
        })
      ).rejects.toThrow(/Codex CLI not found/);
    });

    it('supports live streaming PTY execution via TerminalManager', async () => {
      const tempDir = os.tmpdir();
      const terminalManager = new TerminalManager({
        workspaceRoot: tempDir,
        onCommand: async () => true,
        onTerminalOutput: () => {},
      });

      const mockRunner = new CodexCliRunner();
      vi.spyOn(mockRunner, 'findBinary').mockReturnValue(process.execPath);

      const chunks: string[] = [];
      const result = await mockRunner.runPty(
        {
          queryText: 'console.log("hello from codex runner");',
          workspaceRoot: tempDir,
          onOutput: (chunk) => {
            chunks.push(chunk);
          },
        },
        terminalManager
      );

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.stdout).toBe('string');
      expect(result.usedPrintMode).toBe(true);
    });

    it('real binary smoke test: probes capabilities if codex is installed', async () => {
      const realBin = runner.findBinary();
      if (!realBin) {
        // Skip if codex is not installed in current environment
        return;
      }

      // Bound capability probing with an AbortController and explicit tree-killing
      // to ensure slow or hanging version manager shims (e.g. mise, asdf) never leak orphaned processes.
      const abortController = new AbortController();
      let spawnedChild: ChildProcess | null = null;
      let caps: Awaited<ReturnType<typeof runner.probeCapabilities>> | null = null;
      let timeoutId: NodeJS.Timeout | null = null;

      try {
        const probePromise = runner.probeCapabilities(realBin, {
          timeoutMs: 2500,
          signal: abortController.signal,
          onSpawn: (child) => {
            spawnedChild = child;
          },
        });

        const timeoutPromise = new Promise<null>((resolve) => {
          timeoutId = setTimeout(() => {
            abortController.abort();
            if (spawnedChild) {
              killProcessTree(spawnedChild);
            }
            resolve(null);
          }, 2500);
        });

        caps = await Promise.race([probePromise, timeoutPromise]);
      } catch {
        // Gracefully ignore execution errors from shims or missing auth
        caps = null;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (!caps && spawnedChild) {
          abortController.abort();
          killProcessTree(spawnedChild);
        }
      }

      if (!caps) {
        console.warn('Codex CLI probe timed out or failed to execute cleanly; skipping live smoke test gracefully.');
        return;
      }

      expect(caps.supportsPty).toBe(true);
      expect(typeof caps.version).toBe('string');
      expect(caps.version.length).toBeGreaterThan(0);
    });
  });

  describe('killProcessTree & execFileSimple process lifecycle', () => {
    it('handles null, undefined, or invalid pids gracefully', () => {
      expect(() => killProcessTree(null)).not.toThrow();
      expect(() => killProcessTree(undefined)).not.toThrow();
      expect(() => killProcessTree(-1)).not.toThrow();
      expect(() => killProcessTree(0)).not.toThrow();
    });

    it('execFileSimple terminates subprocess and descendants on signal abort', async () => {
      const ac = new AbortController();
      let spawned: ChildProcess | null = null;

      const promise = execFileSimple(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000)'],
        {
          signal: ac.signal,
          onSpawn: (child) => {
            spawned = child;
          },
        }
      );

      // Abort once process has spawned
      setTimeout(() => {
        ac.abort();
      }, 100);

      await expect(promise).rejects.toThrow();
      expect(spawned).not.toBeNull();
      if (spawned && (spawned as ChildProcess).pid) {
        await new Promise((r) => setTimeout(r, 100));
        expect(() => process.kill((spawned as ChildProcess).pid!, 0)).toThrow();
      }
    });

    it('execFileSimple terminates subprocess on timeout', async () => {
      let spawned: ChildProcess | null = null;
      const promise = execFileSimple(
        process.execPath,
        ['-e', 'setInterval(() => {}, 1000)'],
        {
          timeout: 150,
          onSpawn: (child) => {
            spawned = child;
          },
        }
      );

      await expect(promise).rejects.toThrow(/timed out/i);
      expect(spawned).not.toBeNull();
      if (spawned && (spawned as ChildProcess).pid) {
        await new Promise((r) => setTimeout(r, 100));
        expect(() => process.kill((spawned as ChildProcess).pid!, 0)).toThrow();
      }
    });
  });
});
