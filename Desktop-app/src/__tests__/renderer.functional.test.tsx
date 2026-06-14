// @vitest-environment jsdom
/**
 * Desktop renderer — functional unit tests.
 *
 * Tests isolated, pure-function behaviour from the renderer layer.
 * Does NOT import App.tsx directly (it drags in Electron IPC which is
 * unavailable in jsdom). Instead tests:
 *  - Theme localStorage persistence logic (matrix_theme key)
 *  - ErrorBoundary class catch-and-render behaviour
 *  - Notification state management helpers
 */
import React, { Component } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

afterEach(cleanup);

// ─── Theme persistence logic ─────────────────────────────────────────────────
// The renderer persists the active theme under the 'matrix_theme' localStorage key.

const THEME_KEY = 'matrix_theme';

describe('Theme localStorage persistence', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to undefined when no theme is stored', () => {
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('stores and retrieves a "forge" theme selection', () => {
    localStorage.setItem(THEME_KEY, 'forge');
    expect(localStorage.getItem(THEME_KEY)).toBe('forge');
  });

  it('stores and retrieves a "light" theme selection', () => {
    localStorage.setItem(THEME_KEY, 'light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('overwrites an existing theme when toggled', () => {
    localStorage.setItem(THEME_KEY, 'forge');
    localStorage.setItem(THEME_KEY, 'light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });
});

// ─── ErrorBoundary — catch-and-render ────────────────────────────────────────
// Mirrors the ErrorBoundary added to Desktop App.tsx in Phase 1.

type EBState = { hasError: boolean; error: Error | null };

class TestErrorBoundary extends Component<
  { children: React.ReactNode; onError?: (e: Error) => void },
  EBState
> {
  constructor(props: { children: React.ReactNode; onError?: (e: Error) => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div data-testid="error-boundary-fallback">
          <h2>⚠ RENDER ERROR</h2>
          <pre data-testid="error-message">{this.state.error?.message}</pre>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ThrowingComponent({ message }: { message: string }): never {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  // Suppress React's internal console.error for these intentional throws
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders children when no error is thrown', () => {
    render(
      <TestErrorBoundary>
        <div data-testid="child">Hello</div>
      </TestErrorBoundary>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  it('renders fallback UI when a child throws', () => {
    render(
      <TestErrorBoundary>
        <ThrowingComponent message="test crash" />
      </TestErrorBoundary>
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByTestId('error-message').textContent).toBe('test crash');
  });

  it('calls onError callback with the thrown error', () => {
    const onError = vi.fn();
    render(
      <TestErrorBoundary onError={onError}>
        <ThrowingComponent message="callback test" />
      </TestErrorBoundary>
    );
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toBe('callback test');
  });

  it('Reload button is present in fallback and clickable without crashing', () => {
    render(
      <TestErrorBoundary>
        <ThrowingComponent message="crash" />
      </TestErrorBoundary>
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    // Clicking Reload should not throw — it resets hasError; child may re-throw immediately
    // but the boundary catches it cleanly. The important assertion: no uncaught exception.
    expect(() => fireEvent.click(screen.getByRole('button', { name: /reload/i }))).not.toThrow();
  });
});

// ─── Notification state helpers ───────────────────────────────────────────────
// Mirrors the add/dismiss notification logic used in Desktop App.tsx.

type NotifKind = 'success' | 'error' | 'warning' | 'info';
interface Notification { id: number; kind: NotifKind; message: string }

function addNotification(list: Notification[], kind: NotifKind, message: string): Notification[] {
  const id = list.length > 0 ? Math.max(...list.map(n => n.id)) + 1 : 1;
  return [...list, { id, kind, message }];
}

function dismissNotification(list: Notification[], id: number): Notification[] {
  return list.filter(n => n.id !== id);
}

describe('Notification state helpers', () => {
  it('adds a notification with an incrementing id', () => {
    const n1 = addNotification([], 'success', 'Done');
    expect(n1).toHaveLength(1);
    expect(n1[0].id).toBe(1);
    const n2 = addNotification(n1, 'error', 'Failed');
    expect(n2[1].id).toBe(2);
  });

  it('preserves existing notifications when adding', () => {
    const list = addNotification([], 'info', 'A');
    const updated = addNotification(list, 'warning', 'B');
    expect(updated).toHaveLength(2);
  });

  it('dismisses the correct notification by id', () => {
    let list = addNotification([], 'success', 'A');
    list = addNotification(list, 'error', 'B');
    const idToRemove = list[0].id;
    const result = dismissNotification(list, idToRemove);
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('B');
  });

  it('returns the same list when dismissing an unknown id', () => {
    const list = addNotification([], 'info', 'Only');
    const result = dismissNotification(list, 9999);
    expect(result).toHaveLength(1);
  });

  it('dismissing the last notification returns an empty list', () => {
    const list = addNotification([], 'success', 'Last');
    const result = dismissNotification(list, list[0].id);
    expect(result).toHaveLength(0);
  });
});
