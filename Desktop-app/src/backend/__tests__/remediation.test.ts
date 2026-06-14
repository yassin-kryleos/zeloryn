import { describe, it, expect } from 'vitest';
import * as path from 'path';

// Import local functions/modules to verify remediation
import * as syncController from '../sync';

// Duplicate path validation helper to verify logic correctness
function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

describe('Security Remediation Verification Tests', () => {
  describe('SEC-03: Workspace Boundary Validation (isPathInside)', () => {
    const parentDir = path.resolve('C:/Users/test/workspace');

    it('should allow paths directly inside the workspace root', () => {
      const childDir = path.resolve(parentDir, 'src/backend');
      expect(isPathInside(parentDir, childDir)).toBe(true);
    });

    it('should allow the workspace root itself', () => {
      expect(isPathInside(parentDir, parentDir)).toBe(true);
    });

    it('should block paths outside the workspace root (relative traversal)', () => {
      const childDir = path.resolve(parentDir, '../../Windows');
      expect(isPathInside(parentDir, childDir)).toBe(false);
    });

    it('should block absolute paths outside the workspace root', () => {
      const childDir = path.resolve('C:/Windows');
      expect(isPathInside(parentDir, childDir)).toBe(false);
    });
  });

  describe('SEC-04: Cryptographic Hashing and Token Checks', () => {
    it('should generate secure session tokens with random bytes', async () => {
      // Register will generate a secure random token
      const testEmail = `sec_test_${Date.now()}@example.com`;
      const testPass = 'securePassword123!';
      
      const user = await syncController.register(testEmail, testPass);
      
      expect(user.token).toBeDefined();
      expect(user.token.length).toBeGreaterThan(40); // token_ + 32 hex + _ + timestamp
      expect(user.passwordHash).not.toBe(testPass); // Must not store plain password
      expect(user.passwordHash).toContain(':'); // Must have format salt:hash
      
      // Clean up test user
      await syncController.deleteUser(testEmail);
    });

    it('should successfully login and verify PBKDF2 password hashes', async () => {
      const testEmail = `sec_login_${Date.now()}@example.com`;
      const testPass = 'anotherPass456!';
      
      // Register
      const user = await syncController.register(testEmail, testPass);
      expect(user.passwordHash).toContain(':');

      // Login success
      const loggedUser = await syncController.login(testEmail, testPass);
      expect(loggedUser.email).toBe(testEmail.toLowerCase());

      // Login failure
      await expect(syncController.login(testEmail, 'wrongPassword')).rejects.toThrow('Invalid credentials');

      // Clean up
      await syncController.deleteUser(testEmail);
    });
  });

  describe('SEC-10: Local Chat History Database Encryption', () => {
    it('should encrypt the chat history on disk and decrypt it transparently', async () => {
      const { ChatDatabase } = await import('../db');
      const fs = await import('fs');
      
      const db = new ChatDatabase();
      const testSessionId = `session_encrypt_test_${Date.now()}`;
      
      const sessionData = {
        id: testSessionId,
        title: 'Security Test Session',
        createdAt: new Date().toISOString(),
        logs: [],
        checklist: [],
        space: 'chat' as const
      };

      // Save session
      await db.saveSession(sessionData);

      // Read raw file on disk directly
      const rawContent = fs.readFileSync(db['dbPath'], 'utf-8');
      
      // Verification: raw database file content MUST start with 'enc:'
      expect(rawContent.startsWith('enc:')).toBe(true);
      expect(rawContent).not.toContain('Security Test Session');

      // Load session via ChatDatabase
      const decryptedSession = await db.getSession(testSessionId);
      expect(decryptedSession).toBeDefined();
      expect(decryptedSession?.title).toBe('Security Test Session');

      // Cleanup
      await db.deleteSession(testSessionId);
    });
  });
});
