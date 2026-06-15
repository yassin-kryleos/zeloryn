import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Play, CheckCircle, Clock, Trash2, ArrowRight, ArrowLeft, FolderOpen, RefreshCw, ListChecks, Link2, X, Square } from 'lucide-react';
import type { AcceptanceCriterion, AcceptanceCriterionType, CriterionPhase, ProjectTask } from '../backend/db';
import { scoreTodayTasks } from '../shared/todayScore';
import { driftClass } from '../shared/driftClassification';
import { getAssigneeColor } from '../shared/assigneeColor';
import { wouldCreateDependencyCycle } from '../shared/dependencies';
import { resolveAgentForCategory, type InstalledAgent, type ItemCategory } from '../shared/agentCapabilities';
import { FileBrowser } from './FileBrowser';
import { SafeMarkdown } from './SafeMarkdown';

interface ProjectBoardProps {
  tasks: ProjectTask[];
  isStreaming: boolean;
  workspaceRoot: string;
  onSaveTasks: (updatedTasks: ProjectTask[]) => void;
  onSendQuery: (query: string, options?: { spaceOverride?: 'code' | 'chat' | 'cowork' | 'project'; planItemId?: string; workspace?: string }) => void;
  onUpdateWorkspaceRoot?: (newRoot: string) => void;
  onNotify?: (message: string, kind?: 'success' | 'error' | 'warning' | 'info') => void;
  onAbort?: () => void;
  installedAgents?: InstalledAgent[];
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
  installedAgents = []
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
  const [todayOpen, setTodayOpen] = useState(true);
  const [blockerTask, setBlockerTask] = useState<ProjectTask | null>(null);
  const [blockerDraft, setBlockerDraft] = useState<string[]>([]);

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
      description: 'Kryleos Forge workspace initialized successfully.',
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

  const runTaskQuery = (task: ProjectTask) => {
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
    onSendQuery(queryText, {
      spaceOverride: 'code',
      planItemId: task.id,
      workspace: task.workspace
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
        className={`bg-forge-very-dark bg-opacity-40 border p-2 rounded transition-colors group relative ${
          isBlocked ? 'border-red-900 opacity-65' : 'border-forge-dark hover:border-forge-dim'
        }`}
      >
        <div className={`text-xs break-words select-text font-bold mb-1 ${task.status === 'done' ? 'text-forge-dark line-through' : 'text-forge-text'}`}>
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
        </div>
        {isBlocked && (
          <div className="text-[8px] text-red-300 mb-1.5">
            Waiting on: {blockers.map(id => taskMap.get(id)?.title || id).join(', ')}
          </div>
        )}
        {routing.matchType === 'fallback' && task.status !== 'done' && (
          <div className="text-[8px] text-amber-300 mb-1.5" title="Install a matching specialist agent in CREW to route this category.">
            No {routing.category} specialist — using general agent.
          </div>
        )}
        <div className="flex items-center justify-between text-[9px]">
          <span className={getAssigneeColor(task.assignee)}>[{task.assignee}]</span>
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
              onClick={() => openBlockerEditor(task)}
              title="Edit dependencies (blockers)"
              className={`hover:text-white ${(task.blockedBy || []).length > 0 ? 'text-amber-300' : 'text-forge-dim'}`}
            >
              <Link2 size={8} />
            </button>
            {task.status !== 'done' && (
              <button
                onClick={() => runTaskQuery(task)}
                title={isBlocked ? 'Blocked by unfinished dependency' : 'Run Task Agent'}
                disabled={isBlocked || isStreaming}
                className="text-forge-neon hover:text-white disabled:text-forge-dark"
              >
                <Play size={8} />
              </button>
            )}
            <button onClick={() => handleDeleteTask(task.id)} title="Delete Task" className="text-red-400 hover:text-white">
              <Trash2 size={8} />
            </button>
            {task.status !== 'done' && (
              <button onClick={() => moveTask(task.id, 'forward')} title="Move forward" className="text-forge-neon hover:text-white">
                <ArrowRight size={8} />
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
        <div className="flex items-center justify-between gap-3 border-b border-forge-dark pb-1 mb-2">
          <div>
            <span className="forge-panel-title block">Flow board</span>
            <span className="forge-panel-subtitle">Prioritized work from plan to execution</span>
          </div>
          <div className="flex items-center gap-2 text-[9px]">
            <span className="text-forge-dim">
              {driftSummary.complete || 0} complete / {driftSummary.in_progress || 0} in progress / {driftSummary.blocked || 0} blocked
            </span>
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

        <div className="mb-2 forge-surface">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <button
              type="button"
              onClick={() => setTodayOpen(!todayOpen)}
              className="text-[11px] text-forge-text font-bold flex items-center gap-1.5 hover:text-white"
            >
              <Clock size={11} />
              <span>Today ({todayItems.length})</span>
              <span className="text-forge-dim">{todayOpen ? 'Hide' : 'Show'}</span>
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={executeNextToday}
                disabled={isStreaming || todayItems.every(item => item.blocked)}
                className="forge-btn text-[9px] px-2 py-0.5 flex items-center gap-1 disabled:opacity-40"
                title="Run the highest-priority unblocked task"
              >
                <Play size={8} />
                <span>Execute next</span>
              </button>
              <button
                type="button"
                onClick={executeAllToday}
                disabled={isStreaming || todayItems.every(item => item.blocked)}
                className="forge-secondary-button disabled:opacity-40"
                title="Dispatch all unblocked Today tasks as a sequential batch"
              >
                Execute all
              </button>
            </div>
          </div>
          {todayOpen && (
            <div className="border-t border-forge-dark px-2 py-1.5 space-y-1">
              {todayItems.length === 0 ? (
                <div className="text-[9px] text-forge-dim py-1">No open tasks. Add a task or move one out of DONE.</div>
              ) : (
                todayItems.map((item, idx) => (
                  <div key={item.task.id} className="flex items-center gap-2 text-[9px]">
                    <span className="text-forge-dim w-3 shrink-0">{idx + 1}.</span>
                    <SafeMarkdown text={item.task.title} className={`flex-1 truncate ${item.blocked ? 'text-forge-dim' : 'text-forge-text'}`} />
                    {item.blocked && <span className="text-[8px] uppercase border border-red-700 text-red-300 rounded px-1">blocked</span>}
                    <span className="text-[8px] uppercase border border-forge-neon border-opacity-40 text-forge-neon rounded px-1" title="Priority score">
                      {item.score}
                    </span>
                    <button
                      type="button"
                      onClick={() => runTaskQuery(item.task)}
                      disabled={item.blocked || isStreaming}
                      title={item.blocked ? 'Blocked by unfinished dependency' : 'Run this task'}
                      className="text-forge-neon hover:text-white disabled:text-forge-dark shrink-0"
                    >
                      <Play size={9} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {criteriaReviewPending > 0 && (
          <div className="mb-2 border border-amber-900 bg-amber-950/20 text-amber-200 rounded px-2 py-1.5 text-[9px] flex items-center justify-between gap-2">
            <span>
              {criteriaReviewPending} task(s) do not have reviewed acceptance criteria. Drift results are useful only after criteria are reviewed.
            </span>
          </div>
        )}

        <form onSubmit={handleAddTask} className="grid grid-cols-[1fr_110px_110px_auto] gap-2 mb-3 forge-surface p-2">
          <input
            type="text"
            placeholder="Add new task..."
            value={taskTitle}
            onChange={(e) => {
              setTaskTitle(e.target.value);
              setTaskCategory(inferCategory(e.target.value));
            }}
            className="forge-input text-xs text-forge-text px-2 py-1 placeholder:text-forge-dark font-mono rounded"
          />
          <select
            aria-label="Task assignee"
            value={taskAssignee}
            onChange={(e) => setTaskAssignee(e.target.value)}
            className="bg-forge-very-dark border border-forge-dark text-[10px] text-forge-neon px-0.5 rounded font-mono"
          >
            <option value="Planner">Planner</option>
            <option value="Builder">Builder</option>
            <option value="Analyst">Analyst</option>
            <option value="Reviewer">Reviewer</option>
          </select>
          <select
            aria-label="Task category"
            value={taskCategory}
            onChange={(e) => setTaskCategory(e.target.value)}
            className="bg-forge-very-dark border border-forge-dark text-xs text-forge-neon px-1 rounded font-mono"
          >
            {categories.map(category => <option key={category} value={category}>{category}</option>)}
          </select>
          <button type="submit" className="forge-btn text-[10px] flex items-center gap-1">
            <Plus size={10} />
            <span>Add task</span>
          </button>
        </form>

        <div className="flex-1 grid grid-cols-3 gap-2 overflow-hidden">
          {columns.map(column => (
            <div key={column.id} className="flex flex-col overflow-hidden forge-surface p-2">
              <span className="text-[11px] text-forge-dim font-bold mb-2 pb-1 border-b border-forge-dark flex items-center gap-1.5">
                {column.icon}
                <span>{column.label} ({column.tasks.length})</span>
              </span>
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                {column.tasks.map(renderTaskCard)}
              </div>
            </div>
          ))}
        </div>
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
    </div>
  );
};
