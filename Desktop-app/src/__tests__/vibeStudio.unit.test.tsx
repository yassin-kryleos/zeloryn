// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VibeStudio } from '../components/VibeStudio';

const mockLocalStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockLocalStorage[key] || null,
  setItem: (key: string, value: string) => { mockLocalStorage[key] = value; },
  removeItem: (key: string) => { delete mockLocalStorage[key]; },
  clear: () => { for (const key in mockLocalStorage) delete mockLocalStorage[key]; }
});

describe('VibeStudio Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(cleanup);

  it('renders Vibe Studio header, starter ideas, and preview frame', () => {
    render(
      <VibeStudio
        activeProject={{ id: 'p1', name: 'My Next Big App' }}
        workspaceRoot="/home/user/project"
        isStreaming={false}
        onSendQuery={vi.fn()}
      />
    );

    expect(screen.getByText('VIBE STUDIO')).toBeInTheDocument();
    expect(screen.getByText(/BEGINNER FRIENDLY/i)).toBeInTheDocument();
    expect(screen.getByText('My Next Big App')).toBeInTheDocument();
    expect(screen.getByText(/How Vibe Coding Works/i)).toBeInTheDocument();

    // Check inspiration starters
    expect(screen.getByText(/Modern SaaS Landing Page/i)).toBeInTheDocument();
    expect(screen.getByText(/Crypto & Finance Dashboard/i)).toBeInTheDocument();

    // Check iframe
    const iframe = screen.getByTitle('Zeloryn Live Vibe Preview');
    expect(iframe).toBeInTheDocument();
  });

  it('populates prompt when clicking a starter card', () => {
    render(
      <VibeStudio
        activeProject={{ id: 'p1', name: 'Test App' }}
        workspaceRoot="/home/user/project"
        isStreaming={false}
        onSendQuery={vi.fn()}
      />
    );

    const starterBtn = screen.getByText(/Modern SaaS Landing Page/i).closest('button')!;
    fireEvent.click(starterBtn);

    const textarea = screen.getByPlaceholderText(/Describe what you want to build/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('Build a modern, sleek landing page');
  });

  it('calls onSendQuery when submitting a vibe request', () => {
    const onSendQuery = vi.fn();
    render(
      <VibeStudio
        activeProject={{ id: 'p1', name: 'Test App' }}
        workspaceRoot="/home/user/project"
        isStreaming={false}
        onSendQuery={onSendQuery}
      />
    );

    const textarea = screen.getByPlaceholderText(/Describe what you want to build/i);
    fireEvent.change(textarea, { target: { value: 'Build a calculator with retro buttons' } });

    const buildBtn = screen.getByRole('button', { name: /VIBE BUILD/i });
    fireEvent.click(buildBtn);

    expect(onSendQuery).toHaveBeenCalledTimes(1);
    expect(onSendQuery.mock.calls[0][0]).toContain('Build a calculator with retro buttons');
    expect(onSendQuery.mock.calls[0][1]).toBe('code');
  });

  it('switches viewport modes between desktop, tablet, and mobile', () => {
    render(
      <VibeStudio
        activeProject={{ id: 'p1', name: 'Test App' }}
        workspaceRoot="/home/user/project"
        isStreaming={false}
        onSendQuery={vi.fn()}
      />
    );

    const tabletBtn = screen.getByRole('button', { name: /Tablet/i });
    fireEvent.click(tabletBtn);

    const iframe = screen.getByTitle('Zeloryn Live Vibe Preview');
    expect(iframe.className).toContain('w-[768px]');

    const mobileBtn = screen.getByRole('button', { name: /Mobile/i });
    fireEvent.click(mobileBtn);
    expect(iframe.className).toContain('w-[375px]');
  });

  it('triggers onSwitchToPro when PRO MODE button is clicked', () => {
    const onSwitchToPro = vi.fn();
    render(
      <VibeStudio
        activeProject={{ id: 'p1', name: 'Test App' }}
        workspaceRoot="/home/user/project"
        isStreaming={false}
        onSendQuery={vi.fn()}
        onSwitchToPro={onSwitchToPro}
      />
    );

    const proBtn = screen.getByRole('button', { name: /PRO MODE/i });
    fireEvent.click(proBtn);
    expect(onSwitchToPro).toHaveBeenCalledWith('plan');
  });
});
