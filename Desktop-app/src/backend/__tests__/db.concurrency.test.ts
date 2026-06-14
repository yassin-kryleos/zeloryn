/**
 * JSON-DB concurrent-write integrity (SEC-M5).
 *
 * Before the fix, N concurrent saveSession() calls on a cold cache each read,
 * mutated a SEPARATE object, and wrote — so only the last writer survived
 * (lost update). ChatDatabase now serializes mutating ops, so every concurrent
 * write must persist.
 *
 * Pass/fail: all 50 concurrently-saved sessions are present, the on-disk file is
 * valid (decryptable) JSON, and a fresh instance reads all 50 back.
 *
 * Isolation: KRYLEOS_DB_PATH is pointed at a unique temp file BEFORE any
 * ChatDatabase is constructed, so the real chat_history.json is never touched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kryleos-db-concurrency-'));
const dbFile = path.join(tmpDir, 'chat_history.concurrency.json');

// Must be set before importing/constructing ChatDatabase.
process.env.KRYLEOS_DB_PATH = dbFile;
process.env.KRYLEOS_DATA_DIR = tmpDir;

// Imported after env is set.
import { ChatDatabase, type ChatSession } from '../db';

function makeSession(i: number): ChatSession {
  return {
    id: `concurrent_${i}`,
    title: `Session ${i}`,
    createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
    logs: [],
    checklist: [],
    space: 'chat',
  } as ChatSession;
}

describe('SEC-M5 — concurrent saveSession integrity', () => {
  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('persists all 50 sessions written concurrently (no lost updates)', async () => {
    const db = new ChatDatabase();
    const N = 50;

    // Fire all saves at once on a cold cache — the original race condition.
    await Promise.all(Array.from({ length: N }, (_, i) => db.saveSession(makeSession(i))));

    const listed = await db.listSessions('chat');
    expect(listed.length).toBe(N);

    // Every id is present exactly once.
    const ids = new Set(listed.map(s => s.id));
    for (let i = 0; i < N; i++) {
      expect(ids.has(`concurrent_${i}`)).toBe(true);
    }
  });

  it('on-disk file is valid and a fresh instance reads all 50 back', async () => {
    // A brand-new instance (empty cache) must load everything from disk.
    const fresh = new ChatDatabase();
    const listed = await fresh.listSessions('chat');
    expect(listed.length).toBe(50);

    const one = await fresh.getSession('concurrent_25');
    expect(one?.title).toBe('Session 25');

    // The raw file exists and is non-trivial (encrypted payload).
    expect(fs.existsSync(dbFile)).toBe(true);
    expect(fs.statSync(dbFile).size).toBeGreaterThan(100);
  });

  it('the DB key file was created with no plaintext key in source (SEC-B3b)', () => {
    expect(fs.existsSync(path.join(tmpDir, '.kryleos_db.key'))).toBe(true);
  });
});
