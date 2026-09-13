// @vitest-environment jsdom
/**
 * Desktop component unit tests — FeatureBadge and NotificationCenter.
 *
 * These components have no Electron IPC dependency and can be rendered
 * in jsdom. Tests verify correct rendering, prop handling, and interactions.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FeatureBadge } from '../components/FeatureBadge';
import { NotificationCenter, type AppNotification } from '../components/NotificationCenter';

afterEach(cleanup);

// ─── FeatureBadge ─────────────────────────────────────────────────────────────

describe('FeatureBadge', () => {
  it('renders with an explicit status prop', () => {
    render(<FeatureBadge status="production" />);
    expect(screen.getByText(/production/i)).toBeInTheDocument();
  });

  it('renders with an explicit label prop', () => {
    render(<FeatureBadge status="preview" label="BETA" />);
    expect(screen.getByText('BETA')).toBeInTheDocument();
  });

  it('renders a "planned" badge by default when no status or id is supplied', () => {
    render(<FeatureBadge />);
    expect(screen.getByText(/planned/i)).toBeInTheDocument();
  });

  it('renders all valid status values without throwing', () => {
    const statuses = ['production', 'preview', 'simulator', 'mock', 'planned'] as const;
    for (const s of statuses) {
      const { unmount } = render(<FeatureBadge status={s} />);
      expect(document.body).toBeInTheDocument();
      unmount();
    }
  });

  it('renders as a <span> element', () => {
    const { container } = render(<FeatureBadge status="production" />);
    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('applies compact class when compact={true}', () => {
    const { container } = render(<FeatureBadge status="preview" compact={true} />);
    const span = container.querySelector('span');
    expect(span?.className).toMatch(/px-1\s/);
  });

  it('applies larger padding when compact={false}', () => {
    const { container } = render(<FeatureBadge status="preview" compact={false} />);
    const span = container.querySelector('span');
    expect(span?.className).toMatch(/px-1\.5/);
  });

  it('resolves a known feature id to its status', () => {
    render(<FeatureBadge id="localWorkspace" />);
    expect(screen.getByText(/production/i)).toBeInTheDocument();
  });

  it('resolves cloudSync id to planned/local-only status', () => {
    render(<FeatureBadge id="cloudSync" />);
    expect(screen.getByText(/planned|local-only/i)).toBeInTheDocument();
  });
});

// ─── NotificationCenter ───────────────────────────────────────────────────────

const makeNotification = (overrides: Partial<AppNotification> = {}): AppNotification => ({
  id: 1,
  kind: 'info',
  message: 'Test notification',
  ...overrides,
});

describe('NotificationCenter', () => {
  it('renders nothing when notifications list is empty', () => {
    const { container } = render(
      <NotificationCenter notifications={[]} onDismiss={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a notification message', () => {
    render(
      <NotificationCenter
        notifications={[makeNotification({ message: 'Hello QA' })]}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText('Hello QA')).toBeInTheDocument();
  });

  it('renders all four notification kinds without throwing', () => {
    const kinds = ['success', 'error', 'warning', 'info'] as const;
    for (const kind of kinds) {
      const { unmount } = render(
        <NotificationCenter
          notifications={[makeNotification({ kind, id: 1 })]}
          onDismiss={vi.fn()}
        />
      );
      expect(document.body).toBeInTheDocument();
      unmount();
    }
  });

  it('renders multiple notifications', () => {
    const notifications: AppNotification[] = [
      { id: 1, kind: 'success', message: 'First' },
      { id: 2, kind: 'error', message: 'Second' },
      { id: 3, kind: 'warning', message: 'Third' },
    ];
    render(<NotificationCenter notifications={notifications} onDismiss={vi.fn()} />);
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
  });

  it('calls onDismiss with the correct id when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <NotificationCenter
        notifications={[makeNotification({ id: 42, message: 'Dismiss me' })]}
        onDismiss={onDismiss}
      />
    );
    const dismissBtn = screen.getByRole('button');
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledWith(42);
  });

  it('does not call onDismiss before any interaction', () => {
    const onDismiss = vi.fn();
    render(
      <NotificationCenter
        notifications={[makeNotification()]}
        onDismiss={onDismiss}
      />
    );
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
