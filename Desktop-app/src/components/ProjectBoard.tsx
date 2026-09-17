import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Play, CheckCircle, Clock, Trash2, ArrowRight, ArrowLeft, FolderOpen, RefreshCw, ListChecks, Link2, X, Square, GitBranch, GitFork, ExternalLink, RotateCcw, ShieldCheck, Sparkles, Terminal, Kanban } from 'lucide-react';
import type { AcceptanceCriterion, AcceptanceCriterionType, CriterionPhase, ProjectTask } from '../backend/db';
import { scoreTodayTasks } from '../shared/todayScore';
import { driftClass } from '../shared/driftClassification';
import { getAssigneeColor } from '../shared/assigneeColor';
import { wouldCreateDependencyCycle, findUnblockedTasks, getNextSchedulableTask, isTaskUnblocked } from '../shared/dependencies';
import { resolveAgentForCategory, type InstalledAgent, type ItemCategory } from '../shared/agentCapabilities';
import { coreAssignees, specialistAssignees } from '../shared/crewPersonas';
import { FileBrowser } from './FileBrowser';
import { SafeMarkdown } from './SafeMarkdown';
import { TaskDetailDrawer } from './TaskDetailDrawer';

interface ProjectBoardProps {
  tasks: ProjectTask[];
  isStreaming: boolean;
  workspaceRoot: string;
  onSaveTasks: (updatedTasks: ProjectTask[]) => void;
  onSendQuery: (query: string, options?: { spaceOverride?: 'code' | 'chat' | 'cowork' | 'project'; planItemId?: string; workspace?: string; runner?: string }) => void;
  onUpdateWorkspaceRoot?: (newRoot: string) => void;
  onNotify?: (message: string, kind?: 'success' | 'error' | 'warning' | 'info') => void;
  onAbort?: () => void;
  installedAgents?: InstalledAgent[];
  onOpenVibeTask?: (taskId: string) => void;
}

const categories = ['frontend', 'backend', 'testing', 'security', 'docs', 'infra'];
const criterionTypes: AcceptanceCriterionType[] = ['file_exists', 'symbol_exists', 'git_grep', 'test_passes', 'llm_check'];
const criterionPhases: CriterionPhase[] = ['phase1', 'phase2'];

function inferCategory(title: string): string {
  const lower = title.toLowerCase();
  // Plural/derived forms matter: "unit tests" must hit testing, not frontend.
  if (/\b(test(s|ing)?|specs?|vitest|jest|qa|coverage)\b/.test(lower)) return 'testing';
  if (/\b(auth|security|permissions?|rbac|secrets?|sandbox)\b/.test(lower)) return 'security';
  if (/\b(docs?|documentation|readme|guides?|copy|brochure|changelog)\b/.test(lower)) return 'docs';
  if (/\b(docker|ci|deploy(ment)?|infra|pipelines?|releases?|build)\b/.test(lower)) return 'infra';
  if (/\b(apis?|server|backend|db|database|routes?|sync)\b/.test(lower)) return 'backend';
  return 'frontend';
}


export const ProjectBoard: React.FC<ProjectBoardProps> = ({
  tasks,
  isStreaming,
  workspaceRoot,
  onSaveTasks,
  onSendQuery,
  onUpdateWorkspaceRoot,
  onNotify,
  onAbort,
  installedAgents = [],
  onOpenVibeTask
}) => {
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('Builder');
  const [taskCategory, setTaskCategory] = useState('frontend');
  const [fileBrowserOpen, setFileBrowserOpen] = useState(true);
  const [driftChecking, setDriftChecking] = useState(false);
  const [criteriaTask, setCriteriaTask] = useState<ProjectTask | null>(null);
  const [criteriaDraft, setCriteriaDraft] = useState<AcceptanceCriterion[]>([]);
  const [criteriaBusy, setCriteriaBusy] = useState(false);
  const [enrichmentNotice, setEnrichmentNotice] = useState<string | null>(null);
  const [flowViewMode, setFlowViewMode] = useState<'kanban' | 'today'>(() => {
    try {
      const saved = localStorage.getItem('matrix_flow_view_mode');
      return saved === 'today' || saved === 'list' ? 'today' : 'kanban';
    } catch {
      return 'kanban';
    }
  });

  const handleSetFlowViewMode = (mode: 'kanban' | 'today') => {
    setFlowViewMode(mode);
    try {
      localStorage.setItem('matrix_flow_view_mode', mode);
    } catch { /* ignore */ }
  };
  const [blockerTask, setBlockerTask] = useState<ProjectTask | null>(null);
  const [blockerDraft, setBlockerDraft] = useState<string[]>([]);
  const [worktrees, setWorktrees] = useState<Record<string, { branch: string; isClean: boolean }>>({});
  const [taskRunners, setTaskRunners] = useState<Record<string, string>>({});
  const [handoffModalTask, setHandoffModalTask] = useState<ProjectTask | null>(null);
  const [handoffTargets, setHandoffTargets] = useState<any[]>([]);
  const [availableRunners, setAvailableRunners] = useState<any[]>([]);
  const [drawerTask, setDrawerTask] = useState<ProjectTask | null>(null);
  const [importingTodos, setImportingTodos] = useState(false);

  const handleSaveTaskDetail = (updated: ProjectTask) => {
    onSaveTasks(tasks.map(t => t.id === updated.id ? updated : t));
    setDrawerTask(updated);
  };

  const handleImportTodos = async () => {
    setImportingTodos(true);
    try {
      const res = await fetch(`http://localhost:3001/api/plan/todos?workspace=${encodeURIComponent(workspaceRoot)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.todos) && data.todos.length > 0) {
        const newTasks: ProjectTask[] = data.todos.map((t: any) => ({
          id: t.id,
          title: t.title,
          category: t.category,
          status: 'todo',
          assignee: 'Builder',
          description: t.description,
          acceptanceCriteria: [{
            id: `crit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            phase: 'phase1',
            type: 'file_exists',
            target: t.file,
            description: `Verify changes in ${t.file}`,
            status: 'pending'
          }],
          blockedBy: []
        }));
        onSaveTasks([...tasks, ...newTasks]);
        onNotify?.(`Imported ${newTasks.length} TODO(s) from existing codebase files into Flow.`, 'success');
      } else {
        onNotify?.('No TODO/FIXME comments found in codebase files.', 'info');
      }
    } catch (err: any) {
      onNotify?.(`Failed to import TODOs: ${err.message}`, 'error');
    } finally {
      setImportingTodos(false);
    }
  };

  const loadWorktrees = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/worktrees');
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, { branch: string; isClean: boolean }> = {};
        for (const wt of (data.worktrees || [])) {
          map[wt.taskId] = { branch: wt.branch, isClean: wt.isClean };
        }
        setWorktrees(map);
      }
    } catch { /* ignore if backend not available */ }
  };

  const loadRunnersAndTargets = async () => {
    try {
      const [runnersRes, targetsRes] = await Promise.all([
        fetch('http://localhost:3001/api/runners'),
        fetch('http://localhost:3001/api/handoff/targets'),
      ]);
      if (runnersRes.ok) {
        const data = await runnersRes.json();
        if (Array.isArray(data.runners)) setAvailableRunners(data.runners);
      }
      if (targetsRes.ok) {
        const data = await targetsRes.json();
        if (Array.isArray(data.targets)) setHandoffTargets(data.targets);
      }
    } catch { /* ignore if backend not available */ }
  };

  useEffect(() => {
    loadWorktrees();
    loadRunnersAndTargets();
  }, [workspaceRoot]);

  const handleExecuteHandoff = async (task: ProjectTask, targetAppId: string) => {
    try {
      const res = await fetch('http://localhost:3001/api/handoff/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          taskTitle: task.title,
          taskCategory: task.category,
          taskAssignee: task.assignee,
          taskStatus: task.status,
          workspaceRoot,
          targetAppId,
          acceptanceCriteria: (task.acceptanceCriteria || []).map(c => c.description || ''),
        })
      });
      const data = await res.json();
      if (data.success) {
        if (navigator?.clipboard && data.bundleContent) {
          try {
            await navigator.clipboard.writeText(data.bundleContent);
          } catch { /* ignore */ }
        }
        onNotify?.(data.instructions || `Handoff bundle exported to ${data.handoffFilePath}`, 'success');
        setHandoffModalTask(null);
      } else {
        onNotify?.(data.error || 'Failed to export handoff bundle', 'error');
      }
    } catch (e: any) {
      onNotify?.(e.message || 'Handoff export failed', 'error');
    }
  };

  const handleCreateWorktree = async (task: ProjectTask) => {
    try {
      const res = await fetch(`http://localhost:3001/api/worktrees/card/${encodeURIComponent(task.id)}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onNotify?.(data.message || `Created isolated worktree on branch ${data.branch}`, 'success');
        loadWorktrees();
      } else {
        onNotify?.(data.message || 'Failed to create worktree', 'error');
      }
    } catch (e: any) {
      onNotify?.(e.message, 'error');
    }
  };

  const handleMergeWorktree = async (task: ProjectTask) => {
    try {
      const res = await fetch(`http://localhost:3001/api/worktrees/merge/${encodeURIComponent(task.id)}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onNotify?.(data.message || 'Merged card worktree into workspace', 'success');
        loadWorktrees();
      } else {
        onNotify?.(data.message || 'Failed to merge worktree', 'error');
      }
    } catch (e: any) {
      onNotify?.(e.message, 'error');
    }
  };

  const handleRevertWorktree = async (task: ProjectTask) => {
    const confirmed = window.confirm(
      `Are you sure you want to revert card "${task.title}"?\n\nThis will remove the isolated worktree directory and delete its branch permanently.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`http://localhost:3001/api/worktrees/revert/${encodeURIComponent(task.id)}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onNotify?.(data.message || `Reverted worktree and branch for card ${task.id}`, 'success');
        loadWorktrees();
      } else {
        onNotify?.(data.message || 'Failed to revert worktree', 'error');
      }
    } catch (e: any) {
      onNotify?.(e.message, 'error');
    }
  };

  const handleRunPostExecutionReview = async (task: ProjectTask) => {
    try {
      onNotify?.(`Running Post-Execution CREW Review on "${task.title}"...`, 'info');
      const res = await fetch(`http://localhost:3001/api/plan/items/${encodeURIComponent(task.id)}/review`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.task) {
        const updated = tasks.map(t => t.id === task.id ? data.task : t);
        onSaveTasks(updated);
        const review = data.review;
        onNotify?.(
          `Review complete: ${review.verdict} — ${review.status === 'passed' ? 'Acceptance criteria verified' : 'Issues flagged'}`,
          review.status === 'passed' ? 'success' : 'error'
        );
      } else {
        onNotify?.(data.error || 'Failed to run review', 'error');
      }
    } catch (e: any) {
      onNotify?.(e.message, 'error');
    }
  };

  const taskMap = useMemo(() => new Map(tasks.map(task => [task.id, task])), [tasks]);

  // FLOW Today: deterministic priority scoring — no AI call. The reference time is
  // captured on mount and refreshed whenever the board changes, keeping render pure.
  // Scoring lives in shared/todayScore.
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => { setNowTs(Date.now()); }, [tasks]);
  const todayItems = useMemo(() => scoreTodayTasks(tasks, nowTs), [tasks, nowTs]);
  const driftSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of tasks) {
      const key = task.driftStatus || (task.status === 'done' ? 'complete' : 'not_started');
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  const achievements = [
    {
      id: 'initiate',
      title: 'WORKSPACE READY',
      description: 'Zeloryn workspace initialized successfully.',
      unlocked: true,
      icon: 'READY'
    },
    {
      id: 'task_started',
      title: 'FIRST TASK SEEDED',
      description: 'First development directive created.',
      unlocked: tasks.length > 0,
      icon: 'TASK'
    },
    {
      id: 'trace_ready',
      title: 'TRACEABLE EXECUTION',
      description: 'At least one task has acceptance criteria or a saved trace.',
      unlocked: tasks.some(t => (t.acceptanceCriteria || []).length > 0 || t.latestTraceId),
      icon: 'TRACE'
    },
    {
      id: 'stream_active',
      title: 'NODE LINK ACTIVE',
      description: 'Active streaming session triggered with compiler nodes.',
      unlocked: isStreaming,
      icon: 'LIVE'
    },
    {
      id: 'done_milestone',
      title: 'SYSTEM ENGINEER',
      description: 'Moved 3 or more tasks to the DONE pipeline lane.',
      unlocked: tasks.filter(t => t.status === 'done').length >= 3,
      icon: 'DONE'
    }
  ];

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    const newTask: ProjectTask = {
      id: `task_${Date.now()}`,
      title: taskTitle.trim(),
      status: 'todo',
      assignee: taskAssignee,
      category: taskCategory || inferCategory(taskTitle),
      workspace: workspaceRoot,
      blockedBy: [],
      lastModified: new Date().toISOString()
    };

    onSaveTasks([...tasks, newTask]);
    setTaskTitle('');
  };

  const moveTask = (taskId: string, direction: 'forward' | 'backward') => {
    const target = tasks.find(t => t.id === taskId);
    const willBeDone = direction === 'forward' && target?.status === 'in_progress';

    // 7a: Post-execution reviewer blocking gate on marking Done
    if (willBeDone && target?.postExecutionReview?.status === 'failed' && !target.postExecutionReview.override) {
      const confirmOverride = window.confirm(
        `Post-Execution CREW Reviewer flagged issues on "${target.title}":\n\n${target.postExecutionReview.findings || 'Acceptance criteria check failed.'}\n\nDo you want to explicitly override the reviewer and mark this card as Done?`
      );
      if (!confirmOverride) {
        onNotify?.('Card completion blocked by Post-Execution Reviewer. Resolve issues or explicitly confirm override to mark Done.', 'error');
        return;
      }
      target.postExecutionReview.override = true;
      fetch(`http://localhost:3001/api/plan/items/${encodeURIComponent(taskId)}/review/override`, { method: 'POST' }).catch(() => {});
    }

    const updated = tasks.map(t => {
      if (t.id === taskId) {
        let nextStatus: ProjectTask['status'] = t.status;
        if (direction === 'forward') {
          if (t.status === 'todo') nextStatus = 'in_progress';
          else if (t.status === 'in_progress') nextStatus = 'done';
        } else {
          if (t.status === 'done') nextStatus = 'in_progress';
          else if (t.status === 'in_progress') nextStatus = 'todo';
        }
        return {
          ...t,
          status: nextStatus,
          driftStatus: nextStatus === 'done' ? 'complete' : t.driftStatus,
          lastModified: new Date().toISOString()
        };
      }
      return t;
    });

    if (willBeDone) {
      const unblocked = findUnblockedTasks(updated, taskId);
      if (unblocked.length > 0) {
        onNotify?.(`Prerequisite completed! Auto-unblocked: ${unblocked.map(u => u.title).join(', ')}`, 'success');
      }
    }

    onSaveTasks(updated);
  };

  const handleDeleteTask = (taskId: string) => {
    onSaveTasks(tasks.filter(t => t.id !== taskId));
  };

  const unresolvedBlockers = (task: ProjectTask) => {
    return (task.blockedBy || []).filter(id => taskMap.get(id)?.status !== 'done');
  };

  // Capability-map routing: resolve which installed specialist should run a task,
  // or signal a general-orchestrator fallback. Memoized lookups stay cheap.
  const routeForTask = (task: ProjectTask) => {
    const category = (task.category || inferCategory(task.title)) as ItemCategory;
    return resolveAgentForCategory(category, installedAgents);
  };

  const runTaskQuery = (task: ProjectTask, overrideRunner?: string) => {
    const blockers = unresolvedBlockers(task);
    if (isStreaming || blockers.length > 0) return;
    const routing = routeForTask(task);
    const routingLine = routing.matchType === 'fallback'
      ? `Routing: no installed ${routing.category} specialist — using the general orchestrator with ${routing.category} as context.`
      : `Routing: ${routing.matchType} match → specialist "${routing.agentName}" (category ${routing.category}).`;
    const queryText = [
      `Execute FLOW task assigned to ${task.assignee}: "${task.title}".`,
      `Plan item id: ${task.id}.`,
      `Category: ${task.category || inferCategory(task.title)}.`,
      routingLine,
      task.workspace ? `Workspace scope: ${task.workspace}.` : '',
      'Use normal command approval and preserve review evidence.'
    ].filter(Boolean).join('\n');
    if (routing.matchType === 'fallback') {
      onNotify?.(`No ${routing.category} specialist installed — using the general agent.`, 'info');
    }
    const runner = overrideRunner || taskRunners[task.id] || 'claude-code';
    onSendQuery(queryText, {
      spaceOverride: 'code',
      planItemId: task.id,
      workspace: task.workspace,
      runner
    });
  };

  const executeNextToday = () => {
    if (isStreaming) return;
    const next = todayItems.find(item => !item.blocked);
    if (!next) {
      onNotify?.('No unblocked Today task to execute. Resolve blockers first.', 'info');
      return;
    }
    runTaskQuery(next.task);
  };

  // FLOW runs a single agent stream at a time, so "Execute All Today" hands the
  // ordered, unblocked Today list to the agent as one batch directive (no per-item
  // trace) rather than pretending to run them concurrently.
  const executeAllToday = () => {
    if (isStreaming) return;
    const runnable = todayItems.filter(item => !item.blocked);
    if (runnable.length === 0) {
      onNotify?.('No unblocked Today tasks to execute.', 'info');
      return;
    }
    if (runnable.length === 1) {
      runTaskQuery(runnable[0].task);
      return;
    }
    const list = runnable
      .map((item, idx) => `${idx + 1}. "${item.task.title}" [${item.task.category || inferCategory(item.task.title)}] (plan item ${item.task.id})`)
      .join('\n');
    const queryText = [
      `Work through today's prioritized FLOW tasks in order, one at a time:`,
      list,
      '',
      'Complete and verify each before moving to the next. Use normal command approval and preserve review evidence for every task.'
    ].join('\n');
    onSendQuery(queryText, { spaceOverride: 'code' });
    onNotify?.(`Dispatched ${runnable.length} Today tasks as a sequential batch.`, 'success');
  };

  const openCriteriaPanel = async (task: ProjectTask) => {
    setCriteriaTask(task);
    setCriteriaDraft(task.acceptanceCriteria || []);
    setEnrichmentNotice(null);
    if ((task.acceptanceCriteria || []).length > 0) return;
    setCriteriaBusy(true);
    try {
      // AI-draft Phase 1 criteria for review — not persisted until the user saves.
      const res = await fetch(`http://localhost:3001/api/plan/items/${encodeURIComponent(task.id)}/criteria/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'criteria route failed');
      setCriteriaDraft((data.criteria as AcceptanceCriterion[]) || []);
      onNotify?.(
        data.usedLlm
          ? 'AI-drafted Phase 1 criteria. Review, edit, then SAVE to apply.'
          : 'Drafted Phase 1 criteria (deterministic fallback). Review, edit, then SAVE.',
        'success'
      );
    } catch (err: any) {
      onNotify?.(`Could not generate criteria: ${err.message}`, 'error');
    } finally {
      setCriteriaBusy(false);
    }
  };

  const saveCriteria = async () => {
    if (!criteriaTask) return;
    setCriteriaBusy(true);
    try {
      const cleaned = criteriaDraft
        .map(criterion => ({
          ...criterion,
          description: criterion.description.trim(),
          target: criterion.target.trim()
        }))
        .filter(criterion => criterion.description && criterion.target);
      const res = await fetch(`http://localhost:3001/api/plan/items/${encodeURIComponent(criteriaTask.id)}/criteria`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria: cleaned })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'criteria save failed');
      const updatedTask = data.task as ProjectTask;
      onSaveTasks(tasks.map(item => item.id === updatedTask.id ? updatedTask : item));
      setCriteriaTask(updatedTask);
      setCriteriaDraft(updatedTask.acceptanceCriteria || []);
      onNotify?.('Acceptance criteria saved for review and drift checks.', 'success');
    } catch (err: any) {
      onNotify?.(`Could not save criteria: ${err.message}`, 'error');
    } finally {
      setCriteriaBusy(false);
    }
  };

  const enrichCriteria = async () => {
    if (!criteriaTask) return;
    setCriteriaBusy(true);
    setEnrichmentNotice(null);
    try {
      const res = await fetch(`http://localhost:3001/api/plan/items/${encodeURIComponent(criteriaTask.id)}/criteria/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'criteria enrichment failed');
      const updatedTask = data.task as ProjectTask;
      onSaveTasks(tasks.map(item => item.id === updatedTask.id ? updatedTask : item));
      setCriteriaTask(updatedTask);
      setCriteriaDraft(updatedTask.acceptanceCriteria || []);
      const addedCount = Array.isArray(data.added) ? data.added.length : 0;
      const candidateCount = Array.isArray(data.candidates) ? data.candidates.length : 0;
      setEnrichmentNotice(`Phase 2 scan found ${candidateCount} candidate signal(s) and added ${addedCount} new file criterion/criteria. Review before saving status decisions.`);
      onNotify?.('Phase 2 criteria enrichment complete.', addedCount > 0 ? 'success' : 'info');
    } catch (err: any) {
      onNotify?.(`Could not enrich criteria: ${err.message}`, 'error');
    } finally {
      setCriteriaBusy(false);
    }
  };

  const addCriterion = () => {
    const base = criteriaTask?.id || `criterion_${Date.now()}`;
    setCriteriaDraft(prev => [
      ...prev,
      {
        id: `${base}_${Date.now()}`,
        type: 'file_exists',
        description: '',
        target: '',
        phase: 'phase1',
        status: 'unknown',
        evidence: 'User-created criterion. Review before relying on drift result.'
      }
    ]);
  };

  const updateCriterion = (idx: number, patch: Partial<AcceptanceCriterion>) => {
    setCriteriaDraft(prev => prev.map((criterion, currentIdx) => currentIdx === idx ? { ...criterion, ...patch } : criterion));
  };

  const removeCriterion = (idx: number) => {
    setCriteriaDraft(prev => prev.filter((_criterion, currentIdx) => currentIdx !== idx));
  };

  const applySuggestedStatus = () => {
    if (!criteriaTask) return;
    const nextStatus = criteriaTask.driftStatus === 'complete' ? 'done' : criteriaTask.driftStatus === 'in_progress' ? 'in_progress' : criteriaTask.status;
    const updated = tasks.map(task => task.id === criteriaTask.id ? { ...task, status: nextStatus, lastModified: new Date().toISOString() } : task);
    onSaveTasks(updated);
    setCriteriaTask(prev => prev ? { ...prev, status: nextStatus } : prev);
  };

  const closeCriteriaPanel = () => {
    setCriteriaTask(null);
    setCriteriaDraft([]);
    setEnrichmentNotice(null);
  };

  const openBlockerEditor = (task: ProjectTask) => {
    setBlockerTask(task);
    setBlockerDraft(task.blockedBy || []);
  };

  const closeBlockerEditor = () => {
    setBlockerTask(null);
    setBlockerDraft([]);
  };

  const wouldCreateCycle = (task: ProjectTask, candidateId: string): boolean =>
    wouldCreateDependencyCycle(tasks, task.id, candidateId);

  const toggleBlocker = (id: string) => {
    setBlockerDraft(prev => prev.includes(id) ? prev.filter(existing => existing !== id) : [...prev, id]);
  };

  const saveBlockers = () => {
    if (!blockerTask) return;
    const cleaned = blockerDraft.filter(id => id !== blockerTask.id && taskMap.has(id));
    const updated = tasks.map(task =>
      task.id === blockerTask.id
        ? { ...task, blockedBy: cleaned, lastModified: new Date().toISOString() }
        : task
    );
    onSaveTasks(updated);
    onNotify?.(
      cleaned.length > 0
        ? `Saved ${cleaned.length} blocker(s) for "${blockerTask.title}".`
        : `Cleared blockers for "${blockerTask.title}".`,
      'success'
    );
    closeBlockerEditor();
  };

  const criteriaReviewPending = tasks.filter(task => (task.acceptanceCriteria || []).length === 0).length;

  const [bootstrapping, setBootstrapping] = useState(false);
  const bootstrapScan = async () => {
    setBootstrapping(true);
    try {
      const res = await fetch('http://localhost:3001/api/plan/bootstrap/evaluate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'bootstrap route failed');
      // Reflect updated likely-complete flags + criteria from the evaluation
      // result directly (it operates on the active board, not a fixed one).
      if (Array.isArray(data.result?.tasks)) onSaveTasks(data.result.tasks);
      const likely = data.result?.likelyComplete?.length || 0;
      onNotify?.(`Bootstrap scan: ${data.result?.evaluated || 0} item(s) evaluated, ${likely} likely complete.`, 'success');
    } catch (err: any) {
      onNotify?.(`Bootstrap scan failed: ${err.message}`, 'error');
    } finally {
      setBootstrapping(false);
    }
  };

  const checkDrift = async () => {
    setDriftChecking(true);
    try {
      const res = await fetch('http://localhost:3001/api/plan/drift');
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'drift route failed');
      const reportItems = data.report?.items || [];
      const byId = new Map(reportItems.map((item: any) => [item.taskId, item]));
      onSaveTasks(tasks.map(task => {
        const reportItem: any = byId.get(task.id);
        if (!reportItem) return task;
        return {
          ...task,
          driftStatus: reportItem.status,
          category: task.category || reportItem.category || inferCategory(task.title)
        };
      }));
      const diverged = data.report?.summary?.diverged || 0;
      const deferred = data.report?.deferred || 0;
      const parts = ['Plan drift check complete.'];
      if (diverged > 0) parts.push(`${diverged} diverged.`);
      if (deferred > 0) parts.push(`${deferred} item(s) deferred (LLM budget).`);
      onNotify?.(parts.join(' '), diverged > 0 ? 'warning' : 'success');
    } catch (err: any) {
      onNotify?.(`Plan drift check failed: ${err.message}`, 'error');
    } finally {
      setDriftChecking(false);
    }
  };

  const renderTaskCard = (task: ProjectTask) => {
    const blockers = unresolvedBlockers(task);
    const isBlocked = blockers.length > 0;
    const criteriaCount = (task.acceptanceCriteria || []).length;
    const category = task.category || inferCategory(task.title);
    const routing = routeForTask(task);

    return (
      <div
        key={task.id}
        data-testid={`task-card-${task.id}`}
        className={`bg-forge-very-dark bg-opacity-40 border p-2 rounded transition-colors group relative ${
          isBlocked ? 'border-red-900 opacity-65' : 'border-forge-dark hover:border-forge-dim'
        }`}
      >
        <div
          onClick={() => setDrawerTask(task)}
          className={`text-xs break-words select-text font-bold mb-1 cursor-pointer hover:text-white transition-colors ${task.status === 'done' ? 'text-forge-dim line-through opacity-75' : 'text-forge-text'}`}
          title="Click to view & edit task details"
        >
          <SafeMarkdown text={task.title} />
        </div>
        <div className="flex flex-wrap gap-1 mb-1.5 text-[8px] uppercase font-bold">
          <span className={`border rounded px-1 py-0.5 ${driftClass(task.driftStatus)}`}>
            {task.driftStatus || (task.status === 'done' ? 'complete' : 'not_started')}
          </span>
          <span className="border border-forge-dark text-forge-dim rounded px-1 py-0.5">{category}</span>
          {task.workspace && (
            <span
              title={task.workspace}
              className="border border-forge-dark text-forge-dim rounded px-1 py-0.5 truncate max-w-[130px] normal-case"
            >
              {task.workspace.replace(/[\\/]+$/, '').split(/[\\/]/).pop()}
            </span>
          )}
          {criteriaCount > 0 && <span className="border border-cyan-700 text-cyan-300 rounded px-1 py-0.5">{criteriaCount} criteria</span>}
          {task.latestTraceId && <span className="border border-forge-neon text-forge-neon rounded px-1 py-0.5">trace</span>}
          {task.bootstrapLikelyComplete && task.status !== 'done' && <span className="border border-forge-neon text-forge-neon rounded px-1 py-0.5" title="Structural criteria already pass — confirm to complete">likely complete</span>}
          {isBlocked && <span className="border border-red-700 text-red-300 rounded px-1 py-0.5">blocked</span>}
          {!isBlocked && (task.blockedBy || []).length > 0 && task.status !== 'done' && (
            <span className="border border-green-700 text-green-300 rounded px-1 py-0.5 font-bold" title="All blockers completed — ready to schedule">unblocked</span>
          )}
          {worktrees[task.id.replace(/[^a-zA-Z0-9_-]/g, '_')] && (
            <span className="border border-purple-700 text-purple-300 rounded px-1 py-0.5" title={`Isolated on branch ${worktrees[task.id.replace(/[^a-zA-Z0-9_-]/g, '_')].branch}`}>
              wt: {worktrees[task.id.replace(/[^a-zA-Z0-9_-]/g, '_')].branch.replace('forge/card-', '')}
            </span>
          )}
          {task.postExecutionReview && (
            <span
              className={`border rounded px-1 py-0.5 ${
                task.postExecutionReview.status === 'passed'
                  ? 'border-emerald-600 text-emerald-400'
                  : 'border-red-600 text-red-400'
              }`}
              title={
                task.postExecutionReview.findings
                  ? `Review: ${task.postExecutionReview.status.toUpperCase()}\n${task.postExecutionReview.findings}`
                  : `Review: ${task.postExecutionReview.status}`
              }
            >
              review: {task.postExecutionReview.status === 'passed' ? 'pass' : 'fail'}
            </span>
          )}
        </div>
        {isBlocked && (
          <div className="text-[8px] text-red-400 mb-1">
            Waiting on: {blockers.map(id => taskMap.get(id)?.title || id).join(', ')}
          </div>
        )}
        <div className="flex items-center justify-between text-[9px]">
          <div className="flex items-center gap-1.5">
            <span className={getAssigneeColor(task.assignee)}>[{task.assignee}]</span>
            {routing.matchType === 'fallback' && task.status !== 'done' && (
              <span
                className="text-[8px] text-amber-500/80 dark:text-amber-400/80 border border-amber-500/30 px-1 py-0.2 rounded font-mono"
                title={`No dedicated ${routing.category} specialist in Crew — using general agent.`}
              >
                general
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
            {task.status !== 'todo' && (
              <button onClick={() => moveTask(task.id, 'backward')} title="Move backward" className="text-forge-neon hover:text-white">
                <ArrowLeft size={8} />
              </button>
            )}
            <button
              onClick={() => openCriteriaPanel(task)}
              title="Review acceptance criteria"
              className="text-cyan-300 hover:text-white"
            >
              <ListChecks size={8} />
            </button>
            <button
              onClick={() => handleRunPostExecutionReview(task)}
              title="Run post-execution CREW review"
              className="text-emerald-400 hover:text-white"
            >
              <ShieldCheck size={8} />
            </button>
            <button
              onClick={() => openBlockerEditor(task)}
              title="Edit dependencies (blockers)"
              className={`hover:text-white ${(task.blockedBy || []).length > 0 ? 'text-amber-300' : 'text-forge-dim'}`}
            >
              <Link2 size={8} />
            </button>
            {worktrees[task.id.replace(/[^a-zA-Z0-9_-]/g, '_')] ? (
              <>
                <button
                  onClick={() => handleMergeWorktree(task)}
                  title="Merge isolated card worktree into workspace"
                  className="text-purple-300 hover:text-white"
                >
                  <GitFork size={8} />
                </button>
                <button
                  onClick={() => handleRevertWorktree(task)}
                  title="Revert and delete isolated card worktree"
                  className="text-amber-400 hover:text-red-400"
                >
                  <RotateCcw size={8} />
                </button>
              </>
            ) : (
              <button
                onClick={() => handleCreateWorktree(task)}
                title="Create isolated Git worktree for this card"
                className="text-forge-dim hover:text-purple-300"
              >
                <GitBranch size={8} />
              </button>
            )}
            {task.status !== 'done' && (
              <select
                data-testid="runner-select"
                value={taskRunners[task.id] || 'claude-code'}
                onChange={(e) => setTaskRunners(prev => ({ ...prev, [task.id]: e.target.value }))}
                title="Select Execution Runner"
                className="bg-forge-very-dark border border-forge-dark text-[9px] text-forge-neon rounded px-1 py-0.5 font-mono cursor-pointer hover:border-forge-neon"
              >
                <option value="claude-code">Claude</option>
                <option value="codex-cli">Codex</option>
              </select>
            )}
            {task.status !== 'done' && (
              <button
                onClick={() => runTaskQuery(task)}
                title={isBlocked ? 'Blocked by unfinished dependency' : `Run Task Agent with ${taskRunners[task.id] || 'claude-code'}`}
                disabled={isBlocked || isStreaming}
                className="px-1.5 py-0.5 rounded border border-forge-neon/40 bg-forge-neon/15 hover:bg-forge-neon/30 text-forge-neon text-[9px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play size={8} />
                <span>Run</span>
              </button>
            )}
            {task.status !== 'done' && onOpenVibeTask && (
              <button
                type="button"
                onClick={() => onOpenVibeTask(task.id)}
                title={isBlocked ? 'Blocked by unfinished dependency' : 'Build this feature visually in Vibe Studio with live interactive preview'}
                disabled={isBlocked || isStreaming}
                className="px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 text-[9px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Sparkles size={8} />
                <span>Vibe</span>
              </button>
            )}
            <button
              onClick={() => setHandoffModalTask(task)}
              title="Push to... (In-App CLI Runner or External AI Editor)"
              className="px-1.5 py-0.5 rounded border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-400 text-[9px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-all"
            >
              <ExternalLink size={8} />
              <span>Push</span>
            </button>
            <button onClick={() => handleDeleteTask(task.id)} title="Delete Task" className="text-red-400 hover:text-white p-0.5">
              <Trash2 size={9} />
            </button>
            {task.status !== 'done' && (
              <button onClick={() => moveTask(task.id, 'forward')} title="Move forward" className="text-forge-neon hover:text-white p-0.5">
                <ArrowRight size={9} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const columns: Array<{ id: ProjectTask['status']; label: string; icon: React.ReactNode; tasks: ProjectTask[] }> = [
    { id: 'todo', label: 'TODO', icon: <Clock size={10} />, tasks: tasks.filter(t => t.status === 'todo') },
    { id: 'in_progress', label: 'IN PROGRESS', icon: <Play size={10} className="animate-pulse" />, tasks: tasks.filter(t => t.status === 'in_progress') },
    { id: 'done', label: 'DONE', icon: <CheckCircle size={10} />, tasks: tasks.filter(t => t.status === 'done') }
  ];

  return (
    <div className="flex h-full overflow-hidden gap-3 font-mono p-2 select-none">
      <div className="flex-1 flex flex-col overflow-hidden forge-surface p-3">
        <div className="flex items-center justify-between gap-3 border-b border-forge-dark pb-1.5 mb-2">
          <div className="flex items-center gap-3">
            <div>
              <span className="forge-panel-title block">Flow board</span>
              <span className="forge-panel-subtitle">Prioritized work from plan to execution</span>
            </div>
            {/* View Mode Switcher: Kanban vs Today */}
            <div className="flex items-center rounded border border-forge-dark bg-forge-very-dark/80 p-0.5 text-[9px] font-mono">
              <button
                type="button"
                onClick={() => handleSetFlowViewMode('kanban')}
                data-testid="flow-view-kanban"
                className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                  flowViewMode === 'kanban'
                    ? 'bg-forge-neon/20 text-forge-neon font-bold border border-forge-neon/40 shadow-sm'
                    : 'text-forge-dim hover:text-forge-text'
                }`}
              >
                <Kanban size={10} />
                <span>Kanban</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetFlowViewMode('today')}
                data-testid="flow-view-today"
                className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                  flowViewMode === 'today'
                    ? 'bg-forge-neon/20 text-forge-neon font-bold border border-forge-neon/40 shadow-sm'
                    : 'text-forge-dim hover:text-forge-text'
                }`}
              >
                <Clock size={10} />
                <span>Today ({todayItems.length})</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[9px]">
            <span className="text-forge-dim">
              {driftSummary.complete || 0} complete / {driftSummary.in_progress || 0} in progress / {driftSummary.blocked || 0} blocked
            </span>
            {(() => {
              const nextSchedulable = getNextSchedulableTask(tasks);
              if (!nextSchedulable || isStreaming) return null;
              return (
                <button
                  type="button"
                  onClick={() => runTaskQuery(nextSchedulable)}
                  className="forge-btn text-[9px] px-2 py-1 flex items-center gap-1 border-green-500 text-green-400"
                  title={`Run next ready card: ${nextSchedulable.title}`}
                >
                  <Play size={9} />
                  <span>Next Ready</span>
                </button>
              );
            })()}
            {isStreaming && (
              <button
                type="button"
                onClick={onAbort}
                className="forge-stop-button flex items-center gap-1 animate-pulse"
                title="Stop current activity"
              >
                <Square size={9} />
                <span>STOP</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleImportTodos}
              disabled={importingTodos}
              title="Scan existing codebase files for TODO / FIXME comments and import into Flow"
              className="forge-secondary-button flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw size={9} className={importingTodos ? 'animate-spin' : ''} />
              <span>{importingTodos ? 'Importing' : 'Import TODOs'}</span>
            </button>
            <button
              type="button"
              onClick={bootstrapScan}
              disabled={bootstrapping}
              title="Scan existing code; flag items whose structural criteria already pass"
              className="forge-secondary-button flex items-center gap-1 disabled:opacity-50"
            >
              <FolderOpen size={9} />
              <span>{bootstrapping ? 'Scanning' : 'Bootstrap'}</span>
            </button>
            <button
              type="button"
              onClick={checkDrift}
              disabled={driftChecking}
              className="forge-btn text-[9px] px-2 py-1 flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw size={9} className={driftChecking ? 'animate-spin' : ''} />
              <span>{driftChecking ? 'Checking' : 'Check drift'}</span>
            </button>
          </div>
        </div>

        {/* Kanban Mode: Compact 1-line Today Priorities strip */}
        {flowViewMode === 'kanban' && (
          <div className="mb-2 flex items-center justify-between gap-2 px-2.5 py-1 rounded border border-forge-dark/60 bg-forge-very-dark/50 text-[9px]">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => handleSetFlowViewMode('today')}
                data-testid="today-priority-badge"
                className="flex items-center gap-1.5 font-bold text-forge-neon hover:underline cursor-pointer shrink-0"
                title="Switch to Today priority list view"
              >
                <Clock size={11} />
                <span>Today Priorities:</span>
                <span className="px-1.5 py-0.2 rounded bg-forge-neon/15 text-forge-neon font-mono text-[8.5px]">
                  {todayItems.length} {todayItems.length === 1 ? 'task' : 'tasks'}
                </span>
              </button>
              <span className="text-forge-dim text-[8.5px]">
                • {todayItems.filter(i => !i.blocked).length} ready
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {todayItems.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={executeNextToday}
                    disabled={isStreaming || todayItems.every(item => item.blocked)}
                    className="forge-btn text-[8.5px] px-2 py-0.5 flex items-center gap-1 disabled:opacity-40"
                    title="Run highest priority unblocked task"
                  >
                    <Play size={8} />
                    <span>Execute next</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetFlowViewMode('today')}
                    className="text-forge-dim hover:text-white text-[8.5px] underline ml-1"
                  >
                    View all →
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {criteriaReviewPending > 0 && (
          <div className="mb-2 border border-amber-900 bg-amber-950/20 text-amber-200 rounded px-2 py-1.5 text-[9px] flex items-center justify-between gap-2">
            <span>
              {criteriaReviewPending} task(s) do not have reviewed acceptance criteria. Drift results are useful only after criteria are reviewed.
            </span>
          </div>
        )}

        <form onSubmit={handleAddTask} className="flex items-center gap-2 mb-3 forge-surface p-2">
          <input
            type="text"
            placeholder="Add new task..."
            value={taskTitle}
            onChange={(e) => {
              setTaskTitle(e.target.value);
              setTaskCategory(inferCategory(e.target.value));
            }}
            className="forge-input flex-1 min-w-0 text-xs text-forge-text px-2.5 py-1.5 placeholder:text-forge-dark font-mono rounded"
          />
          <select
            aria-label="Task assignee"
            value={taskAssignee}
            onChange={(e) => setTaskAssignee(e.target.value)}
            className="w-36 bg-forge-very-dark border border-forge-dark text-[10px] text-forge-neon px-2 py-1.5 rounded font-mono shrink-0 cursor-pointer"
          >
            <optgroup label="Core Roles">
              {coreAssignees.map(a => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Specialist Agents">
              {specialistAssignees.map(a => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </optgroup>
          </select>
          <select
            aria-label="Task category"
            value={taskCategory}
            onChange={(e) => setTaskCategory(e.target.value)}
            className="w-28 bg-forge-very-dark border border-forge-dark text-xs text-forge-neon px-2 py-1.5 rounded font-mono shrink-0 cursor-pointer"
          >
            {categories.map(category => <option key={category} value={category}>{category}</option>)}
          </select>
          <button type="submit" className="forge-btn text-[10px] px-3 py-1.5 flex items-center gap-1 shrink-0 cursor-pointer">
            <Plus size={10} />
            <span>Add task</span>
          </button>
        </form>

        {tasks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="max-w-2xl w-full">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-forge-neon/30 bg-forge-neon/10 text-forge-neon text-xs font-mono mb-3">
                <Sparkles size={12} />
                <span>Workspace Ready • No Tasks Created</span>
              </div>
              <h3 className="text-base font-bold text-forge-text mb-1">Welcome to Flow Board</h3>
              <p className="text-xs text-forge-dim mb-6 max-w-lg mx-auto">
                Flow turns architectural plans and codebase state into actionable, tracked task cards with acceptance criteria and multi-engine runners.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
                {/* Card 1: Import Code TODOs */}
                <div className="p-3.5 rounded border border-forge-dark bg-forge-very-dark/80 hover:border-cyan-500/50 transition-all flex flex-col justify-between group">
                  <div>
                    <div className="flex items-center gap-2 mb-2 text-cyan-400">
                      <RefreshCw size={16} className={`group-hover:rotate-180 transition-transform duration-500 ${importingTodos ? 'animate-spin' : ''}`} />
                      <span className="font-bold text-xs">Import Code TODOs</span>
                    </div>
                    <p className="text-[11px] text-forge-dim mb-4 leading-relaxed">
                      Scans codebase files for <code className="text-cyan-300 bg-cyan-950/40 px-1 py-0.5 rounded">TODO</code> and <code className="text-cyan-300 bg-cyan-950/40 px-1 py-0.5 rounded">FIXME</code> annotations and imports them as cards.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleImportTodos}
                    disabled={importingTodos}
                    data-testid="hero-import-todos"
                    className="forge-btn text-xs w-full py-1.5 flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw size={11} className={importingTodos ? 'animate-spin' : ''} />
                    <span>{importingTodos ? 'Importing...' : 'Scan & Import'}</span>
                  </button>
                </div>

                {/* Card 2: Generate Plan with AI */}
                <div className="p-3.5 rounded border border-forge-dark bg-forge-very-dark/80 hover:border-forge-neon/50 transition-all flex flex-col justify-between group">
                  <div>
                    <div className="flex items-center gap-2 mb-2 text-forge-neon">
                      <Sparkles size={16} className="group-hover:scale-110 transition-transform" />
                      <span className="font-bold text-xs">Generate AI Plan</span>
                    </div>
                    <p className="text-[11px] text-forge-dim mb-4 leading-relaxed">
                      Prompts the Architect agent to analyze the project structure and suggest an engineering implementation roadmap.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSendQuery?.('Analyze this codebase structure, dependencies, and git status, then propose an architectural plan with prioritized tasks.', { spaceOverride: 'project' })}
                    data-testid="hero-generate-plan"
                    className="forge-btn text-xs w-full py-1.5 flex items-center justify-center gap-1.5 border-forge-neon text-forge-neon"
                  >
                    <Sparkles size={11} />
                    <span>Generate Plan</span>
                  </button>
                </div>

                {/* Card 3: Bootstrap Structural Scan */}
                <div className="p-3.5 rounded border border-forge-dark bg-forge-very-dark/80 hover:border-emerald-500/50 transition-all flex flex-col justify-between group">
                  <div>
                    <div className="flex items-center gap-2 mb-2 text-emerald-400">
                      <FolderOpen size={16} className="group-hover:scale-110 transition-transform" />
                      <span className="font-bold text-xs">Bootstrap Scan</span>
                    </div>
                    <p className="text-[11px] text-forge-dim mb-4 leading-relaxed">
                      Validates directory structure, git worktrees, and checks if acceptance criteria for planned items are already fulfilled.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={bootstrapScan}
                    disabled={bootstrapping}
                    data-testid="hero-bootstrap-scan"
                    className="forge-secondary-button text-xs w-full py-1.5 flex items-center justify-center gap-1.5 border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/20"
                  >
                    <FolderOpen size={11} />
                    <span>{bootstrapping ? 'Scanning...' : 'Run Scan'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : flowViewMode === 'today' ? (
          /* Today Full Priority Queue View */
          <div className="flex-1 flex flex-col overflow-hidden forge-surface">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-forge-dark bg-forge-very-dark/40">
              <div className="text-[11px] text-forge-text font-bold flex items-center gap-2">
                <Clock size={12} className="text-forge-neon" />
                <span>Today Priority Queue ({todayItems.length})</span>
                <span className="text-[9px] text-forge-dim font-normal">
                  Ordered by dependency-unblocked priority score
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={executeNextToday}
                  disabled={isStreaming || todayItems.every(item => item.blocked)}
                  className="forge-btn text-[9px] px-2.5 py-1 flex items-center gap-1 disabled:opacity-40"
                  title="Run the highest-priority unblocked task"
                >
                  <Play size={8} />
                  <span>Execute next</span>
                </button>
                <button
                  type="button"
                  onClick={executeAllToday}
                  disabled={isStreaming || todayItems.every(item => item.blocked)}
                  className="forge-secondary-button text-[9px] px-2.5 py-1 disabled:opacity-40"
                  title="Dispatch all unblocked Today tasks as a sequential batch"
                >
                  Execute all
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {todayItems.length === 0 ? (
                <div className="text-xs text-forge-dim py-12 text-center">
                  No open tasks in Today queue. Add a task or move one out of DONE.
                </div>
              ) : (
                todayItems.map((item, idx) => (
                  <div
                    key={item.task.id}
                    className="flex items-center gap-2.5 p-2 rounded border border-forge-dark/60 bg-forge-very-dark/60 hover:border-forge-dark transition-colors text-[10px]"
                  >
                    <span className="text-forge-dim w-4 text-center shrink-0 font-bold">{idx + 1}.</span>
                    <span
                      onClick={() => setDrawerTask(item.task)}
                      className={`flex-1 truncate cursor-pointer hover:text-white hover:underline transition-colors ${item.blocked ? 'text-forge-dim' : 'text-forge-text font-medium'}`}
                      title="Click to view & edit task details"
                    >
                      <SafeMarkdown text={item.task.title} />
                    </span>
                    <span className={`text-[9px] px-1 py-0.5 rounded font-mono ${getAssigneeColor(item.task.assignee)}`}>
                      [{item.task.assignee}]
                    </span>
                    {item.blocked && (
                      <span className="text-[8px] uppercase border border-red-700 text-red-300 rounded px-1.5 py-0.5 font-bold">
                        blocked
                      </span>
                    )}
                    <span className="text-[8.5px] uppercase border border-forge-neon/40 text-forge-neon rounded px-1.5 py-0.5 font-mono" title="Priority score">
                      score: {item.score}
                    </span>
                    <button
                      type="button"
                      onClick={() => runTaskQuery(item.task)}
                      disabled={item.blocked || isStreaming}
                      title={item.blocked ? 'Blocked by unfinished dependency' : 'Run this task in Forge'}
                      className="px-2 py-1 rounded border border-forge-neon/40 bg-forge-neon/10 text-forge-neon text-[9px] font-mono font-bold hover:bg-forge-neon/20 disabled:opacity-40 flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Play size={8} />
                      <span>Run</span>
                    </button>
                    {onOpenVibeTask && (
                      <button
                        type="button"
                        onClick={() => onOpenVibeTask(item.task.id)}
                        disabled={item.blocked || isStreaming}
                        title="Build this task visually in Vibe Studio"
                        className="px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[9px] font-mono font-bold hover:bg-emerald-500/20 disabled:opacity-40 flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Sparkles size={8} />
                        <span>Vibe</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setHandoffModalTask(item.task)}
                      title="Push to... (In-App CLI Runner or External AI Editor)"
                      className="px-2 py-1 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 text-[9px] font-mono font-bold hover:bg-cyan-500/20 flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <ExternalLink size={8} />
                      <span>Push</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Kanban Columns View */
          <div className="flex-1 grid grid-cols-3 gap-2 overflow-hidden">
            {columns.map(column => (
              <div key={column.id} className="flex flex-col overflow-hidden forge-surface p-2">
                <span className="text-[11px] text-forge-dim font-bold mb-2 pb-1 border-b border-forge-dark flex items-center gap-1.5">
                  {column.icon}
                  <span>{column.label} ({column.tasks.length})</span>
                </span>
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                  {column.tasks.length === 0 ? (
                    <div className="text-[10px] text-forge-dim/60 italic py-6 text-center border border-dashed border-forge-dark/30 rounded my-2">
                      No {column.label.toLowerCase()} tasks
                    </div>
                  ) : (
                    column.tasks.map(renderTaskCard)
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="w-[300px] flex flex-col forge-surface overflow-hidden">
        <button
          onClick={() => setFileBrowserOpen(!fileBrowserOpen)}
          className="w-full text-[11px] text-forge-text font-bold bg-forge-very-dark p-2.5 border-b border-forge-dark hover:bg-forge-dark flex items-center gap-2"
        >
          <FolderOpen size={12} />
          <span>{fileBrowserOpen ? 'Hide files' : 'Show files'}</span>
        </button>
        {fileBrowserOpen && (
          <div className="flex-1 p-2 overflow-hidden min-h-[180px]">
            <FileBrowser workspaceRoot={workspaceRoot} onUpdateWorkspaceRoot={onUpdateWorkspaceRoot} />
          </div>
        )}

        <div className="border-t border-forge-dark p-2 bg-forge-very-dark bg-opacity-35 mt-auto">
          <span className="text-[10px] text-forge-neon font-bold uppercase tracking-widest block mb-2">
            BUILD LOOP SIGNALS
          </span>
          <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1" tabIndex={0} aria-label="Build loop signals">
            {achievements.map(ach => (
              <div
                key={ach.id}
                className={`p-1.5 rounded border text-[9px] flex gap-2 transition-all duration-300 ${
                  ach.unlocked
                    ? 'border-forge-neon bg-forge-very-dark bg-opacity-40 text-forge-text'
                    : 'border-forge-dark bg-forge-very-dark bg-opacity-30 text-forge-dim'
                }`}
              >
                <span className="text-xs shrink-0 self-center">{ach.unlocked ? ach.icon : 'LOCK'}</span>
                <div className="flex flex-col flex-1">
                  <span className={`font-bold tracking-wider ${ach.unlocked ? 'text-forge-neon' : 'text-forge-dim'}`}>
                    {ach.title}
                  </span>
                  <span className="text-[8px] leading-tight mt-0.5">{ach.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {criteriaTask && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4 backdrop-blur-sm font-mono">
          <div className="forge-panel w-full max-w-4xl max-h-[88vh] bg-forge-very-dark border border-forge-neon flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-forge-dark px-4 py-3">
              <div className="min-w-0">
                <div className="text-[11px] text-forge-neon font-bold uppercase tracking-wider">Acceptance Criteria Review</div>
                <div className="text-[10px] text-forge-text truncate">{criteriaTask.title}</div>
              </div>
              <button
                type="button"
                onClick={closeCriteriaPanel}
                className="text-forge-dim hover:text-white"
                title="Close criteria review"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-4 py-3 border-b border-forge-dark text-[10px] text-forge-dim flex flex-wrap items-center gap-2">
              <span className={`border rounded px-1.5 py-0.5 uppercase ${driftClass(criteriaTask.driftStatus)}`}>
                {criteriaTask.driftStatus || 'not_started'}
              </span>
              <span className="border border-forge-dark rounded px-1.5 py-0.5 uppercase">{criteriaTask.category || inferCategory(criteriaTask.title)}</span>
              {criteriaTask.workspace && <span className="border border-forge-dark rounded px-1.5 py-0.5 truncate max-w-[420px]">{criteriaTask.workspace}</span>}
              {criteriaTask.latestTraceId && <span className="border border-forge-neon text-forge-neon rounded px-1.5 py-0.5">trace saved</span>}
              {enrichmentNotice && <span className="w-full text-amber-200 border border-amber-700 bg-forge-very-dark rounded px-2 py-1 mt-1">{enrichmentNotice}</span>}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {criteriaDraft.length === 0 ? (
                <div className="border border-forge-dark rounded p-4 text-[11px] text-forge-dim text-center">
                  No criteria yet. Draft Phase 1 criteria or add one manually.
                </div>
              ) : (
                criteriaDraft.map((criterion, idx) => (
                  <div key={criterion.id || idx} className="border border-forge-dark rounded bg-forge-very-dark bg-opacity-35 p-2.5 grid grid-cols-[112px_92px_1fr_1fr_auto] gap-2 items-start">
                    <select
                      aria-label={`Criterion ${idx + 1} type`}
                      value={criterion.type}
                      onChange={(e) => updateCriterion(idx, { type: e.target.value as AcceptanceCriterionType })}
                      className="bg-forge-very-dark border border-forge-dark text-[10px] text-forge-neon px-1.5 py-1 rounded"
                    >
                      {criterionTypes.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                    <select
                      aria-label={`Criterion ${idx + 1} phase`}
                      value={criterion.phase}
                      onChange={(e) => updateCriterion(idx, { phase: e.target.value as CriterionPhase })}
                      className="bg-forge-very-dark border border-forge-dark text-[10px] text-forge-neon px-1.5 py-1 rounded"
                    >
                      {criterionPhases.map(phase => <option key={phase} value={phase}>{phase}</option>)}
                    </select>
                    <input
                      value={criterion.description}
                      onChange={(e) => updateCriterion(idx, { description: e.target.value })}
                      placeholder="Criterion description..."
                      className="bg-forge-very-dark border border-forge-dark text-[10px] text-forge-text px-2 py-1 rounded outline-none"
                    />
                    <input
                      value={criterion.target}
                      onChange={(e) => updateCriterion(idx, { target: e.target.value })}
                      placeholder="Target path, symbol, command, or claim..."
                      className="bg-forge-very-dark border border-forge-dark text-[10px] text-forge-text px-2 py-1 rounded outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeCriterion(idx)}
                      className="text-red-400 hover:text-white pt-1"
                      title="Remove criterion"
                    >
                      <Trash2 size={12} />
                    </button>
                    <div className="col-span-5 text-[9px] text-forge-dim">
                      {criterion.evidence || 'No evidence yet.'}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-forge-dark px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={addCriterion} className="forge-btn text-[10px] px-2 py-1">
                  ADD CRITERION
                </button>
                <button type="button" onClick={enrichCriteria} disabled={criteriaBusy} className="forge-btn text-[10px] px-2 py-1 disabled:opacity-50">
                  SCAN & ENRICH
                </button>
                <button
                  type="button"
                  onClick={applySuggestedStatus}
                  disabled={!criteriaTask.driftStatus || criteriaTask.driftStatus === 'not_started' || criteriaTask.driftStatus === 'blocked'}
                  className="border border-forge-dark text-[10px] text-forge-dim hover:text-white rounded px-2 py-1 disabled:opacity-40"
                >
                  APPLY SUGGESTED STATUS
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={closeCriteriaPanel} className="border border-forge-dark text-[10px] text-forge-dim hover:text-white rounded px-2 py-1">
                  CLOSE
                </button>
                <button type="button" onClick={saveCriteria} disabled={criteriaBusy} className="forge-btn text-[10px] px-3 py-1 disabled:opacity-50">
                  {criteriaBusy ? 'SAVING...' : 'SAVE REVIEWED CRITERIA'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {blockerTask && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4 backdrop-blur-sm font-mono">
          <div className="forge-panel w-full max-w-xl max-h-[80vh] bg-forge-very-dark border border-forge-neon flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-forge-dark px-4 py-3">
              <div className="min-w-0">
                <div className="text-[11px] text-forge-neon font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Link2 size={12} /> Edit Dependencies
                </div>
                <div className="text-[10px] text-forge-text truncate">{blockerTask.title}</div>
              </div>
              <button type="button" onClick={closeBlockerEditor} className="text-forge-dim hover:text-white" title="Close">
                <X size={16} />
              </button>
            </div>

            <div className="px-4 py-2 border-b border-forge-dark text-[9px] text-forge-dim">
              Select the tasks that must finish before this one. Blocked tasks are greyed on the board and cannot run until every blocker is done.
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {tasks.filter(candidate => candidate.id !== blockerTask.id).length === 0 ? (
                <div className="text-[10px] text-forge-dim text-center py-4">No other tasks to depend on.</div>
              ) : (
                tasks
                  .filter(candidate => candidate.id !== blockerTask.id)
                  .map(candidate => {
                    const checked = blockerDraft.includes(candidate.id);
                    const cyclic = !checked && wouldCreateCycle(blockerTask, candidate.id);
                    return (
                      <label
                        key={candidate.id}
                        className={`flex items-center gap-2 border rounded px-2 py-1.5 text-[10px] ${
                          cyclic ? 'border-forge-dark opacity-40 cursor-not-allowed' : 'border-forge-dark hover:border-forge-dim cursor-pointer'
                        }`}
                        title={cyclic ? 'Would create a circular dependency' : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={cyclic}
                          onChange={() => toggleBlocker(candidate.id)}
                          className="accent-forge-neon"
                        />
                        <span className={`flex-1 truncate ${candidate.status === 'done' ? 'text-forge-dim line-through' : 'text-forge-text'}`}>
                          {candidate.title}
                        </span>
                        <span className={`text-[8px] uppercase border rounded px-1 ${candidate.status === 'done' ? 'border-forge-neon text-forge-neon' : 'border-forge-dark text-forge-dim'}`}>
                          {candidate.status === 'done' ? 'done' : candidate.status === 'in_progress' ? 'wip' : 'todo'}
                        </span>
                        {cyclic && <span className="text-[8px] uppercase text-red-400">cycle</span>}
                      </label>
                    );
                  })
              )}
            </div>

            <div className="border-t border-forge-dark px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-[9px] text-forge-dim">{blockerDraft.length} blocker(s) selected</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={closeBlockerEditor} className="border border-forge-dark text-[10px] text-forge-dim hover:text-white rounded px-2 py-1">
                  CANCEL
                </button>
                <button type="button" onClick={saveBlockers} className="forge-btn text-[10px] px-3 py-1">
                  SAVE DEPENDENCIES
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- PUSH TO / HANDOFF MODAL (Phase 6) --- */}
      {handoffModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono select-none">
          <div className="w-full max-w-lg border border-forge-neon rounded bg-forge-panel-bg p-5 flex flex-col max-h-[85vh] overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center border-b border-forge-dark pb-2 mb-3">
              <span className="text-xs font-bold text-forge-neon uppercase tracking-wider flex items-center gap-1.5">
                <ExternalLink size={14} /> Push / Handoff: {handoffModalTask.title}
              </span>
              <button
                type="button"
                onClick={() => setHandoffModalTask(null)}
                className="text-forge-dim hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-[10px] text-forge-dim mb-3 leading-relaxed">
              Choose an execution path for this card. Run locally inside Forge via terminal AI agents, build visually in Vibe Studio, or export a specification bundle to your desktop AI editor.
            </div>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
              {/* Visual Studio Option */}
              {onOpenVibeTask && (
                <div className="border border-forge-dark rounded p-3 bg-forge-very-dark/60">
                  <div className="flex items-center justify-between mb-2 border-b border-forge-dark pb-1">
                    <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                      <Sparkles size={11} /> VISUAL VIBE STUDIO
                    </span>
                    <span className="text-[8px] border border-emerald-700 text-emerald-300 rounded px-1 font-bold">Live Interactive Preview</span>
                  </div>
                  <div className="text-[9px] text-forge-dim mb-2.5">
                    Build and test this feature visually with live responsive device frames and natural language prompt assistance.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const taskId = handoffModalTask.id;
                      setHandoffModalTask(null);
                      onOpenVibeTask(taskId);
                    }}
                    className="w-full border border-emerald-500/40 hover:border-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 p-2.5 rounded text-left transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Sparkles size={12} className="text-emerald-400" />
                        <span>Vibe Studio</span>
                      </div>
                      <span className="text-[8px] text-forge-dim">Live desktop, tablet, and mobile testing canvas.</span>
                    </div>
                    <span className="text-[9px] font-mono text-emerald-400 font-bold">Open Canvas →</span>
                  </button>
                </div>
              )}

              {/* In-App CLI Runners */}
              <div className="border border-forge-dark rounded p-3 bg-forge-very-dark/60">
                <div className="flex items-center justify-between mb-2 border-b border-forge-dark pb-1">
                  <span className="text-[10px] font-bold text-forge-neon flex items-center gap-1">
                    <Terminal size={11} /> IN-APP CLI RUNNERS (FORGE)
                  </span>
                  <span className="text-[8px] border border-green-700 text-green-300 rounded px-1 font-bold">Runs inside Forge</span>
                </div>
                <div className="text-[9px] text-forge-dim mb-2.5">
                  Automated by Forge with live PTY terminal output, safety approval gates for destructive commands, and exportable audit trail logging.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const task = handoffModalTask;
                      setHandoffModalTask(null);
                      runTaskQuery(task, 'claude-code');
                    }}
                    className="border border-forge-dark hover:border-forge-neon bg-forge-dark/30 hover:bg-forge-dark/60 p-2.5 rounded text-left transition-colors flex flex-col gap-1 cursor-pointer"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-white">Claude Code</span>
                      <span className="text-[8px] text-forge-neon">Default</span>
                    </div>
                    <span className="text-[8px] text-forge-dim">Anthropic terminal coding agent CLI via your provider key.</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const task = handoffModalTask;
                      setHandoffModalTask(null);
                      runTaskQuery(task, 'codex-cli');
                    }}
                    className="border border-forge-dark hover:border-forge-neon bg-forge-dark/30 hover:bg-forge-dark/60 p-2.5 rounded text-left transition-colors flex flex-col gap-1 cursor-pointer"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-white">Codex CLI</span>
                      <span className="text-[8px] text-cyan-300">BYOK</span>
                    </div>
                    <span className="text-[8px] text-forge-dim">OpenAI / local model terminal coding agent CLI.</span>
                  </button>
                </div>
              </div>

              {/* External AI Editors & IDEs */}
              <div className="border border-forge-dark rounded p-3 bg-forge-very-dark/60">
                <div className="flex items-center justify-between mb-2 border-b border-forge-dark pb-1">
                  <span className="text-[10px] font-bold text-cyan-400 flex items-center gap-1">
                    <ExternalLink size={11} /> EXTERNAL AI EDITORS & IDES
                  </span>
                  <span className="text-[8px] border border-cyan-700 text-cyan-300 rounded px-1 font-bold">Opens externally</span>
                </div>
                <div className="text-[9px] text-forge-dim mb-2.5">
                  Generates a structured specification in <code className="text-white">.kryleos/handoff/{handoffModalTask.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.md</code> and opens your editor. Forge does NOT drive external agents.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'cursor', name: 'Cursor', desc: 'Opens workspace in Cursor editor' },
                    { id: 'antigravity', name: 'Antigravity', desc: 'Opens workspace in Antigravity' },
                    { id: 'vscode', name: 'VS Code', desc: 'Opens workspace in Visual Studio Code' },
                    { id: 'windsurf', name: 'Windsurf', desc: 'Opens workspace in Windsurf' },
                    { id: 'clipboard', name: 'Clipboard Only', desc: 'Copies specification bundle to clipboard' },
                  ].map(target => (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => handleExecuteHandoff(handoffModalTask, target.id)}
                      className="border border-forge-dark hover:border-cyan-400 bg-forge-dark/20 hover:bg-forge-dark/50 p-2 rounded text-left transition-colors flex flex-col gap-0.5"
                    >
                      <span className="text-[11px] font-bold text-white">{target.name}</span>
                      <span className="text-[8px] text-forge-dim">{target.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-forge-dark pt-3 mt-3">
              <button
                type="button"
                onClick={() => setHandoffModalTask(null)}
                className="forge-btn text-[10px] py-1 px-4 border-forge-dark text-forge-dim hover:text-white"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Linear-Style Task Detail Drawer */}
      <TaskDetailDrawer
        task={drawerTask}
        isOpen={Boolean(drawerTask)}
        onClose={() => setDrawerTask(null)}
        onSaveTask={handleSaveTaskDetail}
        allTasks={tasks}
        worktrees={worktrees}
        onMergeWorktree={handleMergeWorktree}
        onRevertWorktree={handleRevertWorktree}
        onRunInForge={(taskToRun, runner) => runTaskQuery(taskToRun, runner)}
        onOpenVibe={onOpenVibeTask}
        onPushHandoff={(taskToHandoff) => setHandoffModalTask(taskToHandoff)}
        onDeleteTask={(taskId) => {
          handleDeleteTask(taskId);
          setDrawerTask(null);
        }}
      />
    </div>
  );
};
