// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VibeStudio } from '../components/VibeStudio';
import type { ProjectTask } from '../backend/db';

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
    expect(screen.getByText(/FRIENDLY/i)).toBeInTheDocument();
    expect(screen.getByText('My Next Big App')).toBeInTheDocument();
    expect(screen.getByText(/How Vibe Coding Works/i)).toBeInTheDocument();

    // Check inspiration starters
    expect(screen.getByText(/Modern SaaS Landing Page/i)).toBeInTheDocument();
    expect(screen.getByText(/Finance & Analytics Dashboard/i)).toBeInTheDocument();

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

  it('switches viewport modes between desktop, tablet, and mobile with device bezels', () => {
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
    expect(screen.getByTitle('Zeloryn Tablet Preview')).toBeInTheDocument();

    const mobileBtn = screen.getByRole('button', { name: /Mobile/i });
    fireEvent.click(mobileBtn);
    expect(screen.getByTitle('Zeloryn Mobile Preview')).toBeInTheDocument();
  });

  it('renders planned FLOW task with criteria and supports auto-prompt and mark-done', () => {
    const mockTask: ProjectTask = {
      id: 'task-101',
      title: 'Implement Dark Mode Toggle',
      category: 'frontend',
      status: 'todo',
      acceptanceCriteria: [
        {
          id: 'crit-1',
          description: 'Dark mode class toggles on body',
          target: 'body.theme-dark',
          type: 'symbol_exists',
          phase: 'phase1',
          status: 'fail'
        }
      ]
    };

    const onSaveTasks = vi.fn();
    const onNotify = vi.fn();

    render(
      <VibeStudio
        activeProject={{ id: 'p1', name: 'Test App' }}
        workspaceRoot="/home/user/project"
        tasks={[mockTask]}
        selectedTaskId="task-101"
        onSaveTasks={onSaveTasks}
        onNotify={onNotify}
        isStreaming={false}
        onSendQuery={vi.fn()}
      />
    );

    // Verify task goal card renders
    expect(screen.getByText('Planned Feature')).toBeInTheDocument();
    expect(screen.getByText('Implement Dark Mode Toggle')).toBeInTheDocument();
    expect(screen.getByText('Dark mode class toggles on body')).toBeInTheDocument();

    // Auto-prompt from task
    const autoPromptBtn = screen.getByText(/Auto-Prompt from Task/i);
    fireEvent.click(autoPromptBtn);

    const textarea = screen.getByPlaceholderText(/Describe what you want to build/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('Implement planned feature: "Implement Dark Mode Toggle"');
    expect(textarea.value).toContain('Dark mode class toggles on body');

    // Mark done in flow
    const markDoneBtn = screen.getByRole('button', { name: /Mark Done in Flow/i });
    fireEvent.click(markDoneBtn);

    expect(onSaveTasks).toHaveBeenCalledTimes(1);
    expect(onSaveTasks.mock.calls[0][0][0].status).toBe('done');
    expect(onNotify).toHaveBeenCalledWith(expect.stringContaining('completed in FLOW'), 'success');
  });

  it('switches dev server port with 1-click port pills', () => {
    render(
      <VibeStudio
        activeProject={{ id: 'p1', name: 'Test App' }}
        workspaceRoot="/home/user/project"
        isStreaming={false}
        onSendQuery={vi.fn()}
      />
    );

    const port5174Btn = screen.getByTitle('Switch to port 5174');
    fireEvent.click(port5174Btn);

    const urlInput = screen.getByPlaceholderText('http://localhost:5173') as HTMLInputElement;
    expect(urlInput.value).toBe('http://localhost:5174');
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
