/**
 * Command-sandbox blocklist audit (high-risk module: tools.ts runCommand).
 *
 * SAFETY: every command asserted here is on the blocklist, so runCommand returns
 * { code: -1 } and exits BEFORE spawning a child process. No destructive command
 * is ever executed by this test. We never assert that a dangerous command runs.
 *
 * Pass/fail: a blocked command must return code -1 and empty stdout. The
 * `it.fails` cases document blocklist GAPS — strings that are dangerous in
 * spirit but slip past the current regexes. They run a HARMLESS probe instead
 * (see note) so nothing destructive executes; they assert the command was NOT
 * blocked, documenting the bypass. Flip to `it` when the blocklist is hardened.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WorkspaceSandbox } from '../tools';
import * as fs from 'fs';
import * as path from 'path';

describe('WorkspaceSandbox command blocklist', () => {
  const testDir = path.resolve(__dirname, 'sandbox-blocklist-temp');
  let sandbox: WorkspaceSandbox;

  beforeAll(async () => {
    await fs.promises.mkdir(testDir, { recursive: true });
    sandbox = new WorkspaceSandbox(testDir);
  });
  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });

  const blocked = [
    'rm -rf /',
    'rm -rf *',
    'rm -rf .',
    'shutdown now',
    'shutdown /s /t 0',
    'reboot',
    'poweroff',
    'format c:',
    'taskkill && kill 1',
  ];

  for (const cmd of blocked) {
    it(`blocks: "${cmd}" (returns -1, never spawns)`, async () => {
      const res = await sandbox.runCommand(cmd);
      expect(res.code).toBe(-1);
      expect(res.stdout).toBe('');
      expect(res.stderr).toMatch(/blocked by security sandbox/i);
    });
  }
});

/**
 * KNOWN GAPS (regex blocklist is bypassable — Medium). These probe a HARMLESS
 * `echo`-style payload that the blocklist *should* arguably catch by intent but
 * does not. Because the probe itself is harmless, even though it executes, no
 * damage occurs. The assertion documents that the string was NOT blocked.
 */
describe('WorkspaceSandbox blocklist GAPS (Medium) — bypassable patterns', () => {
  const testDir = path.resolve(__dirname, 'sandbox-gap-temp');
  let sandbox: WorkspaceSandbox;

  beforeAll(async () => {
    await fs.promises.mkdir(testDir, { recursive: true });
    sandbox = new WorkspaceSandbox(testDir);
  });
  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });

  // Windows `del` recursive delete is NOT on the blocklist (only `rm`/`rmdir /s`
  // and `format`). Probe is harmless: we run `echo del /f /q` so nothing is
  // deleted, but it proves "del ..." is not classified as dangerous.
  it.fails('SHOULD block Windows "del /f /q" recursive deletes but does not', async () => {
    const res = await sandbox.runCommand('echo del /f /q nonexistent_probe.txt');
    // currently NOT blocked → code !== -1; this `it.fails` passes today.
    expect(res.code).toBe(-1);
  });
});
