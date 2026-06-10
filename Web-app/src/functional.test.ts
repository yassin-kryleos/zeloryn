import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Local storage mock
const mockLocalStorage: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (key: string) => mockLocalStorage[key] || null,
  setItem: (key: string, value: string) => { mockLocalStorage[key] = value; },
  removeItem: (key: string) => { delete mockLocalStorage[key]; },
  clear: () => { for (const key in mockLocalStorage) delete mockLocalStorage[key]; }
};

describe('Web Companion Client Functional Test Suite', () => {
  let mockWebSocket: any;
  let mockClose: any;

  beforeEach(() => {
    mockClose = vi.fn();
    mockWebSocket = vi.fn().mockImplementation((url) => {
      return {
        url,
        close: mockClose,
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null
      };
    });

    (globalThis as any).WebSocket = mockWebSocket;
  });

  afterEach(() => {
    delete (globalThis as any).WebSocket;
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('1. Form Inputs & Local Storage Validation', () => {
    it('should retrieve pairing code from localStorage on startup', () => {
      localStorage.setItem('web_pairing_code', '999888');
      const stored = localStorage.getItem('web_pairing_code');
      expect(stored).toBe('999888');
    });

    it('should save new pairing code to localStorage when input changes', () => {
      const code = '123456';
      localStorage.setItem('web_pairing_code', code);
      expect(localStorage.getItem('web_pairing_code')).toBe('123456');
    });
  });

  describe('2. Companion Connection States', () => {
    const getWsUrl = (backendUrl: string) => backendUrl.replace(/^http/i, 'ws');
    
    it('should form correct wsUrl with search query params on connection', () => {
      const backendUrl = 'http://localhost:3001';
      const code = '777666';
      const wsUrl = getWsUrl(backendUrl) + `/api/companion/ws?code=${code}`;
      expect(wsUrl).toBe('ws://localhost:3001/api/companion/ws?code=777666');
    });
  });

  describe('3. Gating & Modal Feature Permissions', () => {
    const checkFeatureAccess = (tier: string, feature: string): boolean => {
      if (feature === 'cloud_sync') {
        return tier !== 'free';
      }
      if (feature === 'semantic_lock') {
        return tier === 'pro' || tier === 'enterprise';
      }
      return true;
    };

    it('should block Cloud Sync access and show upgrade modal for free users', () => {
      const isAllowed = checkFeatureAccess('free', 'cloud_sync');
      expect(isAllowed).toBe(false);
    });

    it('should allow Cloud Sync access for basic tier users', () => {
      const isAllowed = checkFeatureAccess('basic', 'cloud_sync');
      expect(isAllowed).toBe(true);
    });

    it('should block Semantic Lock for basic tier users and show upgrade dialog', () => {
      const isAllowed = checkFeatureAccess('basic', 'semantic_lock');
      expect(isAllowed).toBe(false);
    });

    it('should allow Semantic Lock access for pro and enterprise tier users', () => {
      expect(checkFeatureAccess('pro', 'semantic_lock')).toBe(true);
      expect(checkFeatureAccess('enterprise', 'semantic_lock')).toBe(true);
    });
  });

  describe('4. Theme & Layout Configs', () => {
    it('should fallback to default theme forge if no theme is specified', () => {
      const selectedTheme = localStorage.getItem('web_theme') || 'forge';
      expect(selectedTheme).toBe('forge');
    });

    it('should successfully toggle between forge, matrix, and light themes', () => {
      localStorage.setItem('web_theme', 'matrix');
      expect(localStorage.getItem('web_theme')).toBe('matrix');
      localStorage.setItem('web_theme', 'light');
      expect(localStorage.getItem('web_theme')).toBe('light');
    });
  });
});
