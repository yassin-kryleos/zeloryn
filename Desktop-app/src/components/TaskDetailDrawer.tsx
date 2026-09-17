import React, { useState, useEffect } from 'react';
import { X, Play, Sparkles, ExternalLink, GitBranch, CheckCircle2, Circle, Trash2, Plus, Link2 } from 'lucide-react';
import type { ProjectTask, AcceptanceCriterion, AcceptanceCriterionType } from '../backend/db';
import { wouldCreateDependencyCycle } from '../shared/dependencies';
import { getAssigneeColor } from '../shared/assigneeColor';
import { coreAssignees, specialistAssignees } from '../shared/crewPersonas';

interface TaskDetailDrawerProps {
  task: ProjectTask | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveTask: (updated: ProjectTask) => void;
  allTasks: ProjectTask[];
  worktrees?: Record<string, any>;
  onMergeWorktree?: (task: ProjectTask) => Promise<void>;
  onRevertWorktree?: (task: ProjectTask) => Promise<void>;
  onRunInForge?: (task: ProjectTask, runner?: string) => void;
  onOpenVibe?: (taskId: string) => void;
  onPushHandoff?: (task: ProjectTask) => void;
  onDeleteTask?: (taskId: string) => void;
}

export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({
  task,
  isOpen,
  onClose,
  onSaveTask,
  allTasks,
  worktrees = {},
  onMergeWorktree,
  onRevertWorktree,
  onRunInForge,
  onOpenVibe,
  onPushHandoff,
  onDeleteTask
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('frontend');
  const [status, setStatus] = useState<ProjectTask['status']>('todo');
  const [assignee, setAssignee] = useState('Architect');
  const [runner, setRunner] = useState('claude-code');
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>([]);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [showBlockerPicker, setShowBlockerPicker] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setCategory(task.category || 'frontend');
      setStatus(task.status || 'todo');
      setAssignee(task.assignee || 'Architect');
      setCriteria(task.acceptanceCriteria || []);
      setBlockers(task.blockedBy || []);
    }
  }, [task]);

  if (!isOpen || !task) return null;

  const safeWorktreeKey = task.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const activeWorktree = worktrees[safeWorktreeKey];

  const handleFieldBlur = () => {
    onSaveTask({
      ...task,
      title: title.trim() || task.title,
      description,
      category,
      status,
      assignee,
      acceptanceCriteria: criteria,
      blockedBy: blockers,
      lastModified: new Date().toISOString()
    });
  };

  const handleStatusChange = (newStatus: ProjectTask['status']) => {
    setStatus(newStatus);
    onSaveTask({
      ...task,
      status: newStatus,
      lastModified: new Date().toISOString()
    });
  };

  const handleToggleCriterion = (criterionId: string) => {
    const updated = criteria.map(c => {
      if (c.id === criterionId) {
        const nextStatus = (c.status === 'pass' ? 'fail' : 'pass') as AcceptanceCriterion['status'];
        return { ...c, status: nextStatus };
      }
      return c;
    });
    setCriteria(updated);
    onSaveTask({
      ...task,
      acceptanceCriteria: updated,
      lastModified: new Date().toISOString()
    });
  };

  const handleAddCriterion = () => {
    const newCriterion: AcceptanceCriterion = {
      id: `crit_${Date.now()}`,
      type: 'file_exists',
      description: 'New acceptance requirement',
      target: '',
      phase: 'phase1',
      status: 'unknown'
    };
    const updated = [...criteria, newCriterion];
    setCriteria(updated);
    onSaveTask({
      ...task,
      acceptanceCriteria: updated,
      lastModified: new Date().toISOString()
    });
  };

  const handleRemoveCriterion = (criterionId: string) => {
    const updated = criteria.filter(c => c.id !== criterionId);
    setCriteria(updated);
    onSaveTask({
      ...task,
      acceptanceCriteria: updated,
      lastModified: new Date().toISOString()
    });
  };

  const handleToggleBlocker = (blockerId: string) => {
    if (wouldCreateDependencyCycle(allTasks, task.id, blockerId)) {
      alert('Cannot add blocker: This would create a circular dependency.');
      return;
    }
    const updated = blockers.includes(blockerId)
      ? blockers.filter(id => id !== blockerId)
      : [...blockers, blockerId];
    setBlockers(updated);
    onSaveTask({
      ...task,
      blockedBy: updated,
      lastModified: new Date().toISOString()
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs transition-opacity duration-200">
      {/* Backdrop */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Panel */}
      <div className="w-full max-w-xl bg-forge-very-dark border-l border-forge-dark h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="px-5 py-3 border-b border-forge-dark flex items-center justify-between bg-black/40 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-forge-dim uppercase">Task Details</span>
            <span className="text-forge-dark">/</span>
            <span className="text-xs font-mono text-forge-neon">{task.id}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-forge-dim hover:text-white cursor-pointer"
            title="Close Drawer (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Action Dispatch Bar */}
        <div className="px-5 py-2.5 border-b border-forge-dark bg-black/25 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <select
              value={runner}
              onChange={(e) => setRunner(e.target.value)}
              className="bg-forge-darker border border-forge-dark text-[10px] text-forge-neon rounded px-2 py-1 font-mono cursor-pointer"
              title="Select CLI Runner for Forge"
            >
              <option value="claude-code">Claude Code</option>
              <option value="codex-cli">Codex CLI</option>
            </select>
            {onRunInForge && (
              <button
                type="button"
                onClick={() => onRunInForge(task, runner)}
                className="px-2.5 py-1 rounded bg-forge-neon/15 hover:bg-forge-neon/30 text-forge-neon border border-forge-neon/40 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-all"
                title="Run in Forge developer terminal"
              >
                <Play size={10} />
                <span>Run in Forge</span>
              </button>
            )}
            {onOpenVibe && (
              <button
                type="button"
                onClick={() => onOpenVibe(task.id)}
                className="px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-all"
                title="Open in Vibe Studio with live preview"
              >
                <Sparkles size={10} />
                <span>Vibe Studio</span>
              </button>
            )}
          </div>
          {onPushHandoff && (
            <button
              type="button"
              onClick={() => onPushHandoff(task)}
              className="px-2.5 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/40 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-all"
              title="Push to Cursor, VS Code, Windsurf, or Antigravity"
            >
              <ExternalLink size={10} />
              <span>Push / Handoff</span>
            </button>
          )}
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Title & Status Bar */}
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleFieldBlur}
              placeholder="Task Title"
              className="w-full bg-transparent border-0 text-base font-bold text-white outline-none placeholder:text-forge-dim focus:ring-1 focus:ring-forge-neon rounded px-1 -mx-1"
            />

            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
              {/* Status Selector */}
              <div className="flex items-center gap-1 bg-black/40 border border-forge-dark rounded p-0.5">
                {(['todo', 'in_progress', 'done'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleStatusChange(s)}
                    className={`px-2 py-0.5 rounded cursor-pointer transition-all uppercase text-[9px] font-bold ${
                      status === s
                        ? s === 'done'
                          ? 'bg-emerald-500 text-black'
                          : s === 'in_progress'
                            ? 'bg-amber-500 text-black'
                            : 'bg-forge-dark text-white'
                        : 'text-forge-dim hover:text-white'
                    }`}
                  >
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Category Pill */}
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  onSaveTask({ ...task, category: e.target.value });
                }}
                className="bg-black/40 border border-forge-dark text-forge-text rounded px-2 py-0.5 outline-none cursor-pointer uppercase text-[9px]"
              >
                {['frontend', 'backend', 'testing', 'security', 'docs', 'infra', 'general'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {/* Assignee Selector */}
              <select
                aria-label="Task assignee"
                value={assignee}
                onChange={(e) => {
                  setAssignee(e.target.value);
                  onSaveTask({ ...task, assignee: e.target.value });
                }}
                className={`bg-black/40 border border-forge-dark rounded px-2 py-0.5 outline-none cursor-pointer text-[9px] font-bold ${getAssigneeColor(assignee)}`}
                title="Change task specialist assignee"
              >
                <optgroup label="Core Roles">
                  {coreAssignees.map(a => (
                    <option key={a.value} value={a.value}>@{a.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Specialist Agents">
                  {specialistAssignees.map(a => (
                    <option key={a.value} value={a.value}>@{a.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* Git Worktree Status */}
          {activeWorktree && (
            <div className="border border-purple-500/30 bg-purple-500/10 rounded p-3 text-[11px] font-mono space-y-2">
              <div className="flex items-center justify-between text-purple-300">
                <span className="flex items-center gap-1.5 font-bold">
                  <GitBranch size={13} />
                  <span>Isolated Branch: {activeWorktree.branch}</span>
                </span>
                <span className="text-[9px] text-purple-400">Git Worktree Active</span>
              </div>
              <div className="flex gap-2 pt-1">
                {onMergeWorktree && (
                  <button
                    type="button"
                    onClick={() => onMergeWorktree(task)}
                    className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold cursor-pointer"
                  >
                    Merge into Main
                  </button>
                )}
                {onRevertWorktree && (
                  <button
                    type="button"
                    onClick={() => onRevertWorktree(task)}
                    className="px-2.5 py-1 rounded bg-red-950 hover:bg-red-900 border border-red-700/50 text-red-300 text-[10px] cursor-pointer"
                  >
                    Discard Worktree
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Description Section */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono uppercase font-bold text-forge-dim flex items-center gap-1">
              <span>Description / Feature Specs</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleFieldBlur}
              placeholder="Detailed description of requirements, user flow, or architectural expectations..."
              rows={4}
              className="w-full bg-black/40 border border-forge-dark rounded p-2.5 text-xs text-forge-text outline-none focus:border-forge-neon font-sans resize-y"
            />
          </div>

          {/* Acceptance Criteria Checklist */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono uppercase font-bold text-forge-dim flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span>Acceptance Criteria ({criteria.filter(c => c.status === 'pass').length}/{criteria.length})</span>
              </label>
              <button
                type="button"
                onClick={handleAddCriterion}
                className="text-[9.5px] font-mono text-forge-neon hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus size={10} />
                <span>Add Criterion</span>
              </button>
            </div>

            {criteria.length === 0 ? (
              <div className="border border-dashed border-forge-dark/60 rounded p-3 text-center text-[10px] text-forge-dim">
                No acceptance criteria defined yet. Click "Add Criterion" to verify this task.
              </div>
            ) : (
              <div className="space-y-1.5">
                {criteria.map((c) => {
                  const isPassed = c.status === 'pass';
                  return (
                    <div
                      key={c.id}
                      className="border border-forge-dark/70 rounded bg-black/30 p-2 flex items-start justify-between gap-2 group"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleCriterion(c.id)}
                        className="flex items-start gap-2 text-left cursor-pointer flex-1"
                      >
                        {isPassed ? (
                          <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <Circle size={14} className="text-forge-dim group-hover:text-forge-text shrink-0 mt-0.5" />
                        )}
                        <span className={`text-[11px] leading-tight ${isPassed ? 'text-emerald-300 line-through opacity-75' : 'text-forge-text'}`}>
                          {c.description || c.target || 'Unnamed criterion'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveCriterion(c.id)}
                        className="opacity-0 group-hover:opacity-100 text-forge-dim hover:text-red-400 p-0.5 transition-opacity"
                        title="Delete criterion"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Blocker Dependencies */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono uppercase font-bold text-forge-dim flex items-center gap-1.5">
                <Link2 size={12} className="text-amber-400" />
                <span>Blocked By ({blockers.length})</span>
              </label>
              <button
                type="button"
                onClick={() => setShowBlockerPicker(!showBlockerPicker)}
                className="text-[9.5px] font-mono text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{showBlockerPicker ? 'Done' : 'Edit Blockers'}</span>
              </button>
            </div>

            {blockers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {blockers.map(bid => {
                  const btask = allTasks.find(t => t.id === bid);
                  return (
                    <span
                      key={bid}
                      className="px-2 py-0.5 rounded border border-amber-600/40 bg-amber-500/15 text-amber-300 text-[10px] font-mono flex items-center gap-1"
                    >
                      <span>{btask?.title || bid}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleBlocker(bid)}
                        className="hover:text-red-400 text-amber-400"
                        title="Remove dependency"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {showBlockerPicker && (
              <div className="border border-forge-dark rounded p-2 bg-black/50 max-h-40 overflow-y-auto space-y-1">
                {allTasks
                  .filter(t => t.id !== task.id)
                  .map(candidate => {
                    const isSelected = blockers.includes(candidate.id);
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => handleToggleBlocker(candidate.id)}
                        className={`w-full text-left px-2 py-1 rounded text-[10px] font-mono flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-amber-950/60 border border-amber-500 text-amber-300'
                            : 'hover:bg-white/5 text-forge-text'
                        }`}
                      >
                        <span className="truncate pr-2">{candidate.title}</span>
                        <span className="text-[8px] uppercase text-forge-dim shrink-0">{candidate.status}</span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="px-5 py-3 border-t border-forge-dark bg-black/40 flex items-center justify-between shrink-0 text-[10px] font-mono text-forge-dim">
          <span>Last modified: {task.lastModified ? new Date(task.lastModified).toLocaleTimeString() : 'Recently'}</span>
          {onDeleteTask && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Are you sure you want to delete task "${task.title}"?`)) {
                  onDeleteTask(task.id);
                  onClose();
                }
              }}
              className="text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 size={11} />
              <span>Delete Task</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
