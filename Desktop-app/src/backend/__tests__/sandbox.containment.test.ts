import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceSandbox } from '../tools';

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('WorkspaceSandbox canonical containment', () => {
  it('rejects sibling-prefix paths', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-containment-'));
    cleanup.push(parent);
    const root = path.join(parent, 'workspace');
    const sibling = path.join(parent, 'workspace-secret');
    fs.mkdirSync(root);
    fs.mkdirSync(sibling);
    const sandbox = new WorkspaceSandbox(root);

    expect(() => sandbox.resolvePath(path.join(sibling, 'credentials.txt'))).toThrow(/outside the whitelisted directories/);
  });

  it('replaces prior authority when the workspace changes', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-workspace-change-'));
    cleanup.push(parent);
    const first = path.join(parent, 'first');
    const second = path.join(parent, 'second');
    fs.mkdirSync(first);
    fs.mkdirSync(second);
    const sandbox = new WorkspaceSandbox(first);

    sandbox.setWorkspaceRoot(second);
    expect(() => sandbox.resolvePath(path.join(first, 'old.txt'))).toThrow(/outside the whitelisted directories/);
    expect(sandbox.resolvePath(path.join(second, 'new.txt'))).toContain(path.basename(second));
  });

  it('rejects symlink escapes when the platform permits symlinks', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-symlink-'));
    cleanup.push(parent);
    const root = path.join(parent, 'root');
    const outside = path.join(parent, 'outside');
    fs.mkdirSync(root);
    fs.mkdirSync(outside);
    const link = path.join(root, 'link');
    try {
      fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;
    }

    const sandbox = new WorkspaceSandbox(root);
    expect(() => sandbox.resolvePath(path.join(link, 'secret.txt'))).toThrow(/outside the whitelisted directories/);
  });
});
