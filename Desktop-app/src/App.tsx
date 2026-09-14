import { useState, useEffect, useRef, useCallback, lazy, Suspense, Component, type ErrorInfo, type ReactNode } from 'react';
import { ConfigHeader } from './components/ConfigHeader';
import { ChatConsole } from './components/ChatConsole';
import { AgentDashboard } from './components/AgentDashboard';
import { NotificationCenter, type AppNotification, type NotificationKind } from './components/NotificationCenter';
import { ActivationChecklist } from './components/ActivationChecklist';
import { hostedProviderForModel } from './shared/providerDisclosure';
import { redactSensitiveData } from './shared/redact';
import { checkForAppUpdates } from './shared/updateChecker';
import { getDefaultCatalog, type ModelDefinition, type RoleModelMap } from './shared/modelCatalog';

// Heavy / conditional components: lazy-load to keep the initial chunk below 500 kB.
const CoworkSpace = lazy(() => import('./components/CoworkSpace').then(m => ({ default: m.CoworkSpace })));
const ProjectBoard = lazy(() => import('./components/ProjectBoard').then(m => ({ default: m.ProjectBoard })));
const PlanningScreen = lazy(() => import('./components/PlanningScreen').then(m => ({ default: m.PlanningScreen })));
const PreviewDeck = lazy(() => import('./components/PreviewDeck').then(m => ({ default: m.PreviewDeck })));
const OnboardingTutorial = lazy(() => import('./components/OnboardingTutorial').then(m => ({ default: m.OnboardingTutorial })));
const VibeStudio = lazy(() => import('./components/VibeStudio').then(m => ({ default: m.VibeStudio })));
const ProjectSetupScreen = lazy(() => import('./components/ProjectSetupScreen').then(m => ({ default: m.ProjectSetupScreen })));

const SpaceLoading = () => (
  <div className="flex-1 flex items-center justify-center text-forge-dim text-xs font-mono">
    Loading workspace…
  </div>
);
import { CommandPalette } from './components/CommandPalette';
import { DiffSafetyDrawer } from './components/DiffSafetyDrawer';
import { ZelorynLockup } from './components/ZelorynLogo';
import { Trash2, Plus, Cpu, FolderOpen, X, Sparkles, GitBranch, ShieldAlert, Search } from 'lucide-react';
import type { AgentLog, AgentRole, ResponseMode } from './backend/agents';
import type { ProjectTask } from './backend/db';
 
interface SessionMeta {
  id: string;
  title: string;
  createdAt: string;
}
 
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', fontFamily: 'monospace', color: '#ff3333', background: '#0a0a0a' }}>
          <h2 style={{ marginBottom: '12px' }}>⚠ RENDER ERROR</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: '16px', padding: '8px 16px', cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  // API keys live in memory and persist only through the encrypted backend
  // credential store (safeStorage IPC) — never in plaintext localStorage.
  // They load on mount via fetchCredentials(); legacy plaintext entries are
  // migrated (and removed) by the migration effect below.
  const [apiKey, setApiKey] = useState<string>('');
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [openaiApiKey, setOpenaiApiKey] = useState<string>('');
  const [anthropicApiKey, setAnthropicApiKey] = useState<string>('');
  const [openrouterApiKey, setOpenrouterApiKey] = useState<string>('');
  const [ollamaUrl, setOllamaUrl] = useState<string>(() => localStorage.getItem('matrix_ollama_url') || 'http://localhost:11434');
  const [useSearch, setUseSearch] = useState<boolean>(() => localStorage.getItem('matrix_gemini_use_search') === 'true');
  const [model, setModel] = useState<string>(() => {
    return localStorage.getItem('matrix_model') || 'ollama:qwen2.5-coder';
  });
  const [fastModel, setFastModel] = useState<string>(() => {
    return localStorage.getItem('matrix_fast_model') || '';
  });
  const [customApiKey, setCustomApiKey] = useState<string>('');
  const [customBaseUrl, setCustomBaseUrl] = useState<string>(() => localStorage.getItem('matrix_custom_base_url') || '');
  const [customProviderName, setCustomProviderName] = useState<string>(() => localStorage.getItem('matrix_custom_provider_name') || 'Custom Provider');
  const [customModels, setCustomModels] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('matrix_custom_models');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [anthropicBaseUrl, setAnthropicBaseUrl] = useState<string>(() => localStorage.getItem('matrix_anthropic_base_url') || '');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState<string>(() => localStorage.getItem('matrix_openai_base_url') || '');
  const [geminiBaseUrl, setGeminiBaseUrl] = useState<string>(() => localStorage.getItem('matrix_gemini_base_url') || '');
  const [modelRoles, setModelRoles] = useState<RoleModelMap>(() => {
    try {
      const saved = localStorage.getItem('matrix_model_roles');
      return saved ? JSON.parse(saved) : { chat: '', reasoning: '', coding: '', review: '', research: '', fast: '' };
    } catch {
      return { chat: '', reasoning: '', coding: '', review: '', research: '', fast: '' };
    }
  });
  const [customPricing, setCustomPricing] = useState<Record<string, { input: number; output: number }>>(() => {
    try {
      const saved = localStorage.getItem('matrix_custom_pricing');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [syncedCatalog, setSyncedCatalog] = useState<ModelDefinition[]>(() => {
    try {
      const saved = localStorage.getItem('matrix_synced_catalog');
      return saved ? JSON.parse(saved) : getDefaultCatalog();
    } catch {
      return getDefaultCatalog();
    }
  });
  const [ollamaDetected, setOllamaDetected] = useState(false);
  const [activationRevision, setActivationRevision] = useState(0);
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('');
  const [theme, setTheme] = useState<string>(() => {
    const saved = localStorage.getItem('matrix_theme');
    // Design Identity: strictly Dark (default) and Light themes.
    // Legacy themes ('forge', 'slate', 'terminal', etc.) map onto 'dark'.
    if (saved === 'light') {
      return 'light';
    }
    return 'dark';
  });
  const [customInstructions, setCustomInstructions] = useState<string>(() => localStorage.getItem('matrix_custom_instructions') || '');
  const [responseMode, setResponseMode] = useState<ResponseMode>(() => (localStorage.getItem('matrix_response_mode') as ResponseMode) || 'balanced');
  const [thinkingCapability, setThinkingCapability] = useState<'low' | 'medium' | 'high' | 'ultra'>(() => (localStorage.getItem('matrix_thinking_capability') as any) || 'medium');
  const [isGoogleLinked, setIsGoogleLinked] = useState<boolean>(false);
  const [isSyncingGoogle, setIsSyncingGoogle] = useState<boolean>(false);
  const [githubToken, setGithubToken] = useState<string>('');
  const [githubRepoUrl, setGithubRepoUrl] = useState<string>(() => localStorage.getItem('matrix_github_repo_url') || '');
  const [zeroEgressMode, setZeroEgressMode] = useState<boolean>(() => localStorage.getItem('matrix_zero_egress') === 'true');
  const [privacyMode, setPrivacyMode] = useState<boolean>(() => localStorage.getItem('matrix_privacy_mode') === 'true');
  // One-time data disclosure per hosted provider: a query bound for a provider
  // the user has not yet acknowledged is parked here until they confirm.
  const [disclosedProviders, setDisclosedProviders] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('matrix_disclosed_providers') || '[]');
    } catch {
      return [];
    }
  });
  const [pendingDisclosure, setPendingDisclosure] = useState<{ provider: string; query: string; options: SendQueryOptions } | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const notificationIdRef = useRef<number>(1);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isDiffDrawerOpen, setIsDiffDrawerOpen] = useState<boolean>(false);
  const [currentGitBranch, setCurrentGitBranch] = useState<string>('main');

  const notify = useCallback((message: string, kind: NotificationKind = 'info', action?: { label: string; onClick: () => void }) => {
    const id = notificationIdRef.current++;
    setNotifications(prev => [...prev.slice(-3), { id, kind, message, action }]);
    window.setTimeout(() => {
      setNotifications(prev => prev.filter(notification => notification.id !== id));
    }, action ? 12000 : kind === 'error' ? 7000 : 4500);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchGitBranch = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/git/status');
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.currentBranch) {
            setCurrentGitBranch(data.currentBranch);
          }
        }
      } catch {
        // ignore if not running
      }
    };
    fetchGitBranch();
    return () => { mounted = false; };
  }, [workspaceRoot]);

  const handleNativeBrowseFolder = async () => {
    if ((window as any).electronAPI?.selectDirectory) {
      const selected = await (window as any).electronAPI.selectDirectory();
      if (selected) {
        handleUpdateConfig({ workspaceRoot: selected });
        notify(`Workspace folder set to ${selected}`, 'success');
      }
    } else {
      setIsProjectModalOpen(true);
    }
  };

  const handleAnalyzeCodebase = () => {
    handleSpaceChange('plan');
    handleSendQuery(
      'Analyze the existing codebase in this repository. Produce an architectural summary, list key modules, files, dependencies, and propose a structured roadmap for tinkering or extending features.',
      { spaceOverride: 'chat' }
    );
  };

  const handleImportTodosFromPalette = async () => {
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
        setTasks(prev => [...prev, ...newTasks]);
        notify(`Imported ${newTasks.length} TODO(s) from existing codebase files into Flow.`, 'success');
      } else {
        notify('No TODO/FIXME comments found in codebase files.', 'info');
      }
    } catch (err: any) {
      notify(`Failed to import TODOs: ${err.message}`, 'error');
    }
  };

  // Background non-intrusive update notification
  useEffect(() => {
    let unsubscribeElectron: (() => void) | undefined;
    if ((window as any).electronAPI?.onUpdateAvailable) {
      unsubscribeElectron = (window as any).electronAPI.onUpdateAvailable((info: any) => {
        const version = info?.version || 'new version';
        const releaseUrl = info?.releaseUrl || 'https://github.com/yassin-kryleos/zeloryn/releases/latest';
        const dismissed = localStorage.getItem('zeloryn_dismissed_update');
        if (dismissed !== version) {
          notify(
            `Update available: Zeloryn ${version} is now available!`,
            'info',
            {
              label: 'View Release',
              onClick: () => {
                if ((window as any).electronAPI?.openExternal) {
                  (window as any).electronAPI.openExternal(releaseUrl);
                } else {
                  window.open(releaseUrl, '_blank');
                }
              }
            }
          );
        }
      });
    }

    let cancelled = false;
    const checkUpdates = async () => {
      try {
        const result = await checkForAppUpdates({ force: false });
        if (cancelled) return;
        if (result.hasUpdate) {
          const dismissed = localStorage.getItem('zeloryn_dismissed_update');
          if (dismissed !== result.latestVersion) {
            notify(
              `Update available: Zeloryn v${result.latestVersion} is now available!`,
              'info',
              {
                label: 'View Release',
                onClick: () => {
                  if ((window as any).electronAPI?.openExternal) {
                    (window as any).electronAPI.openExternal(result.releaseUrl);
                  } else {
                    window.open(result.releaseUrl, '_blank');
                  }
                }
              }
            );
          }
        }
      } catch {
        // Fail silently in background
      }
    };

    const timer = window.setTimeout(checkUpdates, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsubscribeElectron?.();
    };
  }, [notify]);

  useEffect(() => {
    let cancelled = false;
    const detect = async () => {
      try {
        const res = await fetch(`http://localhost:3001/api/providers/detect?baseUrl=${encodeURIComponent(ollamaUrl)}`);
        const data = await res.json();
        if (!cancelled) setOllamaDetected(Boolean(res.ok && data.success && data.ollamaAvailable));
      } catch {
        if (!cancelled) setOllamaDetected(false);
      }
    };
    detect();
    const timer = window.setInterval(detect, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [ollamaUrl]);

  // PII filter, Telemetry, and Multi-Repo states
  const [piiFilterEnabled, setPiiFilterEnabled] = useState<boolean>(() => localStorage.getItem('matrix_pii_filter_enabled') === 'true');
  const [workspacePaths, setWorkspacePaths] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('matrix_workspace_paths');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [telemetry, setTelemetry] = useState<{ bytesSent: number; bytesReceived: number; compressionSavingsRatio: number } | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProject, setActiveProject] = useState<any | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);

  useEffect(() => {
    document.body.className = `theme-${theme}`;
    localStorage.setItem('matrix_theme', theme);
  }, [theme]);

  const [isTutorialOpen, setIsTutorialOpen] = useState<boolean>(() => {
    return localStorage.getItem('matrix_tutorial_completed') !== 'true';
  });
  
  // Connection, Sidebar & Space Toggles
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  // Returning users (setup already completed) land on the FLOW Today view;
  // first-run users start in PLAN behind the project-setup screen.
  const [activeSpace, setActiveSpace] = useState<'vibe' | 'code' | 'chat' | 'cowork' | 'project' | 'plan'>(
    () => {
      try {
        const saved = localStorage.getItem('matrix_active_space') as any;
        if (saved && ['vibe', 'code', 'chat', 'cowork', 'project', 'plan'].includes(saved)) {
          return saved;
        }
      } catch {
        // ignore
      }
      return 'vibe';
    }
  );
  const [showSetup, setShowSetup] = useState<boolean>(() => localStorage.getItem('matrix_setup_done') !== 'true');
  const [appGraphPreviewFile, setAppGraphPreviewFile] = useState<{ path: string; content: string } | null>(null);
  const [isAppGraphEditing, setIsAppGraphEditing] = useState<boolean>(false);
  const [appGraphEditedContent, setAppGraphEditedContent] = useState<string>('');
  const socketRef = useRef<WebSocket | null>(null);
  const [collabActive, setCollabActive] = useState<boolean>(false);

  // States from backend orchestrator
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [customAgents, setCustomAgents] = useState<Array<{ name: string; role: string; prompt: string }>>([]);
  const [localSkills, setLocalSkills] = useState<Array<{ name: string; type: 'script' | 'markdown'; content: string }>>([]);
  const [localAgents, setLocalAgents] = useState<Array<{ name: string; role: string; prompt: string }>>([]);
  const [activeAgent, setActiveAgent] = useState<AgentRole | 'system'>('system');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamingReasoning, setStreamingReasoning] = useState<string>('');
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [planningInitialInput, setPlanningInitialInput] = useState<string>('');
  const [planningResetKey, setPlanningResetKey] = useState<number>(0);

  // Persistent Chat Sessions
  const [selectedVibeTaskId, setSelectedVibeTaskId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>('planning_session');
  const [commandPendingApproval, setCommandPendingApproval] = useState<{ tool: string; command: string; commandId?: string } | null>(null);

  const selectedSessionIdRef = useRef<string | null>(null);
  const wsConfigRef = useRef({
    apiKey,
    geminiApiKey,
    openaiApiKey,
    anthropicApiKey,
    openrouterApiKey,
    ollamaUrl,
    customApiKey,
    customBaseUrl,
    customProviderName,
    customModels,
    anthropicBaseUrl,
    openaiBaseUrl,
    geminiBaseUrl,
    useSearch,
    model,
    fastModel,
    roleModels: modelRoles,
    customPricing,
    customInstructions,
    responseMode,
    thinkingCapability,
    workspaceRoot: workspaceRoot || undefined
  });

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    wsConfigRef.current = {
      apiKey,
      geminiApiKey,
      openaiApiKey,
      anthropicApiKey,
      openrouterApiKey,
      ollamaUrl,
      customApiKey,
      customBaseUrl,
      customProviderName,
      customModels,
      anthropicBaseUrl,
      openaiBaseUrl,
      geminiBaseUrl,
      useSearch,
      model,
      fastModel,
      roleModels: modelRoles,
      customPricing,
      customInstructions,
      responseMode,
      thinkingCapability,
      workspaceRoot: workspaceRoot || undefined
    };
  }, [
    apiKey,
    geminiApiKey,
    openaiApiKey,
    anthropicApiKey,
    openrouterApiKey,
    ollamaUrl,
    customApiKey,
    customBaseUrl,
    customProviderName,
    customModels,
    anthropicBaseUrl,
    openaiBaseUrl,
    geminiBaseUrl,
    useSearch,
    model,
    fastModel,
    modelRoles,
    customPricing,
    customInstructions,
    responseMode,
    thinkingCapability,
    workspaceRoot
  ]);

  const fetchWorkspace = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/workspace');
      if (response.ok) {
        const data = await response.json();
        setWorkspaceRoot(data.workspaceRoot || data.defaultWorkspace || '');
      }
    } catch (err) {
      console.error('Failed to query workspace route', err);
    }
  }, []);

  const fetchProjects = useCallback(async (autoSelectId?: string) => {
    try {
      const res = await fetch('http://localhost:3001/api/projects');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.projects)) {
          setProjects(data.projects);
          
          const storedId = autoSelectId || localStorage.getItem('matrix_active_project_id');
          if (storedId) {
            const found = data.projects.find((p: any) => p.id === storedId);
            if (found) {
              setActiveProject(found);
              await fetch('http://localhost:3001/api/projects/active', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: storedId })
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch projects list:', err);
    }
  }, []);

  const handleSelectProject = async (project: any) => {
    try {
      const res = await fetch('http://localhost:3001/api/projects/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActiveProject(project);
        localStorage.setItem('matrix_active_project_id', project.id);
        if (project.id !== 'project_demo') {
          localStorage.setItem('matrix_activation_repo', 'true');
          setActivationRevision(value => value + 1);
        }
        localStorage.setItem('matrix_project_name', project.name);
        if (project.description) {
          localStorage.setItem('matrix_project_description', project.description);
        } else {
          localStorage.removeItem('matrix_project_description');
        }
        
        setWorkspaceRoot(project.workspaceFolder);
        
        const pSessionId = `session_plan_${project.id}`;
        setSelectedSessionId(pSessionId);
        setLogs([]);
        setChecklist([]);
        setTasks([]);
        
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({
            type: 'load_session',
            sessionId: pSessionId
          }));
        }

        const flowSessionId = `flow_board_${project.id}`;
        try {
          const tasksRes = await fetch(`http://localhost:3001/api/sessions/${flowSessionId}`);
          if (tasksRes.ok) {
            const tasksData = await tasksRes.json();
            if (Array.isArray(tasksData.tasks)) {
              setTasks(tasksData.tasks);
            }
          }
        } catch {
          // ignore
        }

        notify(`Active project switched to "${project.name}"`, 'success');
        setIsProjectModalOpen(false);
      }
    } catch (err: any) {
      notify(`Failed to switch project: ${err.message}`, 'error');
    }
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`http://localhost:3001/api/projects/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        notify('Project deleted.', 'info');
        if (activeProject?.id === id) {
          setActiveProject(null);
          localStorage.removeItem('matrix_active_project_id');
          localStorage.removeItem('matrix_project_name');
          localStorage.removeItem('matrix_project_description');
        }
        fetchProjects();
      }
    } catch (err: any) {
      notify(`Failed to delete project: ${err.message}`, 'error');
    }
  };

  const handleCreateProject = async (name: string, folderPath: string, gitUrl: string, description: string) => {
    try {
      const res = await fetch('http://localhost:3001/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, folderPath, gitUrl, description })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify(`Project "${name}" created successfully.`, 'success');
        await fetchProjects(data.project.id);
        handleSelectProject(data.project);
      } else {
        throw new Error(data.error || 'Failed to create project.');
      }
    } catch (err: any) {
      notify(`Project creation failed: ${err.message}`, 'error');
    }
  };

  const fetchCredentials = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/credentials');
      if (response.ok) {
        const data = await response.json();
        const electronAPI = (window as any).electronAPI;
        
        const decrypt = async (val: string) => {
          if (!val) return '';
          if (electronAPI && electronAPI.decryptString) {
            try {
              return await electronAPI.decryptString(val);
            } catch (e) {
              return val;
            }
          }
          return val;
        };

        const keyVal = await decrypt(data.apiKey);
        const geminiVal = await decrypt(data.geminiApiKey);
        const openaiVal = await decrypt(data.openaiApiKey);
        const anthropicVal = await decrypt(data.anthropicApiKey);
        const openrouterVal = await decrypt(data.openrouterApiKey);
        const customKeyVal = await decrypt(data.customApiKey);
        const ollamaVal = data.ollamaUrl || '';
        const gitTokenVal = await decrypt(data.githubToken);
        const gitRepoVal = data.githubRepoUrl || '';

        if (keyVal) setApiKey(keyVal);
        if (geminiVal) setGeminiApiKey(geminiVal);
        if (openaiVal) setOpenaiApiKey(openaiVal);
        if (anthropicVal) setAnthropicApiKey(anthropicVal);
        if (openrouterVal) setOpenrouterApiKey(openrouterVal);
        if (customKeyVal) setCustomApiKey(customKeyVal);
        if (data.customBaseUrl) {
          setCustomBaseUrl(data.customBaseUrl);
          localStorage.setItem('matrix_custom_base_url', data.customBaseUrl);
        }
        if (data.customProviderName) {
          setCustomProviderName(data.customProviderName);
          localStorage.setItem('matrix_custom_provider_name', data.customProviderName);
        }
        if (data.customModels && Array.isArray(data.customModels)) {
          setCustomModels(data.customModels);
          localStorage.setItem('matrix_custom_models', JSON.stringify(data.customModels));
        }
        if (data.anthropicBaseUrl) {
          setAnthropicBaseUrl(data.anthropicBaseUrl);
          localStorage.setItem('matrix_anthropic_base_url', data.anthropicBaseUrl);
        }
        if (data.openaiBaseUrl) {
          setOpenaiBaseUrl(data.openaiBaseUrl);
          localStorage.setItem('matrix_openai_base_url', data.openaiBaseUrl);
        }
        if (data.geminiBaseUrl) {
          setGeminiBaseUrl(data.geminiBaseUrl);
          localStorage.setItem('matrix_gemini_base_url', data.geminiBaseUrl);
        }
        if (ollamaVal) setOllamaUrl(ollamaVal);
        if (gitTokenVal) setGithubToken(gitTokenVal);
        if (gitRepoVal) setGithubRepoUrl(gitRepoVal);
      }
    } catch (err) {
      console.error('Failed to load secure credentials from backend config keychain', err);
    }
  }, []);

  const saveCredentials = async (keys: { 
    apiKey?: string; 
    geminiApiKey?: string;
    openaiApiKey?: string;
    anthropicApiKey?: string;
    openrouterApiKey?: string;
    customApiKey?: string;
    customBaseUrl?: string;
    customProviderName?: string;
    customModels?: string[];
    anthropicBaseUrl?: string;
    openaiBaseUrl?: string;
    geminiBaseUrl?: string;
    ollamaUrl?: string;
    githubToken?: string;
    githubRepoUrl?: string;
  }) => {
    try {
      const electronAPI = (window as any).electronAPI;
      const encrypt = async (val: string | undefined) => {
        if (val === undefined) return undefined;
        if (!val) return '';
        if (electronAPI && electronAPI.encryptString) {
          try {
            return await electronAPI.encryptString(val);
          } catch (e) {
            return val;
          }
        }
        return val;
      };

      const encryptedKeys = {
        apiKey: await encrypt(keys.apiKey),
        geminiApiKey: await encrypt(keys.geminiApiKey),
        openaiApiKey: await encrypt(keys.openaiApiKey),
        anthropicApiKey: await encrypt(keys.anthropicApiKey),
        openrouterApiKey: await encrypt(keys.openrouterApiKey),
        customApiKey: await encrypt(keys.customApiKey),
        customBaseUrl: keys.customBaseUrl,
        customProviderName: keys.customProviderName,
        customModels: keys.customModels,
        anthropicBaseUrl: keys.anthropicBaseUrl,
        openaiBaseUrl: keys.openaiBaseUrl,
        geminiBaseUrl: keys.geminiBaseUrl,
        ollamaUrl: keys.ollamaUrl,
        githubToken: await encrypt(keys.githubToken),
        githubRepoUrl: keys.githubRepoUrl
      };

      const payload: any = {};
      for (const [k, v] of Object.entries(encryptedKeys)) {
        if (v !== undefined) payload[k] = v;
      }

      const res = await fetch('http://localhost:3001/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch (err) {
      console.error('Failed to save secure credentials to backend config keychain', err);
      return false;
    }
  };

  // One-time migration: older builds persisted API keys in plaintext
  // localStorage. Move any leftovers into the encrypted credential store and
  // remove the plaintext copies — but only after the encrypted save succeeds,
  // so a downed backend never loses the user's keys.
  useEffect(() => {
    const legacyEntries: Array<{ storageKey: string; configKey: string; apply: (v: string) => void }> = [
      { storageKey: 'matrix_api_key', configKey: 'apiKey', apply: v => setApiKey(prev => prev || v) },
      { storageKey: 'matrix_gemini_api_key', configKey: 'geminiApiKey', apply: v => setGeminiApiKey(prev => prev || v) },
      { storageKey: 'matrix_openai_api_key', configKey: 'openaiApiKey', apply: v => setOpenaiApiKey(prev => prev || v) },
      { storageKey: 'matrix_anthropic_api_key', configKey: 'anthropicApiKey', apply: v => setAnthropicApiKey(prev => prev || v) },
      { storageKey: 'matrix_openrouter_api_key', configKey: 'openrouterApiKey', apply: v => setOpenrouterApiKey(prev => prev || v) },
      { storageKey: 'matrix_github_token', configKey: 'githubToken', apply: v => setGithubToken(prev => prev || v) }
    ];
    const found = legacyEntries.filter(entry => localStorage.getItem(entry.storageKey));
    if (found.length === 0) return;
    const payload: Record<string, string> = {};
    for (const entry of found) {
      const value = localStorage.getItem(entry.storageKey)!;
      payload[entry.configKey] = value;
      entry.apply(value);
    }
    saveCredentials(payload).then(saved => {
      if (saved) {
        found.forEach(entry => localStorage.removeItem(entry.storageKey));
      }
    });
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/sessions?space=${activeSpace}`);
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (err) {
      console.error('Failed to load session list', err);
    }
  }, [activeSpace]);

  const fetchGoogleStatus = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3001/api/google/status');
      if (res.ok) {
        const data = await res.json();
        setIsGoogleLinked(data.linked);
      }
    } catch (err) {}
  }, []);

  const handleSelectSession = useCallback((sessionId: string) => {
    if (isStreaming) return;
    setSelectedSessionId(sessionId);
    setLogs([]);
    setChecklist([]);
    setTasks([]);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'load_session',
        sessionId
      }));
    }
  }, [isStreaming]);

  // Persist FLOW board tasks: WebSocket when connected, REST fallback when
  // not. A failed save must never be silent — the board is project state.
  const persistFlowTasks = useCallback(async (flowSessionId: string, updatedTasks: ProjectTask[]) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'save_tasks',
        sessionId: flowSessionId,
        tasks: updatedTasks
      }));
      return;
    }
    try {
      const res = await fetch(`http://localhost:3001/api/sessions/${flowSessionId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: updatedTasks })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      notify(`Board changes are NOT saved (backend unreachable): ${err.message}`, 'error');
    }
  }, [notify]);

  // Rehydrate the FLOW board from the server. Board tasks must never be
  // silently wiped by navigation — they are the user's project state.
  const hydrateFlowBoard = useCallback(async () => {
    const flowSessionId = activeProject ? `flow_board_${activeProject.id}` : 'flow_board';
    try {
      const res = await fetch(`http://localhost:3001/api/sessions/${flowSessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.tasks)) setTasks(data.tasks);
    } catch {
      // Keep current in-memory tasks when the backend is unreachable.
    }
  }, [activeProject]);

  const handleSpaceChange = useCallback((space: 'vibe' | 'code' | 'chat' | 'cowork' | 'project' | 'plan') => {
    if (isStreaming) return;
    setActiveSpace(space);
    try {
      localStorage.setItem('matrix_active_space', space);
    } catch {
      // ignore
    }
    if (space === 'plan') {
      // Project chats live under session_plan_<projectId>; loading the global
      // 'planning_session' here made the Scratchbook conversation appear lost
      // after any tab switch.
      handleSelectSession(activeProject ? `session_plan_${activeProject.id}` : 'planning_session');
    } else {
      setSelectedSessionId(null);
      setLogs([]);
      setChecklist([]);
      // Refresh (never wipe) the board so FLOW/CREW/FORGE always show saved tasks.
      hydrateFlowBoard();
    }
  }, [handleSelectSession, isStreaming, hydrateFlowBoard, activeProject]);

  useEffect(() => {
    fetchWorkspace();
    fetchCredentials();
    fetchGoogleStatus();
    fetchProjects();
  }, [fetchWorkspace, fetchCredentials, fetchGoogleStatus, fetchProjects]);

  // Fetch sessions on space switch or streaming complete
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Hydrate the FLOW board when the active project changes. Clear first so a
  // previous project's tasks never leak into the new project's board.
  useEffect(() => {
    setTasks([]);
    hydrateFlowBoard();
  }, [activeProject, hydrateFlowBoard]);

  useEffect(() => {
    if (!isStreaming) {
      fetchSessions();
    }
  }, [fetchSessions, isStreaming]);

  // Handle Space Switch tabs (keyboard shortcuts remain as tooltips/documentation).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isStreaming) return;
      if (e.key === 'F1') {
        e.preventDefault();
        handleSpaceChange('plan');
      } else if (e.key === 'F2') {
        e.preventDefault();
        handleSpaceChange('cowork');
      } else if (e.key === 'F3') {
        e.preventDefault();
        handleSpaceChange('project');
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleSpaceChange('code');
      } else if (e.key === 'F5') {
        e.preventDefault();
        handleSpaceChange('vibe');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSpaceChange, isStreaming]);

  useEffect(() => {
    let reconnectDelay = 1000;

    const connectWS = () => {
      console.log('Connecting to WS server...');
      const ws = new WebSocket('ws://localhost:3001');

      let pendingUpdate: any = null;
      let animationFrameId: number | null = null;

      const processPendingUpdate = () => {
        if (pendingUpdate) {
          const data = pendingUpdate;
          setLogs(data.logs || []);
          setChecklist(data.checklist || []);
          setTasks(data.tasks || []);
          if (data.customAgents) {
            setCustomAgents(data.customAgents);
          }
          if (data.localSkills) {
            setLocalSkills(data.localSkills);
          }
          if (data.localAgents) {
            setLocalAgents(data.localAgents);
          }
          setActiveAgent(data.activeAgent || 'system');
          setIsStreaming(data.isStreaming || false);
          setStreamingReasoning(data.streamingReasoning || '');
          setStreamingContent(data.streamingContent || '');
          pendingUpdate = null;
        }
        animationFrameId = null;
      };

      ws.onopen = () => {
        setIsConnected(true);
        setWs(ws);
        socketRef.current = ws;
        reconnectDelay = 1000;

        ws.send(JSON.stringify({
          type: 'config',
          ...wsConfigRef.current
        }));

        // If a session was active, restore its WS representation on connect
        if (selectedSessionIdRef.current) {
          ws.send(JSON.stringify({
            type: 'load_session',
            sessionId: selectedSessionIdRef.current
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'update') {
            pendingUpdate = data;
            if (!animationFrameId) {
              animationFrameId = requestAnimationFrame(processPendingUpdate);
            }
          } else if (data.type === 'status') {
            setLogs(prev => [
              ...prev,
              {
                timestamp: new Date().toLocaleTimeString(),
                sender: 'system',
                recipient: 'user',
                message: data.message,
                type: 'info'
              }
            ]);
            if (data.workspaceRoot) {
              setWorkspaceRoot(data.workspaceRoot);
            }
          } else if (data.type === 'command_approval_required') {
            setCommandPendingApproval({ tool: data.tool, command: data.command, commandId: data.commandId });
          } else if (data.type === 'collab_room_joined') {
            setCollabActive(true);
            setLogs(prev => [
              ...prev,
              {
                timestamp: new Date().toLocaleTimeString(),
                sender: 'system',
                recipient: 'user',
                message: data.message || 'Joined collaboration room.',
                type: 'info'
              }
            ]);
          } else if (data.type === 'collab_room_left') {
            setCollabActive(false);
            setLogs(prev => [
              ...prev,
              {
                timestamp: new Date().toLocaleTimeString(),
                sender: 'system',
                recipient: 'user',
                message: data.message || 'Left collaboration room.',
                type: 'info'
              }
            ]);
          } else if (data.type === 'collab_peer_joined') {
            setLogs(prev => [
              ...prev,
              {
                timestamp: new Date().toLocaleTimeString(),
                sender: 'system',
                recipient: 'user',
                message: data.message || 'A pair programmer joined the session.',
                type: 'info'
              }
            ]);
          } else if (data.type === 'collab_peer_left') {
            setLogs(prev => [
              ...prev,
              {
                timestamp: new Date().toLocaleTimeString(),
                sender: 'system',
                recipient: 'user',
                message: data.message || 'Pair programmer left the session.',
                type: 'info'
              }
            ]);
          } else if (data.type === 'collab_signal') {
            setLogs(prev => [
              ...prev,
              {
                timestamp: new Date().toLocaleTimeString(),
                sender: 'system',
                recipient: 'user',
                message: `WebRTC Signaling payload: ${JSON.stringify(data.signal)}`,
                type: 'info'
              }
            ]);
          } else if (data.type === 'cost_update') {
            window.dispatchEvent(new CustomEvent('kryleos_cost_update', { detail: data }));
          } else if (data.type === 'error') {
            setLogs(prev => [
              ...prev,
              {
                timestamp: new Date().toLocaleTimeString(),
                sender: 'system',
                recipient: 'user',
                message: data.message,
                type: 'error'
              }
            ]);
          }
        } catch (err) {
          console.error('Failed parsing WS message', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setWs(null);
        socketRef.current = null;

        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }

        // Reset streaming state on disconnect to avoid UI ghosting
        setIsStreaming(false);
        setStreamingContent('');
        setStreamingReasoning('');
        setActiveAgent('system');
        setCommandPendingApproval(null);
        setCollabActive(false);

        console.log(`WebSocket closed. Retrying connection in ${reconnectDelay}ms...`);
        setTimeout(connectWS, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
      };
    };

    connectWS();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [workspaceRoot]);

  const handleUpdateConfig = (newConfig: { 
    apiKey?: string; 
    geminiApiKey?: string;
    openaiApiKey?: string;
    anthropicApiKey?: string;
    openrouterApiKey?: string;
    ollamaUrl?: string;
    customApiKey?: string;
    customBaseUrl?: string;
    customProviderName?: string;
    customModels?: string[];
    anthropicBaseUrl?: string;
    openaiBaseUrl?: string;
    geminiBaseUrl?: string;
    useSearch?: boolean;
    model?: string; 
    fastModel?: string;
    workspaceRoot?: string;
    theme?: string;
    customInstructions?: string;
    responseMode?: ResponseMode;
    thinkingCapability?: 'low' | 'medium' | 'high' | 'ultra';
    modelRoles?: RoleModelMap;
    customPricing?: Record<string, { input: number; output: number }>;
    syncedCatalog?: ModelDefinition[];
    githubToken?: string;
    githubRepoUrl?: string;
    zeroEgressMode?: boolean;
    privacyMode?: boolean;
  }) => {
    if (newConfig.apiKey !== undefined) {
      setApiKey(newConfig.apiKey);
      saveCredentials({ apiKey: newConfig.apiKey });
    }
    if (newConfig.geminiApiKey !== undefined) {
      setGeminiApiKey(newConfig.geminiApiKey);
      saveCredentials({ geminiApiKey: newConfig.geminiApiKey });
    }
    if (newConfig.openaiApiKey !== undefined) {
      setOpenaiApiKey(newConfig.openaiApiKey);
      saveCredentials({ openaiApiKey: newConfig.openaiApiKey });
    }
    if (newConfig.anthropicApiKey !== undefined) {
      setAnthropicApiKey(newConfig.anthropicApiKey);
      saveCredentials({ anthropicApiKey: newConfig.anthropicApiKey });
    }
    if (newConfig.openrouterApiKey !== undefined) {
      setOpenrouterApiKey(newConfig.openrouterApiKey);
      saveCredentials({ openrouterApiKey: newConfig.openrouterApiKey });
    }
    if (newConfig.ollamaUrl !== undefined) {
      setOllamaUrl(newConfig.ollamaUrl);
      localStorage.setItem('matrix_ollama_url', newConfig.ollamaUrl);
      saveCredentials({ ollamaUrl: newConfig.ollamaUrl });
    }
    if (newConfig.customApiKey !== undefined) {
      setCustomApiKey(newConfig.customApiKey);
      saveCredentials({ customApiKey: newConfig.customApiKey });
    }
    if (newConfig.customBaseUrl !== undefined) {
      setCustomBaseUrl(newConfig.customBaseUrl);
      localStorage.setItem('matrix_custom_base_url', newConfig.customBaseUrl);
      saveCredentials({ customBaseUrl: newConfig.customBaseUrl });
    }
    if (newConfig.customProviderName !== undefined) {
      setCustomProviderName(newConfig.customProviderName);
      localStorage.setItem('matrix_custom_provider_name', newConfig.customProviderName);
      saveCredentials({ customProviderName: newConfig.customProviderName });
    }
    if (newConfig.customModels !== undefined) {
      setCustomModels(newConfig.customModels);
      localStorage.setItem('matrix_custom_models', JSON.stringify(newConfig.customModels));
      saveCredentials({ customModels: newConfig.customModels });
    }
    if (newConfig.anthropicBaseUrl !== undefined) {
      setAnthropicBaseUrl(newConfig.anthropicBaseUrl);
      localStorage.setItem('matrix_anthropic_base_url', newConfig.anthropicBaseUrl);
      saveCredentials({ anthropicBaseUrl: newConfig.anthropicBaseUrl });
    }
    if (newConfig.openaiBaseUrl !== undefined) {
      setOpenaiBaseUrl(newConfig.openaiBaseUrl);
      localStorage.setItem('matrix_openai_base_url', newConfig.openaiBaseUrl);
      saveCredentials({ openaiBaseUrl: newConfig.openaiBaseUrl });
    }
    if (newConfig.geminiBaseUrl !== undefined) {
      setGeminiBaseUrl(newConfig.geminiBaseUrl);
      localStorage.setItem('matrix_gemini_base_url', newConfig.geminiBaseUrl);
      saveCredentials({ geminiBaseUrl: newConfig.geminiBaseUrl });
    }
    if (newConfig.useSearch !== undefined) {
      setUseSearch(newConfig.useSearch);
      localStorage.setItem('matrix_gemini_use_search', String(newConfig.useSearch));
    }
    if (newConfig.model !== undefined) {
      setModel(newConfig.model);
      localStorage.setItem('matrix_model', newConfig.model);
    }
    if (newConfig.fastModel !== undefined) {
      setFastModel(newConfig.fastModel);
      localStorage.setItem('matrix_fast_model', newConfig.fastModel);
    }
    if (newConfig.workspaceRoot !== undefined) {
      setWorkspaceRoot(newConfig.workspaceRoot);
    }
    if (newConfig.thinkingCapability !== undefined) {
      setThinkingCapability(newConfig.thinkingCapability);
      localStorage.setItem('matrix_thinking_capability', newConfig.thinkingCapability);
    }
    if (newConfig.theme !== undefined) {
      setTheme(newConfig.theme);
    }
    if (newConfig.customInstructions !== undefined) {
      setCustomInstructions(newConfig.customInstructions);
      localStorage.setItem('matrix_custom_instructions', newConfig.customInstructions);
    }
    if (newConfig.responseMode !== undefined) {
      setResponseMode(newConfig.responseMode);
      localStorage.setItem('matrix_response_mode', newConfig.responseMode);
    }
    if (newConfig.githubToken !== undefined) {
      setGithubToken(newConfig.githubToken);
      saveCredentials({ githubToken: newConfig.githubToken });
    }
    if (newConfig.githubRepoUrl !== undefined) {
      setGithubRepoUrl(newConfig.githubRepoUrl);
      localStorage.setItem('matrix_github_repo_url', newConfig.githubRepoUrl);
      saveCredentials({ githubRepoUrl: newConfig.githubRepoUrl });
    }
    if (newConfig.zeroEgressMode !== undefined) {
      setZeroEgressMode(newConfig.zeroEgressMode);
      localStorage.setItem('matrix_zero_egress', String(newConfig.zeroEgressMode));
    }
    if (newConfig.privacyMode !== undefined) {
      setPrivacyMode(newConfig.privacyMode);
      localStorage.setItem('matrix_privacy_mode', String(newConfig.privacyMode));
      if (newConfig.privacyMode) {
        setZeroEgressMode(true);
        localStorage.setItem('matrix_zero_egress', 'true');
      }
    }
    if (newConfig.modelRoles !== undefined) {
      setModelRoles(newConfig.modelRoles);
      localStorage.setItem('matrix_model_roles', JSON.stringify(newConfig.modelRoles));
    }
    if (newConfig.customPricing !== undefined) {
      setCustomPricing(newConfig.customPricing);
      localStorage.setItem('matrix_custom_pricing', JSON.stringify(newConfig.customPricing));
    }
    if (newConfig.syncedCatalog !== undefined) {
      setSyncedCatalog(newConfig.syncedCatalog);
      localStorage.setItem('matrix_synced_catalog', JSON.stringify(newConfig.syncedCatalog));
    }

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const isPrivacy = newConfig.privacyMode !== undefined ? newConfig.privacyMode : privacyMode;
      const isZeroEgress = newConfig.zeroEgressMode !== undefined 
        ? newConfig.zeroEgressMode 
        : (newConfig.privacyMode ? true : zeroEgressMode);

      socketRef.current.send(JSON.stringify({
        type: 'config',
        apiKey: newConfig.apiKey ?? apiKey,
        geminiApiKey: newConfig.geminiApiKey ?? geminiApiKey,
        openaiApiKey: newConfig.openaiApiKey ?? openaiApiKey,
        anthropicApiKey: newConfig.anthropicApiKey ?? anthropicApiKey,
        openrouterApiKey: newConfig.openrouterApiKey ?? openrouterApiKey,
        ollamaUrl: newConfig.ollamaUrl ?? ollamaUrl,
        customApiKey: newConfig.customApiKey ?? customApiKey,
        customBaseUrl: newConfig.customBaseUrl ?? customBaseUrl,
        customProviderName: newConfig.customProviderName ?? customProviderName,
        customModels: newConfig.customModels ?? customModels,
        anthropicBaseUrl: newConfig.anthropicBaseUrl ?? anthropicBaseUrl,
        openaiBaseUrl: newConfig.openaiBaseUrl ?? openaiBaseUrl,
        geminiBaseUrl: newConfig.geminiBaseUrl ?? geminiBaseUrl,
        useSearch: newConfig.useSearch ?? useSearch,
        model: newConfig.model ?? model,
        fastModel: newConfig.fastModel ?? fastModel,
        roleModels: newConfig.modelRoles ?? modelRoles,
        customPricing: newConfig.customPricing ?? customPricing,
        customInstructions: newConfig.customInstructions ?? customInstructions,
        responseMode: newConfig.responseMode ?? responseMode,
        zeroEgressMode: isZeroEgress,
        privacyMode: isPrivacy,
        workspaceRoot: newConfig.workspaceRoot ?? workspaceRoot
      }));
    }
  };

  useEffect(() => {
    if (!isConnected) return;
    const fetchTelemetry = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/telemetry');
        if (res.ok) {
          const data = await res.json();
          setTelemetry(data);
        }
      } catch (err) {}
    };
    fetchTelemetry();
    // 20s: byte-counter telemetry is ambient; frequent polling burns battery
    // and floods logs in an Electron app for no user-visible benefit.
    const interval = setInterval(fetchTelemetry, 20000);
    return () => clearInterval(interval);
  }, [isConnected]);

  type SendQueryOptions = {
    spaceOverride?: 'code' | 'chat' | 'cowork' | 'project';
    planItemId?: string;
    workspace?: string;
    runner?: string;
  };

  const handleSendQuery = (query: string, spaceOverrideOrOptions?: 'code' | 'chat' | 'cowork' | 'project' | SendQueryOptions) => {
    const sendOptions: SendQueryOptions = typeof spaceOverrideOrOptions === 'object'
      ? spaceOverrideOrOptions
      : { spaceOverride: spaceOverrideOrOptions };
    // One-time per-provider data disclosure before the first hosted call.
    // Zero Egress / privacy mode never reach hosted providers (blocked
    // server-side), so no disclosure is needed there.
    const provider = hostedProviderForModel(model);
    if (provider && !zeroEgressMode && !privacyMode && !disclosedProviders.includes(provider)) {
      setPendingDisclosure({ provider, query, options: sendOptions });
      return;
    }
    dispatchQuery(query, sendOptions);
  };

  const confirmDisclosure = () => {
    if (!pendingDisclosure) return;
    const updated = [...disclosedProviders, pendingDisclosure.provider];
    setDisclosedProviders(updated);
    localStorage.setItem('matrix_disclosed_providers', JSON.stringify(updated));
    const { query, options } = pendingDisclosure;
    setPendingDisclosure(null);
    dispatchQuery(query, options);
  };

  const dispatchQuery = (query: string, sendOptions: SendQueryOptions) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      setIsStreaming(true);
      setStreamingContent('');
      setStreamingReasoning('');
      setActiveAgent('system');

      const activeId = selectedSessionId || `session_${Date.now()}`;
      if (!selectedSessionId) {
        setSelectedSessionId(activeId);
      }

      let filteredQuery = query;
      let piiWarning = false;
      if (piiFilterEnabled) {
        filteredQuery = redactSensitiveData(query);
        if (filteredQuery !== query) {
          piiWarning = true;
        }
      }

      setLogs(prev => {
        const list: AgentLog[] = [
          ...prev,
          {
            timestamp: new Date().toLocaleTimeString(),
            sender: 'user',
            recipient: 'coordinator',
            message: filteredQuery,
            type: 'info' as const
          }
        ];
        if (piiWarning) {
          list.push({
            timestamp: new Date().toLocaleTimeString(),
            sender: 'system',
            recipient: 'user',
            message: '[PII SHIELD ACTIVE]: Sensitive keys, emails, or phone numbers were automatically redacted from your message.',
            type: 'info' as const
          });
        }
        return list;
      });

      socketRef.current.send(JSON.stringify({
        type: 'query',
        text: filteredQuery,
        sessionId: activeId,
        space: sendOptions.spaceOverride || activeSpace,
        planItemId: sendOptions.planItemId,
        workspace: sendOptions.workspace,
        runner: sendOptions.runner
      }));
    }
  };

  const handleApproveCommand = (approved: boolean) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'approve_command',
        approved,
        commandId: commandPendingApproval?.commandId
      }));
      setCommandPendingApproval(null);
    }
  };

  const handleAbortWorkflow = () => {
    // Preserve any partially-streamed assistant text instead of discarding it,
    // so the user keeps what was generated before they hit STOP.
    const partial = streamingContent.trim();
    setIsStreaming(false);
    setStreamingContent('');
    setStreamingReasoning('');
    setActiveAgent('system');
    setCommandPendingApproval(null);
    setLogs(prev => [
      ...prev,
      ...(partial ? [{
        timestamp: new Date().toLocaleTimeString(),
        sender: 'assistant' as const,
        recipient: 'user' as const,
        message: `${partial}\n\n_(stopped)_`,
        type: 'info' as const
      }] : []),
      {
        timestamp: new Date().toLocaleTimeString(),
        sender: 'system',
        recipient: 'user',
        message: 'Stop requested. Current activity is being cancelled.',
        type: 'info'
      }
    ]);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'abort_execution' }));
    }
  };

  const handleSendToPlan = (text: string) => {
    const cleanText = text.replace(/<action[\s\S]*?>[\s\S]*?<\/action>/gi, '').trim();
    setPlanningInitialInput(cleanText);
    handleSpaceChange('plan');
  };

  const handleUpdateGithubConfig = (config: { githubToken?: string; githubRepoUrl?: string }) => {
    if (config.githubToken !== undefined) {
      setGithubToken(config.githubToken);
      saveCredentials({ githubToken: config.githubToken });
    }
    if (config.githubRepoUrl !== undefined) {
      setGithubRepoUrl(config.githubRepoUrl);
      localStorage.setItem('matrix_github_repo_url', config.githubRepoUrl);
      saveCredentials({ githubRepoUrl: config.githubRepoUrl });
    }
  };

  const handleAddPlanTasksToFlow = async (items: any[]) => {
    const now = new Date().toISOString();
    let flowTasks = tasks;
    const flowSessionId = activeProject ? `flow_board_${activeProject.id}` : 'flow_board';
    try {
      const res = await fetch(`http://localhost:3001/api/sessions/${flowSessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tasks)) {
          flowTasks = data.tasks;
        }
      }
    } catch {
      // Keep current in-memory tasks when the saved FLOW board has not been created yet.
    }
    const existingTitles = new Set(flowTasks.map(task => task.title.toLowerCase()));
    const importedTasks: ProjectTask[] = items
      .filter(item => item && item.title && item.title.trim())
      .filter(item => !existingTitles.has(item.title.trim().toLowerCase()))
      .map((item, index) => ({
        id: `plan_task_${Date.now()}_${index}`,
        title: item.title.trim(),
        status: 'todo',
        assignee: 'Builder',
        category: item.category || 'planning',
        source: item.githubIssueNumber ? `GitHub Issue #${item.githubIssueNumber}` : 'PLAN import',
        lastModified: now,
        workspace: item.workspace,
        blockedBy: item.blockedBy || [],
        acceptanceCriteria: item.acceptanceCriteria && item.acceptanceCriteria.length > 0 ? item.acceptanceCriteria : undefined,
        githubIssueNumber: item.githubIssueNumber,
        githubRepo: item.githubRepo,
        htmlUrl: item.htmlUrl
      }));

    const updatedTasks = [...flowTasks, ...importedTasks];
    setTasks(updatedTasks);
    setSelectedSessionId(flowSessionId);
    setActiveSpace('project');
    await persistFlowTasks(flowSessionId, updatedTasks);
    notify(`Added ${importedTasks.length} PLAN task(s) to FLOW.`, importedTasks.length > 0 ? 'success' : 'info');
  };

  const handleStartBuilding = async (payload: { projectName: string; workspaceFolder: string; description: string }) => {
    if (payload.workspaceFolder) handleUpdateConfig({ workspaceRoot: payload.workspaceFolder });
    if (payload.projectName) localStorage.setItem('matrix_project_name', payload.projectName);
    if (payload.description) localStorage.setItem('matrix_project_description', payload.description);
    localStorage.setItem('matrix_setup_done', 'true');
    localStorage.setItem('matrix_activation_repo', 'true');
    setActivationRevision(value => value + 1);
    // Create AND activate a real project so PLAN opens ready to use — the
    // Scratchbook requires an active project.
    try {
      const res = await fetch('http://localhost:3001/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payload.projectName || 'My Project',
          folderPath: payload.workspaceFolder,
          gitUrl: '',
          description: payload.description
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      await fetchProjects(data.project.id);
      await handleSelectProject(data.project);
    } catch (err: any) {
      notify(`Could not create the project (${err.message}). Use "Switch" in the header to retry.`, 'error');
    }
    setShowSetup(false);
    setActiveSpace('plan');
    if (payload.description) setPlanningInitialInput(payload.description);
    notify('Project set up. Describe and refine your build in PLAN.', 'success');
  };

  const handleRunDemo = async () => {
    const res = await fetch('http://localhost:3001/api/demo/start', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
    localStorage.setItem('matrix_setup_done', 'true');
    localStorage.setItem('matrix_activation_demo', 'true');
    setActivationRevision(value => value + 1);
    await fetchProjects(data.project.id);
    await handleSelectProject(data.project);
    setShowSetup(false);
    setActiveSpace('plan');
    notify('Demo trace passed without an API key. Open Build Loop to inspect the proof.', 'success');
  };

  const handleSendPlanItemToForge = (title: string) => {
    setActiveSpace('code');
    handleSendQuery(`Execute this PLAN item in FORGE with normal command approval and review evidence:\n\n${title}`, 'code');
  };

  const handleConfirmTraceComplete = async (taskId: string) => {
    const now = new Date().toISOString();
    let flowTasks = tasks;
    const flowSessionId = activeProject ? `flow_board_${activeProject.id}` : 'flow_board';
    try {
      const res = await fetch(`http://localhost:3001/api/sessions/${flowSessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tasks)) flowTasks = data.tasks;
      }
    } catch {
      // Fall back to in-memory tasks if the saved FLOW board is unavailable.
    }
    let found = false;
    const updatedTasks = flowTasks.map(task => {
      if (task.id !== taskId) return task;
      found = true;
      return { ...task, status: 'done' as const, driftStatus: 'complete' as const, lastModified: now };
    });
    if (!found) {
      notify('Could not find the plan item to confirm. Reopen FLOW and retry.', 'error');
      return;
    }
    setTasks(updatedTasks);
    await persistFlowTasks(flowSessionId, updatedTasks);
    notify('Plan item confirmed complete from trace evidence.', 'success');
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStreaming) return;
    try {
      const res = await fetch(`http://localhost:3001/api/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchSessions();
        if (selectedSessionId === sessionId) {
          setSelectedSessionId(null);
          setLogs([]);
          setChecklist([]);
          setTasks([]);
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const handleNewSession = () => {
    if (isStreaming) return;
    setSelectedSessionId(null);
    setLogs([]);
    setChecklist([]);
    setTasks([]);
    if (activeSpace === 'plan') {
      setPlanningInitialInput('');
      setPlanningResetKey(prev => prev + 1);
    }
  };

  const handleSaveTasks = (updatedTasks: ProjectTask[]) => {
    setTasks(updatedTasks);
    const flowSessionId = activeProject ? `flow_board_${activeProject.id}` : 'flow_board';
    persistFlowTasks(flowSessionId, updatedTasks);
  };

  const handleSaveAgents = (updatedAgents: Array<{ name: string; role: string; prompt: string }>) => {
    setCustomAgents(updatedAgents);
    if (selectedSessionId && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'save_agents',
        sessionId: selectedSessionId,
        customAgents: updatedAgents
      }));
    }
  };

  const handleOpenAppGraphPreview = async (filePath: string) => {
    try {
      const res = await fetch(`http://localhost:3001/api/files/content?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      setAppGraphPreviewFile({ path: filePath, content: data.content || '' });
      setAppGraphEditedContent(data.content || '');
      setIsAppGraphEditing(false);
    } catch (err: any) {
      notify(`Failed to load file: ${err.message}`, 'error');
    }
  };

  const handleSaveAppGraphFile = async () => {
    if (!appGraphPreviewFile) return;
    try {
      const res = await fetch('http://localhost:3001/api/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: appGraphPreviewFile.path,
          content: appGraphEditedContent
        })
      });
      if (res.ok) {
        setAppGraphPreviewFile({ path: appGraphPreviewFile.path, content: appGraphEditedContent });
        setIsAppGraphEditing(false);
        notify('File saved successfully.', 'success');
      } else {
        const data = await res.json();
        notify(`Failed to save file: ${data.error}`, 'error');
      }
    } catch (err: any) {
      notify(`Error saving file: ${err.message}`, 'error');
    }
  };

  const handlePinAppFile = (fileName: string) => {
    const inputField = document.querySelector('textarea') as HTMLTextAreaElement;
    if (inputField) {
      const start = inputField.selectionStart;
      const end = inputField.selectionEnd;
      const val = inputField.value;
      const before = val.substring(0, start);
      const after = val.substring(end);
      const insertText = `@${fileName} `;
      inputField.value = before + insertText + after;
      
      const event = new Event('input', { bubbles: true });
      inputField.dispatchEvent(event);
      inputField.focus();
    } else {
      notify(`Pinned context: @${fileName}`, 'info');
    }
  };

  const handleStartCollabSession = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      notify('WebSocket connection is not open.', 'warning');
      return;
    }
    if (collabActive) {
      socketRef.current.send(JSON.stringify({ type: 'leave_collab_room' }));
      setCollabActive(false);
    } else {
      socketRef.current.send(JSON.stringify({
        type: 'join_collab_room'
      }));
    }
  };

  useEffect(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'config',
        apiKey,
        geminiApiKey,
        openaiApiKey,
        anthropicApiKey,
        openrouterApiKey,
        ollamaUrl,
        useSearch,
        model,
        fastModel,
        customInstructions,
        responseMode,
        workspaceRoot
      }));
    }
  }, [
    apiKey,
    geminiApiKey,
    openaiApiKey,
    anthropicApiKey,
    openrouterApiKey,
    ollamaUrl,
    useSearch,
    model,
    fastModel,
    customInstructions,
    responseMode,
    workspaceRoot
  ]);

  return (
    <ErrorBoundary>
    <>
      <div className="app-container">
        
        {/* Sleek Top Config Bar */}
        <div className="forge-topbar flex items-center justify-between px-3 py-1 font-mono text-xs flex-wrap gap-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="forge-secondary-button"
              title="Toggle Sidebar"
            >
              {sidebarOpen ? 'Hide' : 'Show'}
            </button>
            <ZelorynLockup size="sm" />

            {/* Header Context Breadcrumb & Workspace Switcher */}
            <div className="flex items-center gap-1.5 ml-3 select-none text-[10px] font-mono">
              <button
                type="button"
                data-testid="add-project-button"
                aria-label={activeProject ? `Project: ${activeProject.name}` : "Add project"}
                onClick={() => setIsProjectModalOpen(true)}
                title="Switch active project or open workspace folder"
                className="flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-200 hover:text-white transition-colors cursor-pointer"
              >
                <FolderOpen size={11} className="text-zinc-400" />
                <span className="font-semibold truncate max-w-[110px]">
                  {activeProject?.name || workspaceRoot.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Workspace'}
                </span>
              </button>

              <span className="text-zinc-600">/</span>

              <button
                type="button"
                onClick={() => setIsDiffDrawerOpen(true)}
                title="View git branch status & diff undo safety drawer"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
              >
                <GitBranch size={10} />
                <span className="font-semibold">{currentGitBranch}</span>
              </button>

              <span className="text-zinc-600">/</span>

              <div
                title={`Active AI Model: ${model}`}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900/40 text-cyan-400 truncate max-w-[130px]"
              >
                <Cpu size={10} className="text-cyan-500 shrink-0" />
                <span className="truncate">{model.replace(/^models\//, '')}</span>
              </div>

              {/* Safety Diff Trigger */}
              <button
                type="button"
                onClick={() => setIsDiffDrawerOpen(true)}
                title="Inspect recent file modifications and safely Undo (Diff & Undo Drawer)"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer text-[9px] font-bold"
              >
                <ShieldAlert size={10} />
                <span>Diff &amp; Undo</span>
              </button>

              {/* Command Palette Trigger */}
              <button
                type="button"
                onClick={() => setIsCommandPaletteOpen(true)}
                title="Open Command Palette (Ctrl+K / Cmd+K)"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer text-[10px]"
              >
                <Search size={10} className="text-zinc-400" />
                <span className="text-[9px] text-zinc-400 font-bold bg-zinc-900 px-1 rounded border border-zinc-700">Ctrl+K</span>
              </button>
            </div>

            {/* Switchable Spaces tab bar */}
            <div className="forge-tabs ml-3">
              <button
                onClick={() => handleSpaceChange('plan')}
                disabled={isStreaming}
                className={`forge-tab transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${activeSpace === 'plan' ? 'forge-tab-active' : ''}`}
                title="Plan (F1)"
              >
                Plan
              </button>
              <button
                onClick={() => handleSpaceChange('cowork')}
                disabled={isStreaming}
                className={`forge-tab transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${activeSpace === 'cowork' ? 'forge-tab-active' : ''}`}
                title="Crew (F2)"
              >
                Crew
              </button>
              <button
                onClick={() => handleSpaceChange('project')}
                disabled={isStreaming}
                className={`forge-tab transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${activeSpace === 'project' ? 'forge-tab-active' : ''}`}
                title="Flow (F3)"
              >
                Flow
              </button>
              <button
                onClick={() => handleSpaceChange('code')}
                disabled={isStreaming}
                className={`forge-tab transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${activeSpace === 'code' ? 'forge-tab-active' : ''}`}
                title="Forge (F4)"
              >
                Forge
              </button>
              <button
                onClick={() => handleSpaceChange('vibe')}
                disabled={isStreaming}
                className={`forge-tab transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${activeSpace === 'vibe' ? 'forge-tab-active text-forge-neon font-bold' : ''}`}
                title="Vibe Coding Studio (F5)"
              >
                <Sparkles size={11} className="text-emerald-400" />
                <span>Vibe</span>
              </button>

              {isStreaming && (
                <button
                  type="button"
                  onClick={handleAbortWorkflow}
                  className="forge-stop-button transition-all cursor-pointer ml-2"
                >
                  Stop
                </button>
              )}
            </div>
          </div>
          
          <ConfigHeader
            apiKey={apiKey}
            geminiApiKey={geminiApiKey}
            openaiApiKey={openaiApiKey}
            anthropicApiKey={anthropicApiKey}
            openrouterApiKey={openrouterApiKey}
            ollamaUrl={ollamaUrl}
            customApiKey={customApiKey}
            customBaseUrl={customBaseUrl}
            customProviderName={customProviderName}
            customModels={customModels}
            anthropicBaseUrl={anthropicBaseUrl}
            openaiBaseUrl={openaiBaseUrl}
            geminiBaseUrl={geminiBaseUrl}
            useSearch={useSearch}
            model={model}
            fastModel={fastModel}
            workspaceRoot={workspaceRoot}
            isConnected={isConnected}
            theme={theme}
            customInstructions={customInstructions}
            responseMode={responseMode}
            thinkingCapability={thinkingCapability}
            isGoogleLinked={isGoogleLinked}
            isSyncingGoogle={isSyncingGoogle}
            onUpdateGoogleStatus={fetchGoogleStatus}
            githubToken={githubToken}
            githubRepoUrl={githubRepoUrl}
            onOpenGuide={() => setIsTutorialOpen(true)}
            onUpdateConfig={handleUpdateConfig}
            piiFilterEnabled={piiFilterEnabled}
            onTogglePiiFilter={(val) => {
              setPiiFilterEnabled(val);
              localStorage.setItem('matrix_pii_filter_enabled', String(val));
            }}
            workspacePaths={workspacePaths}
            onUpdateWorkspacePaths={(paths) => {
              setWorkspacePaths(paths);
              localStorage.setItem('matrix_workspace_paths', JSON.stringify(paths));
            }}
            telemetry={telemetry}
            collabActive={collabActive}
            onStartCollabSession={handleStartCollabSession}
            onNotify={notify}
            zeroEgressMode={zeroEgressMode}
            privacyMode={privacyMode}
            modelRoles={modelRoles}
            customPricing={customPricing}
            syncedCatalog={syncedCatalog}
          />
        </div>

        {/* Console Workspace Workspace */}
        <main className="main-content">
          
          {/* Collapsible Left Side Deck (Directives & Sessions List) */}
          <aside className={`left-sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
            
            {/* Project List (Persistent Projects) */}
            <div className="forge-sidebar-section flex flex-col font-mono max-h-[240px] min-h-[160px]">
              <div className="flex items-center justify-between mb-2">
                <span className="forge-section-title">
                  Projects
                </span>
                <button
                  onClick={() => {
                    setIsProjectModalOpen(true);
                    setIsCreateProjectOpen(true);
                  }}
                  disabled={isStreaming}
                  className="forge-secondary-button flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="New Project"
                  type="button"
                >
                  <Plus size={12} />
                  <span>New Plan</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto text-[11px] space-y-1 pr-1">
                {projects.length === 0 ? (
                  <span className="text-forge-dim italic">No saved projects yet</span>
                ) : (
                  projects.map((p) => {
                    const isActive = p.id === activeProject?.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectProject(p)}
                        className={`flex items-center justify-between gap-2 p-1 rounded cursor-pointer group hover:bg-forge-very-dark ${isActive ? 'text-forge-neon bg-forge-very-dark font-bold border border-forge-dark' : 'text-forge-text'}`}
                      >
                        <span className="truncate flex-1 text-[10px]" title={p.name}>
                          {p.name}
                        </span>
                        <button
                          onClick={(e) => handleDeleteProject(p.id, e)}
                          disabled={isStreaming}
                          className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-forge-dim transition-opacity disabled:opacity-0 bg-transparent border-0 outline-none cursor-pointer"
                          title="Delete project"
                          type="button"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Directives Checklist (Only for CODE and COWORK) */}
            {activeSpace !== 'chat' && (
              <div className="p-3 flex flex-col font-mono flex-1 overflow-hidden">
                <span className="forge-section-title mb-1.5 block">
                  Current run
                </span>
                <div className="flex-1 overflow-y-auto text-[11px] space-y-1 pr-1">
                  {checklist.length === 0 ? (
                    <span className="text-forge-dim italic">No active checklist</span>
                  ) : (
                    checklist
                      .filter((item): item is string => typeof item === 'string')
                      .map((item, idx) => {
                        const isChecked = item.startsWith('[x]') || item.includes('[x]');
                        const isProgress = item.startsWith('[/]') || item.includes('[/]');
                        
                        let textClass = 'text-forge-dim';
                        let symbol = '[~]';
                        
                        if (isChecked) {
                          textClass = 'line-through text-forge-dim opacity-40';
                          symbol = '[x]';
                        } else if (isProgress) {
                          textClass = 'text-forge-neon font-bold animate-pulse';
                          symbol = '[~]';
                        } else if (item.startsWith('[ ]')) {
                          textClass = 'text-forge-text';
                          symbol = '[ ]';
                        }

                        const cleanItem = (item.replace(/^\[[x\s/]*\]\s*/, '') || '').trim();

                        return (
                          <div key={idx} className={`flex items-start gap-1.5 ${textClass}`}>
                            <span>{symbol}</span>
                            <span className="truncate">{cleanItem}</span>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            )}

          </aside>

        {/* Switchable Workspaces Render Tree */}
          <Suspense fallback={<SpaceLoading />}>
          {activeSpace === 'vibe' ? (
            <div className="flex-1 overflow-hidden h-full w-full flex flex-col">
              <VibeStudio
                activeProject={activeProject}
                workspaceRoot={workspaceRoot}
                isStreaming={isStreaming}
                streamingContent={streamingContent}
                logs={logs}
                tasks={tasks}
                onSaveTasks={handleSaveTasks}
                selectedTaskId={selectedVibeTaskId}
                onSelectTask={setSelectedVibeTaskId}
                onSendQuery={(query) => handleSendQuery(query, 'code')}
                onAbort={handleAbortWorkflow}
                onNotify={notify}
                onSwitchToPro={(space) => handleSpaceChange(space)}
                onOpenProjectModal={() => setIsProjectModalOpen(true)}
              />
            </div>
          ) : activeSpace === 'chat' ? (
            /* Space 1: Focused Standard Chat view */
            <section className="main-terminal p-3 flex flex-col gap-3 flex-1 overflow-hidden bg-forge-panel-bg">
              <div className="flex-1 overflow-hidden max-w-4xl mx-auto w-full">
                <ChatConsole
                  logs={logs}
                  isStreaming={isStreaming}
                  streamingReasoning={streamingReasoning}
                  streamingContent={streamingContent}
                  activeAgent={activeAgent}
                  onSendQuery={handleSendQuery}
                  commandPendingApproval={commandPendingApproval}
                  onApproveCommand={handleApproveCommand}
                  onSendToPlan={handleSendToPlan}
                  onAbort={handleAbortWorkflow}
                />
              </div>
            </section>
          ) : activeSpace === 'code' ? (
            /* Space 2: Sandbox split layout (Console + Collapsible File Explorer) */
            <div className="flex-1 flex overflow-hidden">
              <section className="main-terminal p-3 flex flex-col gap-3 flex-1 overflow-hidden">
                <div className="flex items-center justify-between font-mono">
                  <AgentDashboard activeAgent={activeAgent} isStreaming={isStreaming} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <ChatConsole
                    logs={logs}
                    isStreaming={isStreaming}
                    streamingReasoning={streamingReasoning}
                    streamingContent={streamingContent}
                    activeAgent={activeAgent}
                    onSendQuery={handleSendQuery}
                    commandPendingApproval={commandPendingApproval}
                    onApproveCommand={handleApproveCommand}
                    onSendToPlan={handleSendToPlan}
                    onAbort={handleAbortWorkflow}
                  />
                </div>
              </section>

              <PreviewDeck
                ws={ws}
                isConnected={isConnected}
                workspaceRoot={workspaceRoot}
                logs={logs}
                isStreaming={isStreaming}
                commandPendingApproval={commandPendingApproval}
                onUpdateWorkspaceRoot={newPath => handleUpdateConfig({ workspaceRoot: newPath })}
                onOpenFilePreview={handleOpenAppGraphPreview}
                onPinFile={handlePinAppFile}
                onNotify={notify}
              />
            </div>
          ) : activeSpace === 'cowork' ? (
            /* Space 3: Coworking Control center */
            <div className="flex-1 overflow-hidden">
              <CoworkSpace
                logs={logs}
                tasks={tasks}
                customAgents={customAgents}
                localSkills={localSkills}
                localAgents={localAgents}
                isStreaming={isStreaming}
                streamingReasoning={streamingReasoning}
                streamingContent={streamingContent}
                activeAgent={activeAgent}
                workspaceRoot={workspaceRoot}
                onSaveTasks={handleSaveTasks}
                onSaveAgents={handleSaveAgents}
                onSendQuery={handleSendQuery}
                onUpdateWorkspaceRoot={newPath => handleUpdateConfig({ workspaceRoot: newPath })}
                commandPendingApproval={commandPendingApproval}
                onApproveCommand={handleApproveCommand}
                onNotify={notify}
                onAbort={handleAbortWorkflow}
                onCreateProject={handleCreateProject}
                onOpenVibeTask={(taskId) => {
                  setSelectedVibeTaskId(taskId);
                  handleSpaceChange('vibe');
                }}
                onSendToForge={(taskTitle) => {
                  handleSendQuery(taskTitle, 'code');
                }}
              />
            </div>
          ) : activeSpace === 'project' ? (
            /* Space 4: Project Management Kanban Board */
            <div className="flex-1 overflow-hidden">
              <ProjectBoard
                tasks={tasks}
                isStreaming={isStreaming}
                workspaceRoot={workspaceRoot}
                onSaveTasks={handleSaveTasks}
                onSendQuery={handleSendQuery}
                onOpenVibeTask={(taskId) => {
                  setSelectedVibeTaskId(taskId);
                  handleSpaceChange('vibe');
                }}
                onUpdateWorkspaceRoot={newPath => handleUpdateConfig({ workspaceRoot: newPath })}
                onNotify={notify}
                onAbort={handleAbortWorkflow}
                installedAgents={[...customAgents, ...localAgents].map(a => ({
                  name: a.name,
                  role: a.role,
                  primaryCategory: (a as any).primaryCategory,
                  capabilities: (a as any).capabilities
                }))}
              />
            </div>
          ) : (
            /* Space 5: Interactive Planning Screen */
            <div className="flex-1 overflow-hidden">
              <PlanningScreen
                sessionId={selectedSessionId || 'planning_session'}
                activeProject={activeProject}
                workspaceRoot={workspaceRoot}
                onSendQuery={handleSendQuery}
                logs={logs}
                isStreaming={isStreaming}
                streamingContent={streamingContent}
                initialInput={planningInitialInput}
                onClearInitialInput={() => setPlanningInitialInput('')}
                workspacePaths={workspacePaths}
                onUpdateWorkspacePaths={(paths: string[]) => {
                  setWorkspacePaths(paths);
                  localStorage.setItem('matrix_workspace_paths', JSON.stringify(paths));
                }}
                onAddTasksToFlow={handleAddPlanTasksToFlow}
                onSendPlanItemToForge={handleSendPlanItemToForge}
                tasks={tasks}
                onConfirmComplete={handleConfirmTraceComplete}
                onNotify={notify}
                onAbort={handleAbortWorkflow}
                resetKey={planningResetKey}
                githubToken={githubToken}
                githubRepoUrl={githubRepoUrl}
                onUpdateGithubConfig={handleUpdateGithubConfig}
                activeModel={model}
                zeroEgressMode={zeroEgressMode}
                onUpdateConfig={handleUpdateConfig}
              />
            </div>
          )}
          </Suspense>

         </main>
         
         {/* One-time hosted-provider data disclosure */}
         {pendingDisclosure && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono select-none">
             <div className="w-full max-w-md border border-amber-600 rounded bg-forge-panel-bg p-5 flex flex-col gap-3">
               <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                 Data Disclosure — {pendingDisclosure.provider}
               </span>
               <p className="text-[11px] text-forge-text leading-relaxed m-0">
                 This request will send your prompt — and any referenced workspace
                 context — to <strong>{pendingDisclosure.provider}</strong> using your
                 own API key. Data leaves your machine and is handled under that
                 provider's terms. This notice is shown once per provider.
               </p>
               <p className="text-[10px] text-forge-dim m-0">
                 Prefer fully local? Enable Zero Egress Mode in CONFIG or switch to an
                 Ollama model.
               </p>
               <div className="flex gap-2 justify-end">
                 <button
                   type="button"
                   onClick={() => setPendingDisclosure(null)}
                   className="forge-btn text-[10px] uppercase"
                 >
                   Cancel
                 </button>
                 <button
                   type="button"
                   onClick={confirmDisclosure}
                   className="forge-btn text-[10px] uppercase border-amber-600 text-amber-300"
                 >
                   Acknowledge &amp; Continue
                 </button>
               </div>
             </div>
           </div>
         )}

         {/* Project Manager Modal */}
         {isProjectModalOpen && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono select-none">
             <div className="w-full max-w-lg border border-forge-neon rounded bg-forge-panel-bg p-5 flex flex-col max-h-[85vh]">
               <div className="flex justify-between items-center border-b border-forge-dark pb-2">
                 <span className="text-xs font-bold text-forge-neon uppercase tracking-wider flex items-center gap-1.5">
                   <FolderOpen size={14} className="text-forge-neon" />
                   <span>Project Workspace Manager</span>
                 </span>
                 <button
                   type="button"
                   onClick={() => {
                     setIsProjectModalOpen(false);
                     setIsCreateProjectOpen(false);
                   }}
                   className="text-forge-dim hover:text-white cursor-pointer bg-transparent border-0 outline-none"
                 >
                   <X size={16} />
                 </button>
               </div>

               {isCreateProjectOpen ? (
                 <div className="my-3 space-y-3 flex-1 overflow-y-auto pr-1">
                   <div className="text-[10px] text-forge-dim">
                     Create a new plan / project by selecting a directory. If you specify a GitHub repository URL, it will be cloned into the directory if not already git-initialized.
                   </div>
                   <div className="flex flex-col gap-1">
                     <label className="text-[9px] text-forge-dim uppercase">Project Name</label>
                     <input
                       type="text"
                       id="proj-name-input"
                       placeholder="My SAAS Product"
                       className="forge-input text-[11px] bg-forge-very-dark border-forge-dark text-forge-text px-2.5 py-1.5"
                     />
                   </div>
                   <div className="flex flex-col gap-1">
                     <label className="text-[9px] text-forge-dim uppercase">Project Folder Path (Absolute)</label>
                     <div className="flex gap-1.5">
                       <input
                         type="text"
                         id="proj-folder-input"
                         placeholder="C:/Users/.../MyProject"
                         className="forge-input text-[11px] bg-forge-very-dark border-forge-dark text-forge-text px-2.5 py-1.5 flex-1"
                       />
                       {(window as any).electronAPI && (
                         <button
                           type="button"
                           onClick={async () => {
                             try {
                               const selectedPath = await (window as any).electronAPI.selectDirectory();
                               if (selectedPath) {
                                 const el = document.getElementById('proj-folder-input') as HTMLInputElement;
                                 if (el) {
                                   const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                                   nativeInputValueSetter?.call(el, selectedPath);
                                   el.dispatchEvent(new Event('input', { bubbles: true }));
                                 }
                               }
                             } catch (err: any) {
                               notify(`Failed to browse: ${err.message}`, 'error');
                             }
                           }}
                           className="forge-btn text-[9px] px-2.5 py-1.5 font-bold font-mono flex items-center gap-1 shrink-0"
                           title="Browse for project folder"
                         >
                           <FolderOpen size={11} />
                           <span>BROWSE</span>
                         </button>
                       )}
                     </div>
                   </div>
                   <div className="flex flex-col gap-1">
                     <label className="text-[9px] text-forge-dim uppercase">GitHub Repository URL (Optional)</label>
                     <input
                       type="text"
                       id="proj-git-input"
                       placeholder="https://github.com/username/repo"
                       className="forge-input text-[11px] bg-forge-very-dark border-forge-dark text-forge-text px-2.5 py-1.5"
                     />
                   </div>
                   <div className="flex flex-col gap-1">
                     <label className="text-[9px] text-forge-dim uppercase">Project Description (Optional)</label>
                     <textarea
                       id="proj-desc-input"
                       placeholder="What is this project about?"
                       rows={3}
                       className="forge-input text-[11px] bg-forge-very-dark border-forge-dark text-forge-text px-2.5 py-1.5 resize-none animate-none"
                     />
                   </div>

                   <div className="flex justify-end gap-2 border-t border-forge-dark pt-3">
                     <button
                       type="button"
                       onClick={() => setIsCreateProjectOpen(false)}
                       className="forge-secondary-button text-[10px] py-1.5 px-3"
                     >
                       Back
                     </button>
                     <button
                       type="button"
                       onClick={() => {
                         const name = (document.getElementById('proj-name-input') as HTMLInputElement)?.value;
                         const folder = (document.getElementById('proj-folder-input') as HTMLInputElement)?.value;
                         const git = (document.getElementById('proj-git-input') as HTMLInputElement)?.value;
                         const desc = (document.getElementById('proj-desc-input') as HTMLTextAreaElement)?.value;
                         if (!name || !folder) {
                           notify('Name and Folder Path are required.', 'error');
                           return;
                         }
                         handleCreateProject(name, folder, git, desc);
                         setIsCreateProjectOpen(false);
                       }}
                       className="forge-btn text-[10px] py-1.5 px-4 font-bold"
                     >
                       Create Plan/Project
                     </button>
                   </div>
                 </div>
               ) : (
                 <div className="my-3 flex-1 flex flex-col min-h-[300px]">
                   <div className="flex justify-between items-center mb-2">
                     <span className="text-[10px] text-forge-dim font-bold uppercase">All Projects</span>
                     <button
                       type="button"
                       onClick={() => setIsCreateProjectOpen(true)}
                       className="text-[9px] bg-forge-neon text-black font-bold px-2 py-1 rounded hover:bg-white cursor-pointer border-0 outline-none"
                     >
                       + ADD NEW PROJECT
                     </button>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[350px]">
                     {projects.length === 0 ? (
                       <div className="text-center py-10 text-forge-dim italic text-[11px] border border-forge-dark border-dashed rounded">
                         No projects defined. Click "+ Add New Project" to add your first project.
                       </div>
                     ) : (
                       projects.map(p => {
                         const isAct = p.id === activeProject?.id;
                         return (
                           <div
                             key={p.id}
                             onClick={() => handleSelectProject(p)}
                             className={`border rounded p-3 bg-black/45 cursor-pointer transition-all hover:border-forge-neon flex flex-col gap-1.5 ${
                               isAct ? 'border-forge-neon' : 'border-forge-dark'
                             }`}
                           >
                             <div className="flex justify-between items-start">
                               <span className="text-xs font-bold text-white uppercase">{p.name}</span>
                               <div className="flex gap-2">
                                 <button
                                   type="button"
                                   onClick={(e) => handleDeleteProject(p.id, e)}
                                   className="text-red-400 hover:text-white text-[9px] bg-transparent border-0 outline-none cursor-pointer"
                                 >
                                   Delete
                                 </button>
                               </div>
                             </div>
                             <div className="text-[9px] text-forge-neon truncate">Folder: {p.workspaceFolder}</div>
                             {p.gitUrl && <div className="text-[9px] text-cyan-400 truncate">Git: {p.gitUrl}</div>}
                             {p.description && <div className="text-[10px] text-forge-dim line-clamp-2 mt-0.5">{p.description}</div>}
                           </div>
                         );
                       })
                     )}
                   </div>
                 </div>
               )}
             </div>
           </div>
         )}

        <Suspense fallback={null}>
         {showSetup && (
          <div className="fixed inset-0 z-[60] bg-forge-very-dark flex">
            <ProjectSetupScreen
              defaultWorkspace={workspaceRoot}
              hasProvider={Boolean(apiKey || geminiApiKey || openaiApiKey || anthropicApiKey || openrouterApiKey || ollamaDetected)}
              onStart={handleStartBuilding}
              onRunDemo={handleRunDemo}
              onUpdateWorkspaceRoot={(newPath) => handleUpdateConfig({ workspaceRoot: newPath })}
              onOpenConfig={() => {
                localStorage.setItem('matrix_setup_done', 'true');
                setShowSetup(false);
                window.dispatchEvent(new CustomEvent('open-config-drawer', { detail: { tab: 'api_keys' } }));
              }}
            />
          </div>
        )}
        <OnboardingTutorial
          isOpen={isTutorialOpen && !showSetup}
          onClose={() => {
            localStorage.setItem('matrix_tutorial_completed', 'true');
            setIsTutorialOpen(false);
          }}
        />
        </Suspense>
        <NotificationCenter
          notifications={notifications}
          onDismiss={(id) => setNotifications(prev => prev.filter(notification => notification.id !== id))}
        />
        {!showSetup && (() => {
          void activationRevision;
          const hasModel = Boolean(apiKey || geminiApiKey || openaiApiKey || anthropicApiKey || openrouterApiKey || ollamaDetected);
          const hasDemo = localStorage.getItem('matrix_activation_demo') === 'true';
          const hasRepo = localStorage.getItem('matrix_activation_repo') === 'true' || Boolean(activeProject && activeProject.id !== 'project_demo');

          return (
            <ActivationChecklist
              hasModel={hasModel}
              isDemoDone={hasDemo}
              isRepoDone={hasRepo}
              onConnectModel={() => {
                window.dispatchEvent(new CustomEvent('open-config-drawer', { detail: { tab: 'api_keys' } }));
              }}
              onRunDemo={handleRunDemo}
              onPointAtRepo={() => {
                setIsProjectModalOpen(true);
                setIsCreateProjectOpen(true);
              }}
            />
          );
        })()}

        {/* App Visualizer file preview / editor modal */}
        {appGraphPreviewFile && (
          <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4 backdrop-blur-sm font-mono">
            <div className="forge-panel w-full max-w-2xl p-5 bg-forge-very-dark border border-forge-neon flex flex-col gap-3 max-h-[85vh]">
              <div className="flex items-center justify-between border-b border-forge-dark pb-2 mb-1">
                <span className="text-[11px] font-bold text-forge-neon uppercase tracking-wider truncate max-w-lg">
                  PREVIEW & EDIT: {appGraphPreviewFile.path}
                </span>
                <button 
                  onClick={() => setAppGraphPreviewFile(null)}
                  className="text-forge-dim hover:text-white font-bold text-xs"
                  type="button"
                >
                  CLOSE
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col">
                {isAppGraphEditing ? (
                  <textarea
                    value={appGraphEditedContent}
                    onChange={(e) => setAppGraphEditedContent(e.target.value)}
                    className="w-full flex-1 bg-black border border-forge-dark text-[10px] text-forge-neon p-2 font-mono outline-none resize-none"
                  />
                ) : (
                  <pre className="w-full flex-1 bg-black border border-forge-dark text-[10px] text-forge-text p-2 font-mono overflow-auto whitespace-pre-wrap select-text">
                    {appGraphPreviewFile.content}
                  </pre>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-forge-dark pt-3">
                {isAppGraphEditing ? (
                  <>
                    <button
                      onClick={() => setIsAppGraphEditing(false)}
                      className="px-3 py-1 border border-forge-dark text-forge-dim hover:text-white text-[10px] font-bold rounded"
                      type="button"
                    >
                      CANCEL
                    </button>
                    <button
                      onClick={handleSaveAppGraphFile}
                      className="forge-btn text-[10px] font-bold px-3 py-1"
                      type="button"
                    >
                      SAVE CHANGES
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setIsAppGraphEditing(true)}
                      className="forge-btn text-[10px] font-bold px-3 py-1"
                      type="button"
                    >
                      EDIT FILE
                    </button>
                    <button
                      onClick={() => {
                        handlePinAppFile(appGraphPreviewFile.path);
                        setAppGraphPreviewFile(null);
                      }}
                      className="forge-btn text-[10px] font-bold px-3 py-1"
                      type="button"
                    >
                      PIN FILE
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Universal Command Palette (Ctrl+K / Cmd+K) */}
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onNavigate={handleSpaceChange}
          onOpenProjectModal={() => setIsProjectModalOpen(true)}
          onOpenSettings={() => {
            window.dispatchEvent(new CustomEvent('open-config-drawer', { detail: { tab: 'api_keys' } }));
          }}
          onSelectTheme={(newTheme) => handleUpdateConfig({ theme: newTheme })}
          tasks={tasks}
          onSelectTask={() => {
            handleSpaceChange('project');
          }}
          onAnalyzeCodebase={handleAnalyzeCodebase}
          onImportTodos={handleImportTodosFromPalette}
          onCheckDrift={() => {
            handleSpaceChange('project');
          }}
          onBrowseFolder={handleNativeBrowseFolder}
        />

        {/* Diff & Undo Safety Drawer */}
        <DiffSafetyDrawer
          isOpen={isDiffDrawerOpen}
          onClose={() => setIsDiffDrawerOpen(false)}
          onNotify={notify}
        />
      </div>
    </>
    </ErrorBoundary>
  );
}

export default App;
