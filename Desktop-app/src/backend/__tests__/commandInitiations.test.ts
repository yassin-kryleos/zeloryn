import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logCommandInitiation } from '../server';

describe('command_initiations.json audit trail (P5.6)', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kryleos_initiations_test_'));
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('logs a local FORGE-run initiation with no deviceId', async () => {
    await logCommandInitiation(workspaceRoot, { planItemId: 'task-1', source: 'local' });

    const logs = JSON.parse(fs.readFileSync(path.join(workspaceRoot, '.kryleos', 'command_initiations.json'), 'utf8'));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ planItemId: 'task-1', source: 'local', deviceId: null });
    expect(typeof logs[0].timestamp).toBe('string');
  });

  it('logs a remote FORGE-run initiation with the paired deviceId and appends to existing entries', async () => {
    await logCommandInitiation(workspaceRoot, { planItemId: 'task-1', source: 'local' });
    await logCommandInitiation(workspaceRoot, { planItemId: 'task-2', deviceId: 'phone-1', source: 'remote' });

    const logs = JSON.parse(fs.readFileSync(path.join(workspaceRoot, '.kryleos', 'command_initiations.json'), 'utf8'));
    expect(logs).toHaveLength(2);
    expect(logs[1]).toMatchObject({ planItemId: 'task-2', source: 'remote', deviceId: 'phone-1' });
  });
});
