import React, { useState } from 'react';
import { Plus, Clock, Trash2, ArrowRight, ArrowLeft, Terminal, ClipboardList, Code, FolderOpen, UserPlus, ShieldAlert, X, GitBranch, Download, ExternalLink } from 'lucide-react';
import type { AgentLog, AgentRole } from '../backend/agents';
import type { ProjectTask } from '../backend/db';
import { FileBrowser } from './FileBrowser';
import { ChatConsole } from './ChatConsole';
import { AgentDashboard } from './AgentDashboard';
import { CodebaseGraph } from './CodebaseGraph';
import { FeatureBadge } from './FeatureBadge';
import { parseCrewItems, type RefinedPlanItem } from '../shared/crewParser';
import { agentFileName } from '../shared/crewPersonas';
import { getAssigneeColor } from '../shared/assigneeColor';

interface CustomAgent {
  name: string;
  role: string;
  prompt: string;
  primaryCategory?: string;
  capabilities?: string[];
}

const starterAgents: Array<CustomAgent & { description: string; persona?: boolean }> = [
  {
    name: 'React Expert',
    role: 'react_expert',
    description: 'Frontend component review, refactoring, hooks, and state patterns.',
    primaryCategory: 'frontend',
    capabilities: ['frontend'],
    prompt: 'You are a React Expert. Review and implement React components with strong state management, accessibility, clean hooks, and maintainable UI structure.'
  },
  {
    name: 'Security Auditor',
    role: 'security_auditor',
    description: 'Security and dependency risk review.',
    primaryCategory: 'security',
    capabilities: ['security', 'backend'],
    prompt: 'You are a Security Auditor. Review code for unsafe file access, injection risk, secret leakage, dependency risk, auth flaws, and command execution hazards.'
  },
  {
    name: 'Test Writer',
    role: 'test_writer',
    description: 'Unit and integration test generation.',
    primaryCategory: 'testing',
    capabilities: ['testing', 'frontend', 'backend'],
    prompt: 'You are a Test Writer. Add focused unit, integration, and regression tests that verify behavior without brittle implementation coupling.'
  },
  {
    name: 'Documentation Writer',
    role: 'documentation_writer',
    description: 'README, API, inline docs, and release notes.',
    primaryCategory: 'docs',
    capabilities: ['docs'],
    prompt: 'You are a Documentation Writer. Produce clear project docs, API notes, user guides, changelogs, and implementation summaries.'
  },
  {
    name: 'Performance Reviewer',
    role: 'performance_reviewer',
    description: 'Bundle size, query, rendering, and runtime performance analysis.',
    capabilities: ['frontend', 'backend', 'infra'],
    prompt: 'You are a Performance Reviewer. Identify slow paths, unnecessary renders, inefficient queries, large bundles, and runtime bottlenecks.'
  },
  {
    name: 'Python Backend Specialist',
    role: 'python_backend_specialist',
    description: 'Python APIs, data pipelines, Django, and FastAPI patterns.',
    primaryCategory: 'backend',
    capabilities: ['backend'],
    prompt: 'You are a Python Backend Specialist. Build and review Python services, FastAPI/Django apps, data pipelines, tests, and operational scripts.'
  },
  {
    name: 'DevOps Specialist',
    role: 'devops_specialist',
    description: 'Docker, CI/CD, GitHub Actions, and deployment scripts.',
    primaryCategory: 'infra',
    capabilities: ['infra'],
    prompt: 'You are a DevOps Specialist. Review and implement Docker, CI/CD, GitHub Actions, deployment scripts, environment setup, and infrastructure automation.'
  },
  {
    name: 'Technical Reviewer',
    role: 'technical_reviewer',
    description: 'CREW persona for feasibility, architecture, and implementation risk.',
    persona: true,
    prompt: 'You are the Technical Reviewer persona. Review plans for technical feasibility, architecture consistency, implementation order, and hidden engineering risk.'
  },
  {
    name: 'Scope Guard',
    role: 'scope_guard',
    description: 'CREW persona for scope creep and ambiguous requirements.',
    persona: true,
    prompt: 'You are the Scope Guard persona. Identify scope creep, vague requirements, over-specified work, and items that should be split before execution.'
  },
  {
    name: 'Risk Identifier',
    role: 'risk_identifier',
    description: 'CREW persona for security, dependency, and operational risks.',
    persona: true,
    prompt: 'You are the Risk Identifier persona. Flag security, dependency, operational, compliance, and delivery risks before execution begins.'
  }
];

interface CoworkSpaceProps {
  logs: AgentLog[];
  tasks: ProjectTask[];
  customAgents?: CustomAgent[];
  localSkills?: Array<{ name: string; type: 'script' | 'markdown'; content: string }>;
  localAgents?: Array<{ name: string; role: string; prompt: string }>;
  isStreaming: boolean;
  streamingReasoning?: string;
  streamingContent?: string;
  activeAgent: AgentRole | 'system';
  workspaceRoot: string;
  onSaveTasks: (updatedTasks: ProjectTask[]) => void;
  onSaveAgents?: (updatedAgents: CustomAgent[]) => void;
  onSendQuery: (query: string) => void;
  onUpdateWorkspaceRoot?: (newRoot: string) => void;
  commandPendingApproval?: { tool: string; command: string } | null;
  onApproveCommand?: (approved: boolean) => void;
  onNotify?: (message: string, kind?: 'success' | 'error' | 'warning' | 'info') => void;
  onAbort?: () => void;
  onCreateProject?: (name: string, folderPath: string, gitUrl: string, description: string) => void;
}

export const CoworkSpace: React.FC<CoworkSpaceProps> = ({
  logs,
  tasks,
  customAgents = [],
  localSkills = [],
  localAgents = [],
  isStreaming,
  streamingReasoning = '',
  streamingContent = '',
  activeAgent,
  workspaceRoot,
  onSaveTasks,
  onSaveAgents,
  onSendQuery,
  onUpdateWorkspaceRoot,
  commandPendingApproval = null,
  onApproveCommand,
  onNotify,
  onAbort,
  onCreateProject
}) => {
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('Keymaker');

  // GitHub clone-to-project state
  const [showGitClone, setShowGitClone] = useState(false);
  const [gitCloneUrl, setGitCloneUrl] = useState('');
  const [gitCloneName, setGitCloneName] = useState('');
  const [gitCloneFolder, setGitCloneFolder] = useState('');
  const [isCloning, setIsCloning] = useState(false);
  const [fileBrowserOpen, setFileBrowserOpen] = useState(true);
  const [activeRightPanel, setActiveRightPanel] = useState<'project' | 'code' | 'factory'>('project');
  const [codeTab, setCodeTab] = useState<'explorer' | 'visualizer'>('explorer');

  // Push to Flow state
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [diffNewTasks, setDiffNewTasks] = useState<RefinedPlanItem[]>([]);
  const [diffUpdatedTasks, setDiffUpdatedTasks] = useState<Array<{ existingTask: ProjectTask; refinedItem: RefinedPlanItem }>>([]);

  const cleanTitle = (title: string): string => {
    return title.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const handlePushToFlow = (logMessage: string) => {
    const parsed = parseCrewItems(logMessage);
    if (parsed.length === 0) {
      onNotify?.('No valid [ITEM] plan reviews found in this log.', 'warning');
      return;
    }

    const news: RefinedPlanItem[] = [];
    const updates: Array<{ existingTask: ProjectTask; refinedItem: RefinedPlanItem }> = [];

    parsed.forEach(item => {
      const match = tasks.find(t => cleanTitle(t.title) === cleanTitle(item.title));
      if (match) {
        updates.push({ existingTask: match, refinedItem: item });
      } else {
        news.push(item);
      }
    });

    setDiffNewTasks(news);
    setDiffUpdatedTasks(updates);
    setIsDiffModalOpen(true);
  };

  const handleConfirmPushToFlow = () => {
    const now = new Date().toISOString();
    
    // Create new tasks
    const newProjectTasks: ProjectTask[] = diffNewTasks.map(item => {
      const criteria = item.criteriaHint ? [{
        id: `crit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'llm_check' as const,
        description: item.criteriaHint,
        target: 'llm',
        phase: 'phase1' as const,
        status: 'unknown' as const
      }] : [];

      return {
        id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        title: item.title,
        status: 'todo' as const,
        assignee: 'Developer',
        category: item.category || 'general',
        source: 'plan_workspace',
        lastModified: now,
        acceptanceCriteria: criteria
      };
    });

    // Update existing tasks
    const updatedProjectTasks = tasks.map(t => {
      const match = diffUpdatedTasks.find(u => u.existingTask.id === t.id);
      if (match) {
        const item = match.refinedItem;
        const newCriteria = [...(t.acceptanceCriteria || [])];
        if (item.criteriaHint && !newCriteria.some(c => c.description === item.criteriaHint)) {
          newCriteria.push({
            id: `crit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            type: 'llm_check' as const,
            description: item.criteriaHint,
            target: 'llm',
            phase: 'phase1' as const,
            status: 'unknown' as const
          });
        }
        return {
          ...t,
          category: item.category || t.category,
          acceptanceCriteria: newCriteria,
          lastModified: now
        };
      }
      return t;
    });

    onSaveTasks([...updatedProjectTasks, ...newProjectTasks]);
    onNotify?.(`Applied to FLOW: added ${newProjectTasks.length} and updated ${diffUpdatedTasks.length} task(s).`, 'success');
    setIsDiffModalOpen(false);
  };

  // Agent/Skill tabs
  const [factoryTab, setFactoryTab] = useState<'agents' | 'skills'>('agents');
  
  // Agent Factory Inputs
  const [agentName, setAgentName] = useState('');
  const [agentRole, setAgentRole] = useState('');
  const [agentPrompt, setAgentPrompt] = useState('');

  // Skills Factory Inputs
  const [skillName, setSkillName] = useState('');
  const [skillType, setSkillType] = useState<'script' | 'markdown'>('script');
  const [skillContent, setSkillContent] = useState('');
  const [pendingSkillDelete, setPendingSkillDelete] = useState<{ name: string; type: 'script' | 'markdown' } | null>(null);

  // Custom message prepended to query input
  const [customPrompt, setCustomPrompt] = useState<string>('');

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    const newTask: ProjectTask = {
      id: `task_${Date.now()}`,
      title: taskTitle.trim(),
      status: 'todo',
      assignee: taskAssignee,
      lastModified: new Date().toISOString()
    };

    onSaveTasks([...tasks, newTask]);
    setTaskTitle('');
  };

  const moveTask = (taskId: string, direction: 'forward' | 'backward') => {
    const updated = tasks.map(t => {
      if (t.id === taskId) {
        let nextStatus: 'todo' | 'in_progress' | 'done' = t.status;
        if (direction === 'forward') {
          if (t.status === 'todo') nextStatus = 'in_progress';
          else if (t.status === 'in_progress') nextStatus = 'done';
        } else {
          if (t.status === 'done') nextStatus = 'in_progress';
          else if (t.status === 'in_progress') nextStatus = 'todo';
        }
        return { ...t, status: nextStatus, lastModified: new Date().toISOString() };
      }
      return t;
    });
    onSaveTasks(updated);
  };

  const handleDeleteTask = (taskId: string) => {
    onSaveTasks(tasks.filter(t => t.id !== taskId));
  };

  const handleCreateAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentName.trim() || !agentRole.trim() || !agentPrompt.trim()) return;

    const newAgent: CustomAgent = {
      name: agentName.trim(),
      role: agentRole.trim(),
      prompt: agentPrompt.trim()
    };

    onSaveAgents?.([...customAgents, newAgent]);
    setAgentName('');
    setAgentRole('');
    setAgentPrompt('');
  };

  const handleDeleteAgent = (role: string) => {
    onSaveAgents?.(customAgents.filter(a => a.role !== role));
  };

  const handleInstallStarterAgent = async (agent: CustomAgent) => {
    const filePath = `.kryleos/agents/${agentFileName(agent.role)}.json`;
    try {
      const res = await fetch('http://localhost:3001/api/files/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: filePath,
          isDirectory: false,
          content: JSON.stringify({ name: agent.name, role: agent.role, prompt: agent.prompt }, null, 2)
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'install failed');
      }
      const exists = customAgents.some(existing => existing.role === agent.role);
      if (!exists) {
        onSaveAgents?.([...customAgents, { name: agent.name, role: agent.role, prompt: agent.prompt }]);
      }
      onNotify?.(`${agent.name} installed into .kryleos/agents.`, 'success');
    } catch (err: any) {
      onNotify?.(`Failed to install ${agent.name}: ${err.message}`, 'error');
    }
  };

  const handleShareAgent = async (agent: CustomAgent) => {
    const filePath = `.kryleos/agents/${agentFileName(agent.role)}.json`;
    try {
      await fetch('http://localhost:3001/api/files/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: filePath,
          isDirectory: false,
          content: JSON.stringify(agent, null, 2)
        })
      });
      const res = await fetch('http://localhost:3001/api/artifacts/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'publish failed');
      onNotify?.(`Agent shared as Gist: ${data.url}`, 'success');
    } catch (err: any) {
      onNotify?.(`Failed to share ${agent.name}: ${err.message}`, 'error');
    }
  };

  const handleExportAgents = () => {
    if (customAgents.length === 0) {
      onNotify?.('No custom specialists to export.', 'warning');
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(customAgents, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `matrix_specialists_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportAgents = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          const valid = imported.every(item => typeof item.name === 'string' && typeof item.role === 'string' && typeof item.prompt === 'string');
          if (valid) {
            const existingRoles = new Set(customAgents.map(a => a.role));
            const filteredImported = imported.filter(a => !existingRoles.has(a.role));
            onSaveAgents?.([...customAgents, ...filteredImported]);
            onNotify?.(`Successfully imported ${filteredImported.length} new specialists.`, 'success');
          } else {
            onNotify?.("Invalid format. Agent cards must contain 'name', 'role', and 'prompt' strings.", 'error');
          }
        } else {
          onNotify?.('Invalid file structure. Expected a JSON array of specialists.', 'error');
        }
      } catch (err: any) {
        onNotify?.(`Failed to parse file: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCreateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName.trim() || !skillContent.trim()) return;

    const extension = skillType === 'script' ? '.js' : '.md';
    const filePath = `.matrix/skills/${skillName.trim()}${extension}`;

    try {
      const res = await fetch('http://localhost:3001/api/files/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: filePath,
          isDirectory: false,
          content: skillContent
        })
      });
      if (res.ok) {
        setSkillName('');
        setSkillContent('');
        onNotify?.('Skill created successfully in workspace. Reloading skills.', 'success');
        onSendQuery('scan workspace skills');
      } else {
        const data = await res.json();
        onNotify?.(`Failed to create skill: ${data.error}`, 'error');
      }
    } catch (err: any) {
      onNotify?.(`Error creating skill: ${err.message}`, 'error');
    }
  };

  const handleDeleteSkill = async (name: string, type: 'script' | 'markdown') => {
    if (!window.confirm(`Are you sure you want to delete the skill "${name}"? This action cannot be undone.`)) {
      return;
    }
    const extension = type === 'script' ? '.js' : '.md';
    const filePath = `.matrix/skills/${name}${extension}`;

    try {
      const res = await fetch(`http://localhost:3001/api/files?path=${encodeURIComponent(filePath)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setPendingSkillDelete(null);
        onNotify?.('Workspace skill deleted successfully.', 'success');
        onSendQuery('scan workspace skills');
      } else {
        const data = await res.json();
        onNotify?.(`Failed to delete skill: ${data.error}`, 'error');
      }
    } catch (err: any) {
      onNotify?.(`Error deleting skill: ${err.message}`, 'error');
    }
  };

  const handleReferenceTask = (task: ProjectTask) => {
    setCustomPrompt(`Focus on executing task: "${task.title}" (assigned to ${task.assignee}). Please review the workspace first.`);
  };

  const handleReferenceFile = (action: 'analyze' | 'debug', filePath: string) => {
    setCustomPrompt(`${action === 'analyze' ? 'Analyze' : 'Debug'} the code file: @${filePath} and report any compile or logic issues.`);
  };


  const handleOpenGraphFile = (filePath: string) => {
    setCustomPrompt(`Read and preview the file: @${filePath}`);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden gap-3 font-mono p-2 select-none">
      
      {/* Left Area: Chat Terminal Console */}
      <div className="flex-1 flex flex-col overflow-hidden forge-surface p-3 min-w-[320px]">
        <div className="flex items-center justify-between mb-1.5 border-b border-forge-dark pb-1">
          <AgentDashboard activeAgent={activeAgent as any} isStreaming={isStreaming} />
        </div>

        <div className="flex-1 overflow-hidden">
          <ChatConsole
            logs={logs}
            isStreaming={isStreaming}
            streamingReasoning={streamingReasoning}
            streamingContent={streamingContent}
            activeAgent={activeAgent}
            onSendQuery={onSendQuery}
            customPrompt={customPrompt}
            onClearCustomPrompt={() => setCustomPrompt('')}
            commandPendingApproval={commandPendingApproval}
            onApproveCommand={onApproveCommand}
            onPushToFlow={handlePushToFlow}
            onAbort={onAbort}
          />
        </div>
      </div>

      {/* Right Area: Workspace Panels Deck */}
      <div className="w-full lg:w-[380px] h-[350px] lg:h-auto flex flex-col forge-surface overflow-hidden shrink-0">
        {/* Toggle Panel Tabs */}
        <div className="forge-tabs m-2 text-[10px] font-bold">
          <button
            onClick={() => setActiveRightPanel('project')}
            className={`forge-tab flex-1 text-center cursor-pointer ${activeRightPanel === 'project' ? 'forge-tab-active' : ''}`}
            type="button"
          >
            Project
          </button>
          <button
            onClick={() => setActiveRightPanel('code')}
            className={`forge-tab flex-1 text-center cursor-pointer ${activeRightPanel === 'code' ? 'forge-tab-active' : ''}`}
            type="button"
          >
            Codebase
          </button>
          <button
            onClick={() => setActiveRightPanel('factory')}
            className={`forge-tab flex-1 text-center cursor-pointer ${activeRightPanel === 'factory' ? 'forge-tab-active' : ''}`}
            type="button"
          >
            Factory
          </button>
        </div>

        {/* Dynamic Panels */}
        {activeRightPanel === 'project' && (
          <div className="flex-1 p-3 overflow-hidden flex flex-col gap-2">
            <span className="forge-panel-title mb-1 block">
              Project pipeline
            </span>

            {/* Task Adder */}
            <form onSubmit={handleAddTask} className="flex gap-1.5 bg-forge-very-dark p-1.5 rounded border border-forge-dark mb-1">
              <input
                type="text"
                placeholder="Assign new directive..."
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className="flex-1 bg-transparent border border-forge-dark outline-none text-[10px] text-forge-neon px-1.5 py-0.5 placeholder:text-forge-dark rounded"
                required
              />
              <select
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
                className="bg-black border border-forge-dark text-[10px] text-forge-neon px-0.5 rounded font-mono"
              >
                <option value="Coordinator">Coordinator</option>
                <option value="Developer">Developer</option>
                <option value="Researcher">Researcher</option>
                <option value="Debugger">Debugger</option>
              </select>
              <button
                type="submit"
                className="forge-btn text-[9px] px-2"
              >
                [+]
              </button>
            </form>

            {/* Pipelines lanes list */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-[10px]">
              {tasks.length === 0 ? (
                <div className="text-forge-dim italic text-center py-6">No tasks defined in this workspace.</div>
              ) : (
                tasks.map(t => (
                  <div key={t.id} className="bg-black bg-opacity-40 border border-forge-dark p-2 rounded hover:border-forge-dim transition-colors group relative flex flex-col gap-1">
                    <div className="flex items-start justify-between">
                      <span className="text-forge-text select-text break-words pr-2 font-bold">{t.title}</span>
                      <span className={`text-[8px] font-bold uppercase shrink-0 ${t.status === 'done' ? 'text-forge-neon' : t.status === 'in_progress' ? 'neon-amber animate-pulse' : 'text-forge-dim'}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[9px] mt-1 pt-1 border-t border-forge-very-dark border-dashed">
                      <span className={getAssigneeColor(t.assignee)}>[{t.assignee}]</span>
                      <div className="flex items-center gap-1 opacity-75 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => moveTask(t.id, 'backward')}
                          disabled={t.status === 'todo'}
                          className="text-forge-dim hover:text-white disabled:opacity-30 p-0.5"
                          title="Move task backward"
                          aria-label="Move task backward"
                        >
                          <ArrowLeft size={9} />
                        </button>
                        <button
                          onClick={() => handleReferenceTask(t)}
                          className="px-1 py-0.2 rounded border border-forge-dark hover:border-forge-neon text-forge-neon hover:text-white text-[8px] font-mono cursor-pointer"
                          title="Add task context into chat"
                          aria-label="Add task context into chat"
                        >
                          + Chat
                        </button>
                        <button
                          onClick={() => handleDeleteTask(t.id)}
                          className="text-red-400 hover:text-white p-0.5"
                          title="Delete task"
                          aria-label="Delete task"
                        >
                          <Trash2 size={9} />
                        </button>
                        <button
                          onClick={() => moveTask(t.id, 'forward')}
                          disabled={t.status === 'done'}
                          className="text-forge-neon hover:text-white disabled:opacity-30 p-0.5"
                          title="Move task forward"
                          aria-label="Move task forward"
                        >
                          <ArrowRight size={9} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeRightPanel === 'code' && (
          <div className="flex-1 p-3 overflow-hidden flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-forge-neon font-bold uppercase tracking-wider">
                Workspace File Integrations
              </span>
              {onCreateProject && (
                <button
                  type="button"
                  onClick={() => setShowGitClone(!showGitClone)}
                  className={`text-[8px] font-bold px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer border transition-colors ${
                    showGitClone
                      ? 'border-forge-neon text-forge-neon bg-forge-very-dark'
                      : 'border-forge-dark text-forge-dim hover:text-forge-neon hover:border-forge-neon'
                  }`}
                >
                  <GitBranch size={10} />
                  <span>{showGitClone ? 'HIDE' : 'LOAD FROM GITHUB'}</span>
                </button>
              )}
            </div>

            {/* GitHub Clone-to-Project inline form */}
            {showGitClone && onCreateProject && (
              <div className="border border-cyan-800/50 bg-cyan-950/10 rounded p-2.5 flex flex-col gap-2 text-[10px] font-mono">
                <div className="flex items-center gap-1.5 text-cyan-300 font-bold uppercase text-[9px]">
                  <Download size={11} />
                  <span>Clone GitHub Repository as Project</span>
                </div>
                <input
                  type="text"
                  value={gitCloneUrl}
                  onChange={(e) => setGitCloneUrl(e.target.value)}
                  placeholder="https://github.com/username/repo"
                  className="forge-input text-[10px] bg-forge-very-dark border-forge-dark text-forge-neon px-2 py-1"
                />
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={gitCloneName}
                    onChange={(e) => setGitCloneName(e.target.value)}
                    placeholder="Project name"
                    className="forge-input text-[10px] bg-forge-very-dark border-forge-dark text-forge-text px-2 py-1 flex-1"
                  />
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={gitCloneFolder}
                      onChange={(e) => setGitCloneFolder(e.target.value)}
                      placeholder="Clone folder path"
                      className="forge-input text-[10px] bg-forge-very-dark border-forge-dark text-forge-text px-2 py-1 flex-1"
                    />
                    {(window as any).electronAPI && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const sel = await (window as any).electronAPI.selectDirectory();
                            if (sel) setGitCloneFolder(sel);
                          } catch { /* ignore */ }
                        }}
                        className="text-[8px] border border-forge-dark text-forge-dim hover:text-forge-neon px-1.5 py-0.5 rounded cursor-pointer shrink-0"
                        title="Browse folder"
                      >
                        <FolderOpen size={10} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowGitClone(false); setGitCloneUrl(''); setGitCloneName(''); setGitCloneFolder(''); }}
                    className="text-[9px] text-forge-dim hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isCloning || !gitCloneUrl.trim() || !gitCloneName.trim() || !gitCloneFolder.trim()}
                    onClick={async () => {
                      setIsCloning(true);
                      try {
                        await onCreateProject(gitCloneName.trim(), gitCloneFolder.trim(), gitCloneUrl.trim(), `Cloned from ${gitCloneUrl.trim()}`);
                        onNotify?.(`Project "${gitCloneName}" cloned successfully.`, 'success');
                        setShowGitClone(false);
                        setGitCloneUrl('');
                        setGitCloneName('');
                        setGitCloneFolder('');
                      } catch (err: any) {
                        onNotify?.(`Clone failed: ${err.message}`, 'error');
                      } finally {
                        setIsCloning(false);
                      }
                    }}
                    className="forge-btn text-[9px] px-3 py-1 font-bold flex items-center gap-1 disabled:opacity-50"
                  >
                    <GitBranch size={10} />
                    <span>{isCloning ? 'CLONING...' : 'CLONE & CREATE PROJECT'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Sub-tabs: EXPLORER | VISUALIZER */}
            <div className="flex border-b border-forge-dark pb-1.5 mb-1 gap-2 text-[9px] font-bold">
              <button
                onClick={() => setCodeTab('explorer')}
                className={`py-0.5 px-2 border rounded cursor-pointer ${codeTab === 'explorer' ? 'bg-forge-very-dark border-forge-neon text-forge-neon' : 'bg-transparent border-forge-dark text-forge-dim'}`}
                type="button"
              >
                EXPLORER
              </button>
              <button
                onClick={() => setCodeTab('visualizer')}
                className={`py-0.5 px-2 border rounded cursor-pointer ${codeTab === 'visualizer' ? 'bg-forge-very-dark border-forge-neon text-forge-neon' : 'bg-transparent border-forge-dark text-forge-dim'}`}
                type="button"
              >
                VISUALIZER
              </button>
            </div>

            {codeTab === 'explorer' ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Quick Actions */}
                <div className="flex gap-1.5 mb-2 pb-2 border-b border-forge-very-dark">
                  <span className="text-[9px] text-forge-dim uppercase shrink-0 self-center">Action draft:</span>
                  <button 
                    onClick={() => handleReferenceFile('analyze', 'src/App.tsx')}
                    className="text-[8px] border border-forge-dark text-forge-neon hover:text-forge-text px-1 py-0.5 rounded"
                  >
                    Analyze App.tsx
                  </button>
                  <button 
                    onClick={() => handleReferenceFile('debug', 'src/components/CoworkSpace.tsx')}
                    className="text-[8px] border border-forge-dark text-forge-neon hover:text-forge-text px-1 py-0.5 rounded"
                  >
                    Debug Cowork.tsx
                  </button>
                </div>

                {/* Live directory navigator browser */}
                <div className="flex-1 overflow-hidden flex flex-col border border-forge-dark rounded">
                  <FileBrowser workspaceRoot={workspaceRoot} onUpdateWorkspaceRoot={onUpdateWorkspaceRoot} onNotify={onNotify} />
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-hidden border border-forge-dark rounded">
                <CodebaseGraph
                  onOpenFilePreview={handleOpenGraphFile}
                  onPinFile={(fn) => setCustomPrompt(`@${fn} `)}
                />
              </div>
            )}
          </div>
        )}

        {activeRightPanel === 'factory' && (
          <div className="flex-1 p-3 overflow-hidden flex flex-col gap-2">
            {/* Factory Subtabs */}
            <div className="flex border-b border-forge-dark pb-1.5 gap-2 text-[9px] font-bold">
              <button
                onClick={() => setFactoryTab('agents')}
                className={`py-0.5 px-2 border rounded cursor-pointer ${factoryTab === 'agents' ? 'bg-forge-very-dark border-forge-neon text-forge-neon' : 'bg-transparent border-forge-dark text-forge-dim'}`}
                type="button"
              >
                SPECIALISTS
              </button>
              <button
                onClick={() => setFactoryTab('skills')}
                className={`py-0.5 px-2 border rounded cursor-pointer ${factoryTab === 'skills' ? 'bg-forge-very-dark border-forge-neon text-forge-neon' : 'bg-transparent border-forge-dark text-forge-dim'}`}
                type="button"
              >
                WORKSPACE SKILLS
              </button>
            </div>

            {factoryTab === 'agents' ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-1.5 border-b border-forge-dark pb-1">
                  <span className="text-[10px] text-forge-neon font-bold uppercase tracking-wider">
                    Agent Factory (Crew)
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleExportAgents}
                      className="text-[8px] border border-forge-dark px-1 py-0.5 rounded text-forge-dim hover:text-forge-neon cursor-pointer"
                      title="Export Specialists as JSON file"
                      type="button"
                    >
                      EXP
                    </button>
                    <label
                      className="text-[8px] border border-forge-dark px-1 py-0.5 rounded text-forge-dim hover:text-forge-neon cursor-pointer"
                      title="Import Specialists from JSON file"
                    >
                      IMP
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportAgents}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* Failsafe Note */}
                <div className="bg-forge-very-dark border border-red-500 p-1.5 rounded mb-2 text-[9px] text-forge-red flex items-start gap-1">
                  <ShieldAlert size={10} className="shrink-0 mt-0.5" />
                  <span>Anti-Hallucination compilation check is ACTIVE. Dynamic agents can only spawn 1-level deep.</span>
                </div>

                {/* Bundled starter packs */}
                <div className="border border-forge-dark bg-black bg-opacity-35 p-2 rounded mb-2 text-[10px]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] uppercase font-bold text-forge-neon tracking-wider flex items-center gap-1.5">
                      <UserPlus size={10} />
                      Community Agent Starter Packs
                    </span>
                    <FeatureBadge status="production" label="Bundled" compact />
                  </div>
                  <div className="max-h-[145px] overflow-y-auto space-y-1 pr-1">
                    {starterAgents.map(agent => {
                      const installed = customAgents.some(existing => existing.role === agent.role) || localAgents.some(existing => existing.role === agent.role);
                      return (
                        <div key={agent.role} className="border border-forge-dark rounded p-1.5 bg-forge-very-dark bg-opacity-45">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[9px] font-bold text-white truncate">
                                {agent.name} {agent.persona ? <span className="text-forge-dim">(CREW persona)</span> : null}
                              </div>
                              <div className="text-[8px] text-forge-dim leading-tight">{agent.description}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleInstallStarterAgent(agent)}
                              disabled={installed}
                              className="forge-btn text-[8px] px-1.5 py-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {installed ? 'INSTALLED' : 'INSTALL'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Team Collaboration Panel */}
                <div className="border border-forge-dark bg-black bg-opacity-35 p-2 rounded mb-2 text-[10px]">
                  <span className="text-[9px] uppercase font-bold text-forge-neon tracking-wider block mb-1">
                    <span className="inline-flex items-center gap-1.5">
                      Team Workspace Collaboration
                      <FeatureBadge id="collaboration" compact />
                      <FeatureBadge id="rbac" compact />
                    </span>
                  </span>
                    <div className="space-y-1 text-[9px] font-mono">
                      <div className="flex items-center gap-1.5 text-forge-neon">
                        <span className="h-1.5 w-1.5 rounded-full bg-forge-neon" />
                        <span>Direct workspace collaboration active (Local RBAC: OWNER)</span>
                      </div>
                      <div className="text-forge-dim italic mt-1 text-[8px] flex justify-between">
                        <span>Status: Ready</span>
                        <span>Audit Log: Local</span>
                      </div>
                    </div>
                </div>

                {/* Agent Creator Form */}
                <form onSubmit={handleCreateAgent} className="flex flex-col gap-1.5 bg-forge-very-dark p-2 rounded border border-forge-dark mb-2.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      placeholder="Specialist name..."
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      className="bg-black border border-forge-dark outline-none text-[10px] text-forge-neon px-1.5 py-1 rounded"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Specialist role..."
                      value={agentRole}
                      onChange={(e) => setAgentRole(e.target.value)}
                      className="bg-black border border-forge-dark outline-none text-[10px] text-forge-neon px-1.5 py-1 rounded"
                      required
                    />
                  </div>
                  <textarea
                    placeholder="Provide specialist instructions prompt..."
                    value={agentPrompt}
                    onChange={(e) => setAgentPrompt(e.target.value)}
                    className="bg-black border border-forge-dark outline-none text-[9px] text-forge-neon px-1.5 py-1 rounded h-[50px] resize-none"
                    required
                  />
                  <button
                    type="submit"
                    className="forge-btn text-[9px] py-1 font-bold"
                  >
                    [+] CREATE CREW SPECIALIST
                  </button>
                </form>

                {/* Custom Saved Agents List */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-[10px]">
                  {customAgents.length === 0 ? (
                    <div className="text-forge-dim italic text-center py-4">No custom specialists in this session. Create one above!</div>
                  ) : (
                    customAgents.map(a => (
                      <div key={a.role} className="bg-black bg-opacity-65 border border-forge-dark p-2 rounded relative flex flex-col gap-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-forge-neon font-bold">
                            {a.name} ({a.role})
                          </span>
                          <button
                            onClick={() => handleDeleteAgent(a.role)}
                            className="text-red-400 hover:text-red-300"
                            title="Delete custom agent"
                            aria-label={`Delete custom agent ${a.name}`}
                          >
                            <Trash2 size={10} />
                          </button>
                          <button
                            onClick={() => handleShareAgent(a)}
                            className="text-forge-dim hover:text-forge-neon text-[8px] border border-forge-dark px-1 rounded"
                            title="Share agent as GitHub Gist"
                            type="button"
                          >
                            SHARE
                          </button>
                        </div>
                        <p className="text-[9px] text-forge-dim line-clamp-2 leading-tight">
                          {a.prompt}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                <span className="text-[10px] text-forge-neon font-bold uppercase tracking-wider mb-1.5 block">
                  Workspace Skills Builder
                </span>

                {/* Skills Creator Form */}
                <form onSubmit={handleCreateSkill} className="flex flex-col gap-1.5 bg-forge-very-dark p-2 rounded border border-forge-dark mb-2.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      placeholder="Skill name (e.g. read_db)..."
                      value={skillName}
                      onChange={(e) => setSkillName(e.target.value)}
                      className="bg-black border border-forge-dark outline-none text-[10px] text-forge-neon px-1.5 py-1 rounded"
                      required
                    />
                    <select
                      value={skillType}
                      onChange={(e) => setSkillType(e.target.value as any)}
                      className="bg-black border border-forge-dark text-[10px] text-forge-neon px-1.5 rounded font-mono"
                    >
                      <option value="script">Executable (.js)</option>
                      <option value="markdown">Markdown Instruction (.md)</option>
                    </select>
                  </div>
                  <textarea
                    placeholder={skillType === 'script' ? "Write executable JS code..." : "Provide custom Markdown instruction rules..."}
                    value={skillContent}
                    onChange={(e) => setSkillContent(e.target.value)}
                    className="bg-black border border-forge-dark outline-none text-[9px] text-forge-neon px-1.5 py-1 rounded h-[55px] resize-none font-mono"
                    required
                  />
                  <button
                    type="submit"
                    className="forge-btn text-[9px] py-1 font-bold"
                  >
                    [+] CREATE WORKSPACE SKILL
                  </button>
                </form>

                {/* Local Workspace Skills List */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-[10px]">
                  {localSkills.length === 0 ? (
                    <div className="text-forge-dim italic text-center py-4">No workspace skills loaded. Create or import one!</div>
                  ) : (
                    localSkills.map(s => (
                      <div key={s.name} className="bg-black bg-opacity-65 border border-forge-dark p-2 rounded relative flex flex-col gap-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-forge-neon font-bold flex items-center gap-1.5">
                            {s.name}
                            <span className={`text-[8px] px-1 border rounded ${s.type === 'script' ? 'text-cyan-400 border-cyan-800' : 'text-purple-400 border-purple-800'}`}>
                              {s.type}
                            </span>
                          </span>
                          <button
                            onClick={() => setPendingSkillDelete({ name: s.name, type: s.type })}
                            className="text-red-400 hover:text-white"
                            title="Delete workspace skill"
                            aria-label={`Delete workspace skill ${s.name}`}
                            type="button"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                        {pendingSkillDelete?.name === s.name && pendingSkillDelete.type === s.type && (
                          <div className="mt-1 border border-red-500 bg-forge-very-dark p-1.5 rounded text-[9px] text-red-200">
                            <div className="mb-1">Delete workspace skill `{s.name}`?</div>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => handleDeleteSkill(s.name, s.type)}
                                className="border border-red-500 px-1.5 py-0.5 rounded text-red-200 hover:text-white"
                                type="button"
                              >
                                DELETE
                              </button>
                              <button
                                onClick={() => setPendingSkillDelete(null)}
                                className="border border-forge-dark px-1.5 py-0.5 rounded text-forge-dim hover:text-white"
                                type="button"
                              >
                                CANCEL
                              </button>
                            </div>
                          </div>
                        )}
                        <p className="text-[9px] text-forge-dim line-clamp-2 leading-tight select-text font-mono truncate">
                          {s.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Diff Confirmation Modal */}
      {isDiffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono select-none">
          <div className="w-full max-w-xl border border-forge-neon rounded bg-forge-panel-bg p-5 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center border-b border-forge-dark pb-2">
              <span className="text-xs font-bold text-forge-neon uppercase tracking-wider flex items-center gap-1.5">
                <ClipboardList size={14} /> Merge CREW reviews to FLOW Board
              </span>
              <button
                type="button"
                onClick={() => setIsDiffModalOpen(false)}
                className="text-forge-dim hover:text-white"
                title="Close dialog"
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto my-3 space-y-4 pr-1 text-xs">
              <p className="text-[10px] text-forge-dim">
                Review before mutation. Synced task differences are shown below.
              </p>

              {/* New Tasks */}
              {diffNewTasks.length > 0 && (
                <div className="space-y-2">
                  <div className="text-forge-neon font-bold uppercase text-[10px]">New Tasks to Add (+{diffNewTasks.length})</div>
                  <div className="space-y-2">
                    {diffNewTasks.map((item, idx) => (
                      <div key={idx} className="border border-forge-dark p-2 rounded bg-green-950/10 border-l-2 border-l-forge-neon">
                        <div className="flex justify-between font-bold">
                          <span className="text-white">{item.title}</span>
                          <span className="text-forge-neon text-[9px] uppercase">{item.category}</span>
                        </div>
                        {item.criteriaHint && (
                          <div className="text-[9px] text-forge-dim mt-1">
                            <span className="text-forge-neon">Criteria:</span> {item.criteriaHint}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Updates */}
              {diffUpdatedTasks.length > 0 && (
                <div className="space-y-2">
                  <div className="text-amber-400 font-bold uppercase text-[10px]">Existing Tasks to Refine/Merge (*{diffUpdatedTasks.length})</div>
                  <div className="space-y-2">
                    {diffUpdatedTasks.map((u, idx) => (
                      <div key={idx} className="border border-forge-dark p-2 rounded bg-amber-950/10 border-l-2 border-l-amber-500">
                        <div className="flex justify-between font-bold">
                          <span className="text-white">{u.existingTask.title}</span>
                          <span className="text-amber-400 text-[9px] uppercase">{u.refinedItem.category || u.existingTask.category}</span>
                        </div>
                        <div className="text-[10px] text-forge-dim mt-1">
                          <span className="text-amber-500">Status Change:</span> {u.refinedItem.status}
                        </div>
                        {u.refinedItem.changes && (
                          <div className="text-[10px] text-forge-dim">
                            <span className="text-amber-500">Refinements:</span> {u.refinedItem.changes}
                          </div>
                        )}
                        {u.refinedItem.criteriaHint && (
                          <div className="text-[9px] text-forge-dim">
                            <span className="text-amber-500">New Criteria:</span> {u.refinedItem.criteriaHint}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diffNewTasks.length === 0 && diffUpdatedTasks.length === 0 && (
                <div className="text-center py-6 text-forge-dim">No additions or modifications needed. All items match existing tasks perfectly.</div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-forge-dark pt-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsDiffModalOpen(false)}
                className="forge-secondary-button text-[10px] py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPushToFlow}
                className="forge-btn text-[10px] py-1.5 px-4 font-bold"
              >
                Confirm &amp; Apply changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
