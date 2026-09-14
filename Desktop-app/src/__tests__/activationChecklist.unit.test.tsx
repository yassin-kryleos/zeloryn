// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ActivationChecklist } from '../components/ActivationChecklist';

const mockLocalStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockLocalStorage[key] || null,
  setItem: (key: string, value: string) => { mockLocalStorage[key] = value; },
  removeItem: (key: string) => { delete mockLocalStorage[key]; },
  clear: () => { for (const key in mockLocalStorage) delete mockLocalStorage[key]; }
});

describe('ActivationChecklist', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(cleanup);

  it('renders all 3 steps and action buttons when incomplete', () => {
    render(
      <ActivationChecklist
        hasModel={false}
        isDemoDone={false}
        isRepoDone={false}
        onConnectModel={vi.fn()}
        onRunDemo={vi.fn()}
        onPointAtRepo={vi.fn()}
      />
    );

    expect(screen.getByText(/Activation checklist/i)).toBeInTheDocument();
    expect(screen.getByText(/\(0\/3\)/)).toBeInTheDocument();
    expect(screen.getByText('Connect model')).toBeInTheDocument();
    expect(screen.getByText('Run demo trace')).toBeInTheDocument();
    expect(screen.getByText('Point at repo')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'CONNECT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'RUN DEMO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ADD REPO' })).toBeInTheDocument();
  });

  it('triggers onConnectModel when clicking row or CONNECT button', () => {
    const onConnectModel = vi.fn();
    render(
      <ActivationChecklist
        hasModel={false}
        isDemoDone={false}
        isRepoDone={false}
        onConnectModel={onConnectModel}
        onRunDemo={vi.fn()}
        onPointAtRepo={vi.fn()}
      />
    );

    // Click the button
    const connectBtn = screen.getByRole('button', { name: 'CONNECT' });
    fireEvent.click(connectBtn);
    expect(onConnectModel).toHaveBeenCalledTimes(1);

    // Click the row
    const row = screen.getByText('Connect model').closest('[data-testid^="checklist-step"]')!;
    fireEvent.click(row);
    expect(onConnectModel).toHaveBeenCalledTimes(2);
  });

  it('triggers onRunDemo when clicking row or RUN DEMO button', () => {
    const onRunDemo = vi.fn();
    render(
      <ActivationChecklist
        hasModel={true}
        isDemoDone={false}
        isRepoDone={false}
        onConnectModel={vi.fn()}
        onRunDemo={onRunDemo}
        onPointAtRepo={vi.fn()}
      />
    );

    const demoBtn = screen.getByRole('button', { name: 'RUN DEMO' });
    fireEvent.click(demoBtn);
    expect(onRunDemo).toHaveBeenCalledTimes(1);

    const row = screen.getByText('Run demo trace').closest('[data-testid^="checklist-step"]')!;
    fireEvent.click(row);
    expect(onRunDemo).toHaveBeenCalledTimes(2);
  });

  it('triggers onPointAtRepo when clicking row or ADD REPO button', () => {
    const onPointAtRepo = vi.fn();
    render(
      <ActivationChecklist
        hasModel={true}
        isDemoDone={true}
        isRepoDone={false}
        onConnectModel={vi.fn()}
        onRunDemo={vi.fn()}
        onPointAtRepo={onPointAtRepo}
      />
    );

    const addRepoBtn = screen.getByRole('button', { name: 'ADD REPO' });
    fireEvent.click(addRepoBtn);
    expect(onPointAtRepo).toHaveBeenCalledTimes(1);

    const row = screen.getByText('Point at repo').closest('[data-testid^="checklist-step"]')!;
    fireEvent.click(row);
    expect(onPointAtRepo).toHaveBeenCalledTimes(2);
  });

  it('supports keyboard Enter and Space activation on checklist rows', () => {
    const onPointAtRepo = vi.fn();
    render(
      <ActivationChecklist
        hasModel={false}
        isDemoDone={false}
        isRepoDone={false}
        onConnectModel={vi.fn()}
        onRunDemo={vi.fn()}
        onPointAtRepo={onPointAtRepo}
      />
    );

    const btn = screen.getByRole('button', { name: 'ADD REPO' });
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.click(btn);
    expect(onPointAtRepo).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(btn, { key: ' ' });
    fireEvent.click(btn);
    expect(onPointAtRepo).toHaveBeenCalledTimes(2);
  });

  it('displays completed state with DONE badge when a step is completed', () => {
    render(
      <ActivationChecklist
        hasModel={true}
        isDemoDone={false}
        isRepoDone={false}
        onConnectModel={vi.fn()}
        onRunDemo={vi.fn()}
        onPointAtRepo={vi.fn()}
      />
    );

    expect(screen.getByText(/\(1\/3\)/)).toBeInTheDocument();
    expect(screen.getByText('DONE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CONNECT' })).not.toBeInTheDocument();
  });

  it('minimizes when the close button is clicked and restores when chip is clicked', () => {
    render(
      <ActivationChecklist
        hasModel={true}
        isDemoDone={false}
        isRepoDone={false}
        onConnectModel={vi.fn()}
        onRunDemo={vi.fn()}
        onPointAtRepo={vi.fn()}
      />
    );

    const minimizeBtn = screen.getByRole('button', { name: /minimize activation checklist/i });
    fireEvent.click(minimizeBtn);

    // Full checklist should now be hidden, and floating chip shown
    expect(screen.queryByText('Connect model')).not.toBeInTheDocument();
    const chip = screen.getByRole('button', { name: /expand activation checklist/i });
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('ACTIVATION (1/3)');

    // Clicking chip restores full checklist
    fireEvent.click(chip);
    expect(screen.getByText('Connect model')).toBeInTheDocument();
  });

  it('renders null when all 3 steps are complete', () => {
    const { container } = render(
      <ActivationChecklist
        hasModel={true}
        isDemoDone={true}
        isRepoDone={true}
        onConnectModel={vi.fn()}
        onRunDemo={vi.fn()}
        onPointAtRepo={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
