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
  Code
} from 'lucide-react';
import type { AgentLog } from '../backend/agents';

export interface VibeStudioProps {
  activeProject: any | null;
  workspaceRoot: string;
  isStreaming: boolean;
  streamingContent?: string;
  logs?: AgentLog[];
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
    title: '🚀 Modern SaaS Landing Page',
    prompt: 'Build a modern, sleek landing page with a hero section, pricing table, testimonial carousel, and dark mode toggle.'
  },
  {
    title: '📊 Crypto & Finance Dashboard',
    prompt: 'Build an interactive financial dashboard with real-time price cards, portfolio balance calculator, and trend charts.'
  },
  {
    title: '📝 Minimalist Notes & Tasks',
    prompt: 'Build a clean, aesthetic notes app with drag-and-drop task lists, search filter, and localStorage persistence.'
  },
  {
    title: '🎮 Retro Arcade Web Game',
    prompt: 'Build an interactive retro arcade game in HTML5 canvas with keyboard controls, sound effects, and high scores.'
  },
  {
    title: '🧮 Freelance Invoice Generator',
    prompt: 'Build an invoice generator that calculates line items, taxes, discounts, and renders a clean printable PDF layout.'
  }
];

export const VibeStudio: React.FC<VibeStudioProps> = ({
  activeProject,
  workspaceRoot,
  isStreaming,
  streamingContent,
  logs = [],
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
  const [messages, setMessages] = useState<VibeMessage[]>(() => {
    try {
      const saved = localStorage.getItem('zeloryn_vibe_chat');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

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

    // Prepend vibe coding instruction so agent understands to build full working code and keep preview server running
    const vibeQuery = `[VIBE CODING REQUEST] The user wants to build/modify the application in natural language:\n\n${trimmed}\n\nPlease implement the necessary files, components, and ensure the dev server / preview runs cleanly. Explain what you created in friendly, accessible language.`;
    onSendQuery(vibeQuery, 'code');
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

  return (
    <div className="flex-1 flex overflow-hidden bg-forge-bg text-forge-text font-sans select-none">
      {/* LEFT PANEL: Conversational Creator Studio (42% width) */}
      <div className="w-[42%] min-w-[360px] max-w-[560px] border-r border-forge-dark flex flex-col bg-forge-panel-bg">
        {/* Vibe Header */}
        <div className="p-3 border-b border-forge-dark flex items-center justify-between bg-black/20">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-forge-neon/15 border border-forge-neon/40 flex items-center justify-center text-forge-neon">
              <Sparkles size={15} />
            </div>
            <div>
              <div className="text-xs font-bold text-forge-neon tracking-wide flex items-center gap-1.5">
                <span>VIBE STUDIO</span>
                <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1 py-0.2 rounded font-mono font-bold">
                  BEGINNER FRIENDLY
                </span>
              </div>
              <div className="text-[10px] text-forge-dim">
                Describe your dream software in plain English.
              </div>
            </div>
          </div>

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

        {/* Project Selector Bar */}
        <div className="px-3 py-1.5 bg-forge-very-dark border-b border-forge-dark flex items-center justify-between text-[10.5px] font-mono">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-forge-dim">Target:</span>
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

        {/* Chat / Idea Stream */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 ? (
            <div className="py-4 space-y-4">
              <div className="p-3.5 rounded-lg border border-forge-dark bg-black/30 space-y-2">
                <div className="text-xs font-bold text-forge-text flex items-center gap-1.5">
                  <Sparkles size={13} className="text-forge-neon" />
                  <span>How Vibe Coding Works</span>
                </div>
                <p className="text-[11px] text-forge-dim leading-relaxed">
                  You don't need to know how to code. Just type what you want to create or change, and Zeloryn builds the full application and runs it live on the right canvas.
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-bold text-forge-dim uppercase tracking-wider block font-mono">
                  Inspiration Starters (Click to use):
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

        {/* Input Bar */}
        <div className="p-3 border-t border-forge-dark bg-forge-very-dark/80">
          <div className="flex flex-col gap-2">
            <textarea
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder="Describe what you want to build or change (e.g., 'Make the buttons rounded and add a dark mode toggle')..."
              rows={3}
              className="w-full bg-black/40 border border-forge-dark rounded-md p-2.5 text-xs text-forge-text placeholder:text-forge-dim outline-none focus:border-forge-neon transition-colors resize-none disabled:opacity-50"
            />
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] text-forge-dim font-mono">
                Press <kbd className="bg-black/60 px-1 py-0.5 rounded border border-forge-dark">Enter</kbd> to build · <kbd className="bg-black/60 px-1 py-0.5 rounded border border-forge-dark">Shift+Enter</kbd> for newline
              </span>
              <div className="flex gap-1.5">
                {isStreaming && onAbort && (
                  <button
                    type="button"
                    onClick={onAbort}
                    className="forge-stop-button px-3 py-1.5 text-[10px] font-mono flex items-center gap-1 cursor-pointer"
                  >
                    <Square size={10} />
                    <span>STOP</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!inputPrompt.trim() || isStreaming}
                  className="forge-btn px-4 py-1.5 text-[10.5px] font-mono font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Send size={11} />
                  <span>VIBE BUILD</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Live Interactive App Preview (58% width) */}
      <div className="flex-1 flex flex-col overflow-hidden bg-black/50">
        {/* Preview Toolbar */}
        <div className="p-2 border-b border-forge-dark bg-forge-very-dark flex items-center justify-between gap-2 font-mono text-[10px]">
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

          {/* URL Bar */}
          <div className="flex-1 max-w-sm flex items-center gap-1 bg-black/60 border border-forge-dark rounded px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
            <input
              type="text"
              value={previewUrl}
              onChange={(e) => setPreviewUrl(e.target.value)}
              className="w-full bg-transparent border-0 text-[10px] text-forge-text outline-none font-mono"
              placeholder="http://localhost:5173"
            />
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

        {/* Live Interactive Iframe Canvas */}
        <div className="flex-1 overflow-auto flex justify-center items-center p-3 bg-black/60 relative">
          <iframe
            key={previewKey}
            src={previewUrl}
            title="Zeloryn Live Vibe Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
            className={`h-full bg-white rounded shadow-2xl transition-all duration-200 border border-forge-dark ${
              viewportMode === 'desktop'
                ? 'w-full'
                : viewportMode === 'tablet'
                  ? 'w-[768px] max-w-full'
                  : 'w-[375px] max-w-full'
            }`}
          />
        </div>

        {/* Bottom Helper Bar */}
        <div className="px-3 py-1.5 border-t border-forge-dark bg-forge-very-dark text-[9.5px] font-mono flex items-center justify-between text-forge-dim">
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-400 font-bold">● LIVE INTERACTIVE CANVAS</span>
            <span>— You can click and test your app directly inside this preview window!</span>
          </div>
          <div>
            Need advanced Git or terminal? Switch to{' '}
            <button
              type="button"
              onClick={() => onSwitchToPro?.('code')}
              className="text-forge-neon underline bg-transparent border-0 cursor-pointer p-0"
            >
              FORGE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
