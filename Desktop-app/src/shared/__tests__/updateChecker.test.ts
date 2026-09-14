import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isNewerVersion, checkForAppUpdates } from '../updateChecker';
import { APP_VERSION } from '../../version';

const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((k: string) => storage[k] || null),
  setItem: vi.fn((k: string, v: string) => { storage[k] = v; }),
  removeItem: vi.fn((k: string) => { delete storage[k]; }),
  clear: vi.fn(() => { for (const k in storage) delete storage[k]; })
};
(globalThis as any).localStorage = mockLocalStorage;

describe('updateChecker', () => {
  describe('isNewerVersion', () => {
    it('returns true when remote has a higher patch version', () => {
      expect(isNewerVersion('0.1.1', '0.1.0')).toBe(true);
      expect(isNewerVersion('v0.1.1', '0.1.0')).toBe(true);
    });

    it('returns true when remote has a higher minor version', () => {
      expect(isNewerVersion('0.2.0', '0.1.0')).toBe(true);
      expect(isNewerVersion('v1.0.0', '0.9.9')).toBe(true);
    });

    it('returns true when remote has a higher major version', () => {
      expect(isNewerVersion('1.0.0', '0.1.0')).toBe(true);
    });

    it('returns false when versions are identical', () => {
      expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
      expect(isNewerVersion('v0.1.0', '0.1.0')).toBe(false);
      expect(isNewerVersion('0.1.0', 'v0.1.0')).toBe(false);
    });

    it('returns false when remote is older', () => {
      expect(isNewerVersion('0.0.9', '0.1.0')).toBe(false);
      expect(isNewerVersion('0.0.1', '0.1.0')).toBe(false);
    });

    it('handles extra version parts gracefully', () => {
      expect(isNewerVersion('0.1.0.1', '0.1.0')).toBe(true);
      expect(isNewerVersion('0.1.0', '0.1.0.1')).toBe(false);
    });
  });

  describe('checkForAppUpdates', () => {
    beforeEach(() => {
      mockLocalStorage.clear();
      vi.restoreAllMocks();
    });

    it('detects an update when GitHub releases API returns a newer version', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: 'v9.9.9',
          html_url: 'https://github.com/yassin-kryleos/zeloryn/releases/tag/v9.9.9',
          body: 'New release notes'
        })
      });

      const result = await checkForAppUpdates({ force: true });
      expect(result.success).toBe(true);
      expect(result.hasUpdate).toBe(true);
      expect(result.latestVersion).toBe('9.9.9');
      expect(result.currentVersion).toBe(APP_VERSION);
      expect(result.releaseUrl).toBe('https://github.com/yassin-kryleos/zeloryn/releases/tag/v9.9.9');
    });

    it('reports no update when remote is same as current', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: `v${APP_VERSION}`,
          html_url: 'https://github.com/yassin-kryleos/zeloryn/releases/latest',
          body: 'Latest notes'
        })
      });

      const result = await checkForAppUpdates({ force: true });
      expect(result.success).toBe(true);
      expect(result.hasUpdate).toBe(false);
      expect(result.latestVersion).toBe(APP_VERSION);
    });

    it('handles network failure gracefully without throwing', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await checkForAppUpdates({ force: true });
      expect(result.success).toBe(false);
      expect(result.hasUpdate).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });
});
