import { describe, it, expect, beforeEach } from 'vitest';
import { ChatDatabase, type ChatSession } from '../db';

describe('Kryleos Forge Backend Functional Test Suite', () => {
  const db = new ChatDatabase();

  beforeEach(async () => {
    // Clean up mock session if exists
    await db.deleteSession('func_session_1');
  });

  describe('Session Persistence & DB Storage', () => {
    it('should write, read, and delete collaborative planning sessions in database', async () => {
      const sessionData: ChatSession = {
        id: 'func_session_1',
        title: 'Functional Test Session',
        createdAt: new Date().toISOString(),
        logs: [],
        checklist: ['[ ] Task 1', '[x] Task 2'],
        messages: [],
        space: 'project',
        tasks: []
      };

      await db.saveSession(sessionData);

      const retrieved = await db.getSession('func_session_1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.title).toBe('Functional Test Session');
      expect(retrieved?.checklist).toContain('[ ] Task 1');

      const list = await db.listSessions('project');
      expect(list.some(s => s.id === 'func_session_1')).toBe(true);

      await db.deleteSession('func_session_1');
      const checked = await db.getSession('func_session_1');
      expect(checked).toBeNull();
    });
  });
});
