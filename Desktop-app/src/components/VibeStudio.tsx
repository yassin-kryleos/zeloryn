import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Monitor,
  Tablet,
  Smartphone,
  ExternalLink,
  FolderOpen,
  Send,
  Square,
  RefreshCw,
  Code,
  CheckCircle2,
  Circle,
  Trash2,
  ChevronDown,
  Layers,
  ListChecks,
  Check
} from 'lucide-react';
import type { AgentLog } from '../backend/agents';
import type { ProjectTask, AcceptanceCriterion } from '../backend/db';

export interface VibeStudioProps {
  activeProject: any | null;
  workspaceRoot: string;
  isStreaming: boolean;
  streamingContent?: string;
  logs?: AgentLog[];
  tasks?: ProjectTask[];
  onSaveTasks?: (tasks: ProjectTask[]) => void;
  selectedTaskId?: string | null;
  onSelectTask?: (taskId: string | null) => void;
  onSendQuery: (query: string, space?: string) => void;
  onAbort?: () => void;
  onNotify?: (message: string, kind?: 'success' | 'error' | 'warning' | 'info') => void;
  onSwitchToPro?: (space: 'plan' | 'cowork' | 'project' | 'code') => void;
  onOpenProjectModal?: () => void;
}

interface VibeMessage {
  id: string;
  sender: 'user' | 'zeloryn';
  text: string;
  timestamp: string;
}

const STARTER_PROMPTS = [
  {
    title: 'Modern SaaS Landing Page',
    prompt: 'Build a modern, sleek landing page with a hero section, pricing table, testimonial carousel, and dark mode toggle.'
  },
  {
    title: 'Finance & Analytics Dashboard',
    prompt: 'Build an interactive financial dashboard with real-time price cards, portfolio balance calculator, and trend charts.'
  },
  {
    title: 'Minimalist Notes & Tasks',
    prompt: 'Build a clean, aesthetic notes app with drag-and-drop task lists, search filter, and localStorage persistence.'
  },
  {
    title: 'Retro Arcade Web Game',
    prompt: 'Build an interactive retro arcade game in HTML5 canvas with keyboard controls, sound effects, and high scores.'
  },
  {
    title: 'Freelance Invoice Generator',
    prompt: 'Build an invoice generator that calculates line items, taxes, discounts, and renders a clean printable PDF layout.'
  }
];

const QUICK_MODIFIERS = [
  { label: 'Add Dark Mode', text: 'Add a beautiful dark mode / light mode toggle.' },
  { label: 'Make Responsive', text: 'Ensure the layout is fully responsive on mobile and tablet screens.' },
  { label: 'Polish UI', text: 'Enhance typography, subtle shadows, smooth hover transitions, and rounded corners.' },
  { label: 'Add Sample Data', text: 'Populate with realistic sample data and interactive dummy actions.' },
  { label: 'Save to Storage', text: 'Persist all user edits and state to localStorage so data survives reloads.' }
];

const COMMON_PORTS = ['5173', '5174', '3000', '8080'];

export const VibeStudio: React.FC<VibeStudioProps> = ({
  activeProject,
  workspaceRoot,
  isStreaming,
  streamingContent,
  logs = [],
  tasks = [],
  onSaveTasks,
  selectedTaskId,
  onSelectTask,
  onSendQuery,
  onAbort,
  onNotify,
  onSwitchToPro,
  onOpenProjectModal
}) => {
  const [inputPrompt, setInputPrompt] = useState('');
  const [viewportMode, setViewportMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewUrl, setPreviewUrl] = useState('http://localhost:5173');
  const [previewKey, setPreviewKey] = useState(0);
  const [isTaskSelectorOpen, setIsTaskSelectorOpen] = useState(false);
  const [messages, setMessages] = useState<VibeMessage[]>(() => {
    try {
      const saved = localStorage.getItem('zeloryn_vibe_chat');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Active task from FLOW
  const activeTask = tasks.find(t => t.id === selectedTaskId) ||
    tasks.find(t => t.status !== 'done') ||
    (tasks.length > 0 ? tasks[0] : null);

  useEffect(() => {
    try {
      localStorage.setItem('zeloryn_vibe_chat', JSON.stringify(messages));
    } catch {
      // ignore storage errors
    }
    if (typeof chatEndRef.current?.scrollIntoView === 'function') {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  // When agent streaming finishes, append agent message to chat if not already captured
  const lastLog = logs[logs.length - 1];
  useEffect(() => {
    if (!isStreaming && lastLog && lastLog.message && (lastLog.type === 'result' || lastLog.type === 'info')) {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.sender === 'zeloryn' && last.text === lastLog.message) return prev;
        return [
          ...prev,
          {
            id: `msg-${Date.now()}`,
            sender: 'zeloryn',
            text: lastLog.message,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ];
      });
    }
  }, [isStreaming, lastLog]);

  const handleSend = () => {
    const trimmed = inputPrompt.trim();
    if (!trimmed || isStreaming) return;

    const newMsg: VibeMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newMsg]);
    setInputPrompt('');

    // Prepend vibe coding instruction with active task context if present
    let taskContext = '';
    if (activeTask) {
      const criteriaList = (activeTask.acceptanceCriteria || [])
        .map(c => `- ${c.description || c.target}`)
        .join('\n');
      taskContext = `\nActive Planned Task: "${activeTask.title}" (${activeTask.category || 'general'})\nRequirements/Criteria:\n${criteriaList || 'None specified'}\n`;
    }

    const vibeQuery = `[VIBE CODING REQUEST]${taskContext}\nThe user wants to build/modify the application in natural language:\n\n${trimmed}\n\nPlease implement the necessary files, components, and ensure the dev server / preview runs cleanly. Explain what you created in friendly, accessible language.`;
    onSendQuery(vibeQuery, 'code');
  };

  const handleAutoPromptTask = () => {
    if (!activeTask) return;
    const criteriaList = (activeTask.acceptanceCriteria || [])
      .map((c, i) => `${i + 1}. ${c.description || c.target}`)
      .join('\n');

    const promptText = `Implement planned feature: "${activeTask.title}"\n${criteriaList ? `Requirements:\n${criteriaList}\n` : ''}Make sure the components look modern, responsive, and testable in the live preview canvas.`;
    setInputPrompt(promptText);
  };

  const handleToggleCriterion = (criterionId: string) => {
    if (!activeTask || !onSaveTasks) return;
    const updatedTasks = tasks.map(t => {
      if (t.id !== activeTask.id) return t;
      const updatedCriteria = (t.acceptanceCriteria || []).map(c => {
        if (c.id === criterionId) {
          const nextStatus: 'pass' | 'fail' = c.status === 'pass' ? 'fail' : 'pass';
          return { ...c, status: nextStatus };
        }
        return c;
      });
      return { ...t, acceptanceCriteria: updatedCriteria };
    });
    onSaveTasks(updatedTasks);
  };

  const handleMarkTaskDone = () => {
    if (!activeTask || !onSaveTasks) return;
    const updatedTasks = tasks.map(t => {
      if (t.id !== activeTask.id) return t;
      return { ...t, status: 'done' as const };
    });
    onSaveTasks(updatedTasks);
    onNotify?.(`Marked "${activeTask.title}" as completed in FLOW!`, 'success');
  };

  const handleClearChat = () => {
    setMessages([]);
    try {
      localStorage.removeItem('zeloryn_vibe_chat');
    } catch {
      // ignore
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleOpenExternal = () => {
    if ((window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(previewUrl);
    } else {
      window.open(previewUrl, '_blank');
    }
  };

  const handleOpenFolder = () => {
    if ((window as any).electronAPI?.openPath && workspaceRoot) {
      (window as any).electronAPI.openPath(workspaceRoot);
    } else {
      onNotify?.(`Project Folder: ${workspaceRoot}`, 'info');
    }
  };

  const handlePortSelect = (port: string) => {
    setPreviewUrl(`http://localhost:${port}`);
    setPreviewKey(k => k + 1);
  };

  return (
    <div className="h-full w-full flex flex-row overflow-hidden bg-forge-bg text-forge-text font-sans select-none">
      {/* LEFT PANEL: Conversational Creator Studio (44% width) */}
      <div className="w-[44%] min-w-[380px] max-w-[580px] h-full border-r border-forge-dark flex flex-col bg-forge-panel-bg">
        {/* Vibe Header */}
        <div className="p-3 border-b border-forge-dark flex items-center justify-between bg-black/30 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-forge-neon/15 border border-forge-neon/40 flex items-center justify-center text-forge-neon shrink-0">
              <Sparkles size={15} />
            </div>
            <div>
              <div className="text-xs font-bold text-forge-neon tracking-wide flex items-center gap-1.5">
                <span>VIBE STUDIO</span>
                <span className="text-[8.5px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1 py-0.2 rounded font-mono font-bold">
                  FRIENDLY
                </span>
              </div>
              <div className="text-[10px] text-forge-dim">
                Visual software builder · Describe in plain English
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearChat}
                className="p-1 rounded text-forge-dim hover:text-red-400 hover:bg-black/30 transition-all cursor-pointer"
                title="Clear conversation"
              >
                <Trash2 size={12} />
              </button>
            )}
            {onSwitchToPro && (
              <button
                type="button"
                onClick={() => onSwitchToPro('plan')}
                className="text-[10px] font-mono font-bold px-2 py-1 rounded border border-forge-dark bg-black/40 hover:border-forge-neon text-forge-dim hover:text-forge-neon transition-all flex items-center gap-1 cursor-pointer"
                title="Switch to Pro Mode to inspect files, terminal, and agent workflows"
              >
                <Code size={11} />
                <span>PRO MODE</span>
              </button>
            )}
          </div>
        </div>

        {/* Project Target Bar */}
        <div className="px-3 py-1.5 bg-forge-very-dark/90 border-b border-forge-dark flex items-center justify-between text-[10.5px] font-mono shrink-0">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-forge-dim">Project:</span>
            <span className="text-forge-text font-bold truncate">
              {activeProject?.name || 'Untitled App'}
            </span>
          </div>
          {onOpenProjectModal && (
            <button
              type="button"
              onClick={onOpenProjectModal}
              className="text-[9.5px] text-forge-neon hover:underline cursor-pointer bg-transparent border-0 outline-none"
            >
              Change
            </button>
          )}
        </div>

        {/* Planned Feature Goal Card (Bridge from PLAN / CREW / FLOW) */}
        {activeTask ? (
          <div className="p-2.5 bg-black/40 border-b border-forge-dark shrink-0">
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-forge-neon animate-pulse" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-forge-neon flex items-center gap-1">
                  <Layers size={10} />
                  <span>Planned Feature</span>
                </span>
                {activeTask.category && (
                  <span className="text-[8.5px] px-1 py-0.2 rounded border border-forge-dark text-forge-dim font-mono uppercase">
                    {activeTask.category}
                  </span>
                )}
                <span className={`text-[8.5px] px-1 py-0.2 rounded font-mono uppercase font-bold ${
                  activeTask.status === 'done'
                    ? 'border border-emerald-600 text-emerald-400 bg-emerald-500/10'
                    : 'border border-amber-600 text-amber-300 bg-amber-500/10'
                }`}>
                  {activeTask.status === 'done' ? '✓ Completed' : 'In Flow'}
                </span>
              </div>

              {/* Task switcher dropdown */}
              {tasks.length > 1 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsTaskSelectorOpen(!isTaskSelectorOpen)}
                    className="text-[9.5px] font-mono text-forge-dim hover:text-forge-neon flex items-center gap-0.5 cursor-pointer bg-transparent border-0"
                  >
                    <span>Switch</span>
                    <ChevronDown size={10} />
                  </button>
                  {isTaskSelectorOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-forge-very-dark border border-forge-dark rounded shadow-2xl p-1 max-h-48 overflow-y-auto space-y-0.5">
                      {tasks.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            onSelectTask?.(t.id);
                            setIsTaskSelectorOpen(false);
                          }}
                          className={`w-full text-left p-1.5 rounded text-[10px] font-mono flex items-center justify-between cursor-pointer ${
                            t.id === activeTask.id
                              ? 'bg-forge-neon/15 text-forge-neon font-bold'
                              : 'text-forge-text hover:bg-black/40'
                          }`}
                        >
                          <span className="truncate flex-1">{t.title}</span>
                          {t.status === 'done' && <Check size={10} className="text-emerald-400 shrink-0 ml-1" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Task Title */}
            <div className="text-xs font-bold text-forge-text mb-2 line-clamp-2">
              {activeTask.title}
            </div>

            {/* Acceptance Criteria Checklist */}
            {(activeTask.acceptanceCriteria || []).length > 0 && (
              <div className="mb-2 space-y-1 bg-black/30 p-2 rounded border border-forge-dark/60 max-h-28 overflow-y-auto">
                <div className="text-[9px] font-mono text-forge-dim uppercase tracking-wider flex items-center gap-1 mb-1">
                  <ListChecks size={10} />
                  <span>Acceptance Criteria</span>
                </div>
                {activeTask.acceptanceCriteria!.map(criterion => {
                  const isPassed = criterion.status === 'pass';
                  return (
                    <button
                      key={criterion.id}
                      type="button"
                      onClick={() => handleToggleCriterion(criterion.id)}
                      className="w-full flex items-start gap-1.5 text-left cursor-pointer group hover:bg-white/5 p-0.5 rounded transition-colors"
                    >
                      {isPassed ? (
                        <CheckCircle2 size={12} className="text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <Circle size={12} className="text-forge-dim group-hover:text-forge-text shrink-0 mt-0.5" />
                      )}
                      <span className={`text-[10px] leading-tight ${isPassed ? 'text-emerald-300 line-through opacity-75' : 'text-forge-text'}`}>
                        {criterion.description || criterion.target}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Task Goal Action Buttons */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-forge-dark/40">
              <button
                type="button"
                onClick={handleAutoPromptTask}
                className="text-[9.5px] font-mono font-bold text-forge-neon hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0"
              >
                <Sparkles size={10} />
                <span>Auto-Prompt from Task</span>
              </button>
              {activeTask.status !== 'done' && onSaveTasks && (
                <button
                  type="button"
                  onClick={handleMarkTaskDone}
                  className="px-2 py-0.5 rounded text-[9.5px] font-mono font-bold border border-emerald-600 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Check size={10} />
                  <span>Mark Done in Flow</span>
                </button>
              )}
            </div>
          </div>
        ) : null}

        {/* Chat / Idea Stream */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
          {messages.length === 0 ? (
            <div className="py-2 space-y-3">
              <div className="p-3 rounded-lg border border-forge-dark bg-black/30 space-y-1.5">
                <div className="text-xs font-bold text-forge-text flex items-center gap-1.5">
                  <Sparkles size={13} className="text-forge-neon" />
                  <span>How Vibe Coding Works</span>
                </div>
                <p className="text-[11px] text-forge-dim leading-relaxed">
                  You don't need coding expertise. Just type what you want to build or click an idea below. Zeloryn generates the full application code and runs it interactively on the right canvas.
                </p>
              </div>

              <div className="space-y-1.5">
                <span className="text-[9.5px] font-bold text-forge-dim uppercase tracking-wider block font-mono">
                  Starter Ideas (Click to load):
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  {STARTER_PROMPTS.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => setInputPrompt(item.prompt)}
                      className="text-left p-2 rounded border border-forge-dark bg-black/20 hover:border-forge-neon/60 hover:bg-forge-neon/5 transition-all cursor-pointer group"
                    >
                      <div className="text-[11px] font-bold text-forge-text group-hover:text-forge-neon">
                        {item.title}
                      </div>
                      <div className="text-[10px] text-forge-dim line-clamp-1 mt-0.5">
                        {item.prompt}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1 mb-1 text-[9px] font-mono text-forge-dim">
                  <span>{msg.sender === 'user' ? 'You' : 'Zeloryn Builder'}</span>
                  <span>·</span>
                  <span>{msg.timestamp}</span>
                </div>
                <div
                  className={`p-3 rounded-lg text-xs leading-relaxed max-w-[90%] whitespace-pre-wrap ${
                    msg.sender === 'user'
                      ? 'bg-forge-neon text-forge-very-dark font-medium'
                      : 'bg-forge-very-dark border border-forge-dark text-forge-text'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))
          )}

          {/* Streaming Feedback Card */}
          {isStreaming && (
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-1.5 text-[9px] font-mono text-forge-neon mb-1 animate-pulse">
                <RefreshCw size={10} className="animate-spin" />
                <span>Zeloryn is crafting your software...</span>
              </div>
              <div className="p-3 rounded-lg text-xs leading-relaxed bg-forge-very-dark border border-forge-neon/50 text-forge-text font-mono max-w-[95%]">
                {streamingContent || 'Writing code, configuring dependencies, and compiling live preview...'}
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar with Quick Action Chips */}
        <div className="p-2.5 border-t border-forge-dark bg-forge-very-dark shrink-0">
          {/* Persistent Quick Action Chips Bar */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1.5 mb-1.5 no-scrollbar">
            {QUICK_MODIFIERS.map(mod => (
              <button
                key={mod.label}
                type="button"
                onClick={() => setInputPrompt(prev => prev ? `${prev} ${mod.text}` : mod.text)}
                className="shrink-0 px-2 py-0.5 rounded border border-forge-dark hover:border-forge-neon bg-black/40 text-[9.5px] font-mono text-forge-dim hover:text-forge-neon cursor-pointer transition-all"
              >
                {mod.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <textarea
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder="Describe what you want to build or change in plain English..."
              rows={2}
              className="w-full bg-black/40 border border-forge-dark rounded-md p-2 text-xs text-forge-text placeholder:text-forge-dim outline-none focus:border-forge-neon transition-colors resize-none disabled:opacity-50"
            />
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-forge-dim font-mono">
                <kbd className="bg-black/60 px-1 py-0.5 rounded border border-forge-dark">Enter</kbd> build · <kbd className="bg-black/60 px-1 py-0.5 rounded border border-forge-dark">Shift+Enter</kbd> newline
              </span>
              <div className="flex gap-1.5">
                {isStreaming && onAbort && (
                  <button
                    type="button"
                    onClick={onAbort}
                    className="forge-stop-button px-2.5 py-1 text-[10px] font-mono flex items-center gap-1 cursor-pointer"
                  >
                    <Square size={10} />
                    <span>STOP</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!inputPrompt.trim() || isStreaming}
                  className="forge-btn px-3.5 py-1 text-[10px] font-mono font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Send size={10} />
                  <span>VIBE BUILD</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Live Interactive App Preview (56% width) */}
      <div className="flex-1 h-full flex flex-col overflow-hidden bg-black/60">
        {/* Preview Toolbar */}
        <div className="p-2 border-b border-forge-dark bg-forge-very-dark flex items-center justify-between gap-2 font-mono text-[10px] shrink-0">
          {/* Viewport simulation selector */}
          <div className="flex items-center gap-1 bg-black/40 border border-forge-dark rounded p-0.5">
            <button
              type="button"
              onClick={() => setViewportMode('desktop')}
              className={`px-2 py-1 rounded flex items-center gap-1 cursor-pointer transition-all ${
                viewportMode === 'desktop'
                  ? 'bg-forge-neon text-forge-very-dark font-bold'
                  : 'text-forge-dim hover:text-forge-text'
              }`}
              title="Desktop View (100%)"
            >
              <Monitor size={11} />
              <span>Desktop</span>
            </button>
            <button
              type="button"
              onClick={() => setViewportMode('tablet')}
              className={`px-2 py-1 rounded flex items-center gap-1 cursor-pointer transition-all ${
                viewportMode === 'tablet'
                  ? 'bg-forge-neon text-forge-very-dark font-bold'
                  : 'text-forge-dim hover:text-forge-text'
              }`}
              title="Tablet View (768px)"
            >
              <Tablet size={11} />
              <span>Tablet</span>
            </button>
            <button
              type="button"
              onClick={() => setViewportMode('mobile')}
              className={`px-2 py-1 rounded flex items-center gap-1 cursor-pointer transition-all ${
                viewportMode === 'mobile'
                  ? 'bg-forge-neon text-forge-very-dark font-bold'
                  : 'text-forge-dim hover:text-forge-text'
              }`}
              title="Mobile View (375px)"
            >
              <Smartphone size={11} />
              <span>Mobile</span>
            </button>
          </div>

          {/* URL & Port Switcher Bar */}
          <div className="flex-1 max-w-sm flex items-center gap-1 bg-black/60 border border-forge-dark rounded px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
            <input
              type="text"
              value={previewUrl}
              onChange={(e) => setPreviewUrl(e.target.value)}
              className="w-full bg-transparent border-0 text-[10px] text-forge-text outline-none font-mono"
              placeholder="http://localhost:5173"
            />
            {/* Quick port switcher pills */}
            <div className="flex items-center gap-0.5 pl-1 border-l border-forge-dark/60 shrink-0">
              {COMMON_PORTS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePortSelect(p)}
                  className={`px-1 rounded text-[8.5px] cursor-pointer transition-colors ${
                    previewUrl.includes(p)
                      ? 'bg-forge-neon/20 text-forge-neon font-bold'
                      : 'text-forge-dim hover:text-forge-text'
                  }`}
                  title={`Switch to port ${p}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPreviewKey(k => k + 1)}
              className="forge-secondary-button p-1.5 hover:text-forge-neon"
              title="Reload Preview"
            >
              <RefreshCw size={11} />
            </button>
            <button
              type="button"
              onClick={handleOpenExternal}
              className="forge-secondary-button p-1.5 hover:text-forge-neon"
              title="Open in System Browser"
            >
              <ExternalLink size={11} />
            </button>
            {workspaceRoot && (
              <button
                type="button"
                onClick={handleOpenFolder}
                className="forge-secondary-button p-1.5 hover:text-forge-neon"
                title="Open Project Folder"
              >
                <FolderOpen size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Live Interactive Iframe Canvas with Device Bezel Framing */}
        <div className="flex-1 overflow-auto flex justify-center items-center p-3 bg-black/60 relative">
          {viewportMode === 'desktop' ? (
            <iframe
              key={previewKey}
              src={previewUrl}
              title="Zeloryn Live Vibe Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
              className="h-full w-full bg-white rounded shadow-2xl transition-all duration-200 border border-forge-dark"
            />
          ) : viewportMode === 'tablet' ? (
            <div className="h-full w-[768px] max-w-full bg-[#1e1e1e] p-2.5 rounded-[24px] shadow-2xl border-2 border-[#333] flex flex-col items-center">
              <iframe
                key={previewKey}
                src={previewUrl}
                title="Zeloryn Tablet Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                className="h-full w-full bg-white rounded-[16px] border border-forge-dark"
              />
            </div>
          ) : (
            <div className="h-full w-[375px] max-w-full bg-[#1a1a1a] p-2.5 rounded-[36px] shadow-2xl border-4 border-[#333] flex flex-col items-center relative">
              {/* Phone Dynamic Island / Speaker Notch */}
              <div className="w-24 h-3.5 bg-black rounded-full mb-1.5 flex items-center justify-center shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-[#222] mr-2" />
                <div className="w-1.5 h-1.5 rounded-full bg-[#2a2a2a]" />
              </div>
              <iframe
                key={previewKey}
                src={previewUrl}
                title="Zeloryn Mobile Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                className="h-full w-full bg-white rounded-[24px] border border-forge-dark"
              />
              {/* Phone Home Indicator Bar */}
              <div className="w-28 h-1 bg-white/40 rounded-full mt-1.5 shrink-0" />
            </div>
          )}
        </div>

        {/* Bottom Helper Bar */}
        <div className="px-3 py-1.5 border-t border-forge-dark bg-forge-very-dark text-[9.5px] font-mono flex items-center justify-between text-forge-dim shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-400 font-bold">● LIVE INTERACTIVE CANVAS</span>
            <span>— Click and test your app directly inside the preview window!</span>
          </div>
          <div>
            Need advanced Git or terminal? Switch to{' '}
            <button
              type="button"
              onClick={() => onSwitchToPro?.('code')}
              className="text-forge-neon underline bg-transparent border-0 cursor-pointer p-0 font-bold"
            >
              FORGE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
