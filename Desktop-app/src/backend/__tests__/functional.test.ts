import { describe, it, expect, beforeEach } from 'vitest';
import * as syncController from '../sync';
import { ChatDatabase, type ChatSession } from '../db';
import { mergeTasks } from '../sync';

describe('Kryleos Forge Backend Functional Test Suite', () => {
  const db = new ChatDatabase();
  const testEmail = 'functional_test_user@example.com';
  const testPassword = 'functional-password-hash';
  let registeredUser: any;

  beforeEach(async () => {
    // Ensure clean state before each test
    await syncController.deleteUser(testEmail);
    // Clean up mock session if exists
    await db.deleteSession('func_session_1');
  });

  describe('1. Signup, Onboarding & Credentials Flow', () => {
    it('should successfully register a new user on signup with default free tier', async () => {
      registeredUser = await syncController.register(testEmail, testPassword);
      expect(registeredUser).not.toBeNull();
      expect(registeredUser.email).toBe(testEmail);
      expect(registeredUser.tier).toBe('free');
      expect(registeredUser.isPremium).toBe(false);
      expect(registeredUser.token).toBeDefined();
    });

    it('should prevent signup duplicate email addresses', async () => {
      await syncController.register(testEmail, testPassword);
      await expect(syncController.register(testEmail, 'new-password')).rejects.toThrow('User already exists');
    });

    it('should successfully authenticate registered user on login', async () => {
      await syncController.register(testEmail, testPassword);
      const loggedIn = await syncController.login(testEmail, testPassword);
      expect(loggedIn).not.toBeNull();
      expect(loggedIn.email).toBe(testEmail);
      expect(loggedIn.token).toBeDefined();
    });

    it('should reject login attempt with invalid credentials', async () => {
      await syncController.register(testEmail, testPassword);
      await expect(syncController.login(testEmail, 'wrong-password')).rejects.toThrow('Invalid credentials');
    });
  });

  describe('2. Roles & Permissions Behavior', () => {
    it('should successfully upgrade user tier and enable premium access privileges', async () => {
      const user = await syncController.register(testEmail, testPassword);
      const upgraded = await syncController.subscribe(user.token, 'solo_plus');
      expect(upgraded.tier).toBe('solo_plus');
      expect(upgraded.isPremium).toBe(true);

      const checkTier = await syncController.getUserTier(user.token);
      expect(checkTier).toBe('solo_plus');
    });

    it('should downgrade users back to free tier correctly', async () => {
      const user = await syncController.register(testEmail, testPassword);
      await syncController.subscribe(user.token, 'founder');
      const downgraded = await syncController.subscribe(user.token, 'free');
      expect(downgraded.tier).toBe('free');
      expect(downgraded.isPremium).toBe(false);
    });
  });

  describe('3. Session Persistence & DB Storage', () => {
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

  describe('4. Data Sync & Offline Merging Mechanics', () => {
    it('should merge remote and local workspace task modifications based on timestamp', () => {
      const storedTasks = [
        { id: 't1', title: 'Local Task 1', status: 'todo', lastModified: '2026-06-10T10:00:00.000Z' }
      ];
      const incomingTasks = [
        { id: 't1', title: 'Updated Task 1', status: 'in_progress', lastModified: '2026-06-10T12:00:00.000Z' },
        { id: 't2', title: 'New Remote Task', status: 'todo', lastModified: '2026-06-10T12:00:00.000Z' }
      ];

      const merged = mergeTasks(incomingTasks, storedTasks);
      expect(merged).toHaveLength(2);
      
      const t1 = merged.find(t => t.id === 't1');
      expect(t1?.title).toBe('Updated Task 1');
      expect(t1?.status).toBe('in_progress');
    });

    it('should reject pushing data updates to cloud sync for free users', async () => {
      const user = await syncController.register(testEmail, testPassword);
      const payload = { tasks: [] };
      await expect(syncController.pushSync(user.token, payload)).rejects.toThrow(
        'Upgrade to a Basic, Pro, or Enterprise subscription to enable Cloud Sync'
      );
    });

    it('should allow pushing and pulling data updates for upgraded users', async () => {
      const user = await syncController.register(testEmail, testPassword);
      await syncController.subscribe(user.token, 'solo');
      
      const payload = { tasks: [{ id: 't_sync_1', title: 'Sync Task', status: 'todo' }] };
      const timestamp = await syncController.pushSync(user.token, payload);
      expect(timestamp).toBeDefined();

      const pulled = await syncController.pullSync(user.token);
      expect(pulled).not.toBeNull();
      expect(pulled?.payload.tasks).toHaveLength(1);
      expect(pulled?.payload.tasks[0].title).toBe('Sync Task');
    });
  });
});
