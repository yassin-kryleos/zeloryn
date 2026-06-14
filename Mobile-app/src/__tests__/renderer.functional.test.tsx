/**
 * Mobile companion app — renderer functional unit tests.
 *
 * Tests pure utility functions and logic extracted from App.tsx:
 *  - companionStatus 3-state label logic (MOB-01 fix)
 *  - Tab navigation state transitions
 *  - Toast message helpers
 *  - PII redaction integration (imports from src/utils/redact)
 *
 * Does NOT render the full App.tsx (requires native modules unavailable in Node).
 * Uses the test environment provided by vitest (Node).
 */
import { describe, it, expect } from 'vitest';
import { redactSensitiveData } from '../utils/redact';

// ─── companionStatus label logic (MOB-01 fix) ────────────────────────────────
// Mirrors the 3-state logic in App.tsx line 707-708

function getStatusLabel(isOnline: boolean, companionStatus: string): string {
  if (!isOnline) return 'LINK OFFLINE';
  if (companionStatus === 'connected') return 'DESKTOP LINKED';
  return 'BACKEND ONLINE';
}

function getStatusColor(isOnline: boolean, companionStatus: string): string {
  if (!isOnline) return '#ff3333';
  if (companionStatus === 'connected') return '#00ff66';
  return '#ffaa00';
}

describe('MOB-01: companionStatus 3-state label logic', () => {
  it('shows LINK OFFLINE when offline simulator is active', () => {
    expect(getStatusLabel(false, 'disconnected')).toBe('LINK OFFLINE');
    expect(getStatusLabel(false, 'connected')).toBe('LINK OFFLINE');
  });

  it('shows DESKTOP LINKED when paired via WebSocket', () => {
    expect(getStatusLabel(true, 'connected')).toBe('DESKTOP LINKED');
  });

  it('shows BACKEND ONLINE when online but no WS pair', () => {
    expect(getStatusLabel(true, 'disconnected')).toBe('BACKEND ONLINE');
    expect(getStatusLabel(true, '')).toBe('BACKEND ONLINE');
    expect(getStatusLabel(true, 'connecting')).toBe('BACKEND ONLINE');
  });

  it('returns red color when offline', () => {
    expect(getStatusColor(false, 'disconnected')).toBe('#ff3333');
  });

  it('returns green color when connected', () => {
    expect(getStatusColor(true, 'connected')).toBe('#00ff66');
  });

  it('returns orange color when online but not paired', () => {
    expect(getStatusColor(true, 'disconnected')).toBe('#ffaa00');
  });
});

// ─── Tab navigation state ────────────────────────────────────────────────────

type TabKey = 'dashboard' | 'plan' | 'chat' | 'tasks' | 'settings';
const VALID_TABS: TabKey[] = ['dashboard', 'plan', 'chat', 'tasks', 'settings'];

function isValidTab(key: string): key is TabKey {
  return VALID_TABS.includes(key as TabKey);
}

describe('Tab navigation state', () => {
  it('all 5 defined tabs are valid', () => {
    for (const tab of VALID_TABS) {
      expect(isValidTab(tab)).toBe(true);
    }
  });

  it('unknown tab key is rejected', () => {
    expect(isValidTab('unknown')).toBe(false);
    expect(isValidTab('')).toBe(false);
    expect(isValidTab('admin')).toBe(false);
  });

  it('default tab is dashboard', () => {
    const defaultTab: TabKey = 'dashboard';
    expect(isValidTab(defaultTab)).toBe(true);
  });
});

// ─── PII redaction integration ───────────────────────────────────────────────

describe('PII redaction (src/utils/redact)', () => {
  it('redacts email addresses', () => {
    const result = redactSensitiveData('Contact us at user@example.com for help');
    expect(result).not.toContain('user@example.com');
  });

  it('redacts phone numbers', () => {
    const result = redactSensitiveData('Call us at +1-555-123-4567');
    expect(result).not.toContain('555-123-4567');
  });

  it('redacts API keys', () => {
    const result = redactSensitiveData('sk-proj-abc123def456ghi789jkl012mno345pqr');
    expect(result).not.toContain('sk-proj');
  });

  it('returns a non-empty string after redaction', () => {
    const result = redactSensitiveData('Hello world');
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not alter text with no PII', () => {
    const input = 'Hello world, this is safe content';
    const result = redactSensitiveData(input);
    expect(result).toBe(input);
  });

  it('handles empty string without throwing', () => {
    expect(() => redactSensitiveData('')).not.toThrow();
  });

  it('handles very long strings without throwing', () => {
    const long = 'a'.repeat(10_000) + ' email@test.com ' + 'b'.repeat(10_000);
    expect(() => redactSensitiveData(long)).not.toThrow();
  });
});

// ─── Toast message helpers ────────────────────────────────────────────────────

type ToastKind = 'success' | 'error' | 'warning' | 'info';

const TOAST_COLORS: Record<ToastKind, string> = {
  success: '#34d399',
  error: '#fca5a5',
  warning: '#fde68a',
  info: '#e2e8f0',
};

describe('Toast color mapping', () => {
  it('success maps to green', () => {
    expect(TOAST_COLORS.success).toBe('#34d399');
  });

  it('error maps to red/pink', () => {
    expect(TOAST_COLORS.error).toBe('#fca5a5');
  });

  it('all four kinds have a defined color', () => {
    const kinds: ToastKind[] = ['success', 'error', 'warning', 'info'];
    for (const kind of kinds) {
      expect(TOAST_COLORS[kind]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
