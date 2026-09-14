import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Layout,
  Users,
  Kanban,
  Terminal,
  Sparkles,
  FolderOpen,
  FileCode,
  CheckCircle2,
  RefreshCw,
  Palette,
  Settings,
  X,
  ArrowRight,
  ListTodo
} from 'lucide-react';
import type { ProjectTask } from '../backend/db';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (space: 'plan' | 'cowork' | 'project' | 'code' | 'vibe') => void;
  onOpenProjectModal?: () => void;
  onOpenSettings?: () => void;
  onSelectTheme?: (theme: string) => void;
  tasks?: ProjectTask[];
  onSelectTask?: (task: ProjectTask) => void;
  onAnalyzeCodebase?: () => void;
  onImportTodos?: () => void;
  onCheckDrift?: () => void;
  onBrowseFolder?: () => void;
}

interface PaletteCommand {
  id: string;
  category: 'Navigation' | 'Actions' | 'Themes' | 'Tasks';
  label: string;
  description?: string;
  icon: React.ReactNode;
  shortcut?: string;
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenProjectModal,
  onOpenSettings,
  onSelectTheme,
  tasks = [],
  onSelectTask,
  onAnalyzeCodebase,
  onImportTodos,
  onCheckDrift,
  onBrowseFolder
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const allCommands = useMemo<PaletteCommand[]>(() => {
    const list: PaletteCommand[] = [
      // Navigation
      {
        id: 'nav-plan',
        category: 'Navigation',
        label: 'Go to Plan',
        description: 'Interactive architecture & requirements planner',
        icon: <Layout size={14} className="text-cyan-400" />,
        shortcut: 'F1',
        run: () => { onNavigate('plan'); onClose(); }
      },
      {
        id: 'nav-crew',
        category: 'Navigation',
        label: 'Go to Crew',
        description: 'Multi-agent specialist team collaboration & chat',
        icon: <Users size={14} className="text-purple-400" />,
        shortcut: 'F2',
        run: () => { onNavigate('cowork'); onClose(); }
      },
      {
        id: 'nav-flow',
        category: 'Navigation',
        label: 'Go to Flow',
        description: 'Kanban task board & execution scheduler',
        icon: <Kanban size={14} className="text-emerald-400" />,
        shortcut: 'F3',
        run: () => { onNavigate('project'); onClose(); }
      },
      {
        id: 'nav-forge',
        category: 'Navigation',
        label: 'Go to Forge',
        description: 'In-app CLI terminal & headless AI agent execution',
        icon: <Terminal size={14} className="text-amber-400" />,
        shortcut: 'F4',
        run: () => { onNavigate('code'); onClose(); }
      },
      {
        id: 'nav-vibe',
        category: 'Navigation',
        label: 'Go to Vibe Studio',
        description: 'Visual coding canvas with live interactive preview',
        icon: <Sparkles size={14} className="text-emerald-400" />,
        shortcut: 'F5',
        run: () => { onNavigate('vibe'); onClose(); }
      },

      // Brownfield / Actions
      {
        id: 'action-analyze',
        category: 'Actions',
        label: 'Analyze Existing Codebase',
        description: 'Map architectural files and build interactive blueprint',
        icon: <FileCode size={14} className="text-cyan-400" />,
        run: () => {
          onClose();
          onNavigate('plan');
          onAnalyzeCodebase?.();
        }
      },
      {
        id: 'action-todos',
        category: 'Actions',
        label: 'Import Code TODOs into Flow',
        description: 'Scan repository files for TODO/FIXME comments and create tasks',
        icon: <ListTodo size={14} className="text-emerald-400" />,
        run: () => {
          onClose();
          onNavigate('project');
          onImportTodos?.();
        }
      },
      {
        id: 'action-drift',
        category: 'Actions',
        label: 'Verify Codebase Status (Drift)',
        description: 'Check acceptance criteria against current workspace code',
        icon: <RefreshCw size={14} className="text-amber-400" />,
        run: () => {
          onClose();
          onCheckDrift?.();
        }
      },
      {
        id: 'action-browse',
        category: 'Actions',
        label: 'Browse Workspace Folder...',
        description: 'Select local project folder with native OS file dialog',
        icon: <FolderOpen size={14} className="text-purple-400" />,
        run: () => {
          onClose();
          onBrowseFolder?.();
        }
      },
      {
        id: 'action-projects',
        category: 'Actions',
        label: 'Manage Projects',
        description: 'Switch active workspace or create new project',
        icon: <FolderOpen size={14} className="text-zinc-400" />,
        run: () => {
          onClose();
          onOpenProjectModal?.();
        }
      },
      {
        id: 'action-settings',
        category: 'Actions',
        label: 'Open Configuration / Settings',
        description: 'Manage API keys, models, tools, and theme',
        icon: <Settings size={14} className="text-zinc-400" />,
        run: () => {
          onClose();
          onOpenSettings?.();
        }
      },

      // Themes
      {
        id: 'theme-dark',
        category: 'Themes',
        label: 'Theme: Dark',
        description: 'Zeloryn Interface Dark (default palette)',
        icon: <Palette size={14} className="text-emerald-400" />,
        run: () => { onSelectTheme?.('dark'); onClose(); }
      },
      {
        id: 'theme-light',
        category: 'Themes',
        label: 'Theme: Light',
        description: 'Zeloryn Interface Light workstation palette',
        icon: <Palette size={14} className="text-amber-400" />,
        run: () => { onSelectTheme?.('light'); onClose(); }
      }
    ];

    // Tasks (matching search)
    if (tasks.length > 0) {
      for (const t of tasks.slice(0, 20)) {
        list.push({
          id: `task-${t.id}`,
          category: 'Tasks',
          label: t.title,
          description: `[${t.status}] ${t.category || 'task'} • ${t.assignee || 'Unassigned'}`,
          icon: <CheckCircle2 size={14} className={t.status === 'done' ? 'text-emerald-400' : 'text-zinc-400'} />,
          run: () => {
            onClose();
            onNavigate('project');
            onSelectTask?.(t);
          }
        });
      }
    }

    return list;
  }, [tasks, onNavigate, onClose, onAnalyzeCodebase, onImportTodos, onCheckDrift, onBrowseFolder, onOpenProjectModal, onOpenSettings, onSelectTheme, onSelectTask]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allCommands;
    const lower = query.toLowerCase();
    return allCommands.filter(cmd =>
      cmd.label.toLowerCase().includes(lower) ||
      (cmd.description && cmd.description.toLowerCase().includes(lower)) ||
      cmd.category.toLowerCase().includes(lower)
    );
  }, [allCommands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].run();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-20 bg-black/75 backdrop-blur-sm p-4 font-mono select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-zinc-950 border border-zinc-800 shadow-2xl rounded-lg overflow-hidden flex flex-col max-h-[70vh] animate-in fade-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search header */}
        <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-zinc-800 bg-zinc-900/60">
          <Search size={16} className="text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, task, or workspace... (Esc to close)"
            className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none border-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-zinc-500 hover:text-zinc-300 p-0.5"
            >
              <X size={14} />
            </button>
          )}
          <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">ESC</span>
        </div>

        {/* Command list */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-xs text-zinc-500">
              No matching commands or tasks found.
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={cmd.run}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left px-3 py-2 rounded flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-800/90 text-white'
                      : 'text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="shrink-0">{cmd.icon}</span>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold truncate">{cmd.label}</span>
                      {cmd.description && (
                        <span className="text-[10px] text-zinc-400 truncate">{cmd.description}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] uppercase tracking-wider text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                      {cmd.category}
                    </span>
                    {cmd.shortcut && (
                      <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">
                        {cmd.shortcut}
                      </span>
                    )}
                    {isSelected && <ArrowRight size={12} className="text-emerald-400" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-3 py-2 border-t border-zinc-800/80 bg-zinc-900/40 text-[10px] text-zinc-400 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span><kbd className="bg-zinc-800 px-1 py-0.5 rounded text-[9px] text-zinc-300">↑↓</kbd> Navigate</span>
            <span><kbd className="bg-zinc-800 px-1 py-0.5 rounded text-[9px] text-zinc-300">↵</kbd> Execute</span>
            <span><kbd className="bg-zinc-800 px-1 py-0.5 rounded text-[9px] text-zinc-300">Esc</kbd> Close</span>
          </div>
          <span className="text-zinc-500">Universal Command Palette</span>
        </div>
      </div>
    </div>
  );
};
