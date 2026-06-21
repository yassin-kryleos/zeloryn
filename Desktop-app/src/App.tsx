import { useState, useEffect, useRef, useCallback, lazy, Suspense, Component, type ErrorInfo, type ReactNode } from 'react';
import { ConfigHeader } from './components/ConfigHeader';
import { ChatConsole } from './components/ChatConsole';
import { AgentDashboard } from './components/AgentDashboard';
import { NotificationCenter, type AppNotification, type NotificationKind } from './components/NotificationCenter';
import { hostedProviderForModel } from './shared/providerDisclosure';
import { redactSensitiveData } from './shared/redact';

// Heavy / conditional components: lazy-load to keep the initial chunk below 500 kB.
const CoworkSpace = lazy(() => import('./components/CoworkSpace').then(m => ({ default: m.CoworkSpace })));
const ProjectBoard = lazy(() => import('./components/ProjectBoard').then(m => ({ default: m.ProjectBoard })));
const PlanningScreen = lazy(() => import('./components/PlanningScreen').then(m => ({ default: m.PlanningScreen })));
const PreviewDeck = lazy(() => import('./components/PreviewDeck').then(m => ({ default: m.PreviewDeck })));
const OnboardingTutorial = lazy(() => import('./components/OnboardingTutorial').then(m => ({ default: m.OnboardingTutorial })));
const ProjectSetupScreen = lazy(() => import('./components/ProjectSetupScreen').then(m => ({ default: m.ProjectSetupScreen })));

const SpaceLoading = () => (
  <div className="flex-1 flex items-center justify-center text-forge-dim text-xs font-mono">
    Loading workspace…
  </div>
);
import { Trash2, Plus, Cpu, FolderOpen, X } from 'lucide-react';
import type { AgentLog, AgentRole, ResponseMode } from './backend/agents';
import type { ProjectTask } from './backend/db';
 
interface SessionMeta {
  id: string;
  title: string;
  createdAt: string;
}

// Region-based payment routing: India-locale users pay via Razorpay (INR),
// everyone else via Stripe (USD). Defaults to Stripe if locale is undetermined.
function isIndianLocale(): boolean {
  try {
    const locale = Intl.NumberFormat().resolvedOptions().locale;
    return locale === 'en-IN' || locale === 'hi-IN' || locale.toLowerCase().endsWith('-in');
  } catch {
    return false;
  }
}

let razorpayScriptPromise: Promise<boolean> | null = null;

function loadRazorpayCheckoutScript(): Promise<boolean> {
  if ((window as any).Razorpay) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      razorpayScriptPromise = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
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
  const [ollamaDetected, setOllamaDetected] = useState(false);
  const [activationRevision, setActivationRevision] = useState(0);
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('');
  const [theme, setTheme] = useState<string>(() => {
    const saved = localStorage.getItem('matrix_theme');
    // theme-forge is the shipped default (professional dark, green accents).
    // theme-forge-legacy remains available as an opt-in toggle. Map the retired
    // 'slate' alias onto forge.
    if (!saved || saved === 'slate') {
      return 'forge';
    }
    return saved;
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
  const loginInFlightRef = useRef(false);

  const notify = useCallback((message: string, kind: NotificationKind = 'info') => {
    const id = notificationIdRef.current++;
    setNotifications(prev => [...prev.slice(-3), { id, kind, message }]);
    window.setTimeout(() => {
      setNotifications(prev => prev.filter(notification => notification.id !== id));
    }, kind === 'error' ? 7000 : 4500);
  }, []);

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
  const [activeSpace, setActiveSpace] = useState<'code' | 'chat' | 'cowork' | 'project' | 'plan'>(
    () => (localStorage.getItem('matrix_setup_done') === 'true' ? 'project' : 'plan')
  );
  const [showSetup, setShowSetup] = useState<boolean>(() => localStorage.getItem('matrix_setup_done') !== 'true');
  const [appGraphPreviewFile, setAppGraphPreviewFile] = useState<{ path: string; content: string } | null>(null);
  const [isAppGraphEditing, setIsAppGraphEditing] = useState<boolean>(false);
  const [appGraphEditedContent, setAppGraphEditedContent] = useState<string>('');
  const [user, setUser] = useState<{ email: string; token: string; isPremium: boolean; tier?: string; billingProvider?: 'stripe' | 'razorpay' | 'license' } | null>(() => {
    const saved = localStorage.getItem('matrix_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [syncStatus, setSyncStatus] = useState<string>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string>(() => localStorage.getItem('matrix_last_sync') || '');
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
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>('planning_session');
  const [commandPendingApproval, setCommandPendingApproval] = useState<{ tool: string; command: string; commandId?: string } | null>(null);

  const selectedSessionIdRef = useRef<string | null>(null);
  const wsConfigRef = useRef({
    token: user?.token || '',
    apiKey,
    geminiApiKey,
    openaiApiKey,
    anthropicApiKey,
    openrouterApiKey,
    ollamaUrl,
    useSearch,
    model,
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
      token: user?.token || '',
      apiKey,
      geminiApiKey,
      openaiApiKey,
      anthropicApiKey,
      openrouterApiKey,
      ollamaUrl,
      useSearch,
      model,
      customInstructions,
      responseMode,
      thinkingCapability,
      workspaceRoot: workspaceRoot || undefined
    };
  }, [
    user?.token,
    apiKey,
    geminiApiKey,
    openaiApiKey,
    anthropicApiKey,
    openrouterApiKey,
    ollamaUrl,
    useSearch,
    model,
    customInstructions,
    responseMode,
    thinkingCapability,
    workspaceRoot
  ]);

  const fetchWorkspace = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3001/api/workspace');
      const data = await response.json();
      setWorkspaceRoot(data.workspaceRoot || data.defaultWorkspace);
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
        const ollamaVal = data.ollamaUrl || '';
        const gitTokenVal = await decrypt(data.githubToken);
        const gitRepoVal = data.githubRepoUrl || '';

        if (keyVal) setApiKey(keyVal);
        if (geminiVal) setGeminiApiKey(geminiVal);
        if (openaiVal) setOpenaiApiKey(openaiVal);
        if (anthropicVal) setAnthropicApiKey(anthropicVal);
        if (openrouterVal) setOpenrouterApiKey(openrouterVal);
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

  const handleSpaceChange = useCallback((space: 'code' | 'chat' | 'cowork' | 'project' | 'plan') => {
    if (isStreaming) return;
    setActiveSpace(space);
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
          } else if (data.type === 'sync_update') {
            if (data.payload) {
              const { config, checklist: syncedChecklist, tasks: syncedTasks } = data.payload;
              if (config) {
                // Synced secrets persist via the encrypted credential store, never plaintext localStorage.
                if (config.apiKey !== undefined) { setApiKey(config.apiKey); saveCredentials({ apiKey: config.apiKey }); }
                if (config.geminiApiKey !== undefined) { setGeminiApiKey(config.geminiApiKey); saveCredentials({ geminiApiKey: config.geminiApiKey }); }
                if (config.openaiApiKey !== undefined) { setOpenaiApiKey(config.openaiApiKey); saveCredentials({ openaiApiKey: config.openaiApiKey }); }
                if (config.anthropicApiKey !== undefined) { setAnthropicApiKey(config.anthropicApiKey); saveCredentials({ anthropicApiKey: config.anthropicApiKey }); }
                if (config.openrouterApiKey !== undefined) { setOpenrouterApiKey(config.openrouterApiKey); saveCredentials({ openrouterApiKey: config.openrouterApiKey }); }
                if (config.ollamaUrl !== undefined) { setOllamaUrl(config.ollamaUrl); localStorage.setItem('matrix_ollama_url', config.ollamaUrl); }
                if (config.workspaceRoot !== undefined) { setWorkspaceRoot(config.workspaceRoot); }
                if (config.theme !== undefined) { setTheme(config.theme); localStorage.setItem('matrix_theme', config.theme); }
                if (config.customInstructions !== undefined) { setCustomInstructions(config.customInstructions); localStorage.setItem('matrix_custom_instructions', config.customInstructions); }
              }
              if (syncedChecklist !== undefined) setChecklist(syncedChecklist);
              if (syncedTasks !== undefined) setTasks(syncedTasks);
            }
            if (data.lastUpdated) {
              setLastSyncedAt(data.lastUpdated);
              localStorage.setItem('matrix_last_sync', data.lastUpdated);
              setSyncStatus('success');
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
    useSearch?: boolean;
    model?: string; 
    workspaceRoot?: string;
    theme?: string;
    customInstructions?: string;
    responseMode?: ResponseMode;
    thinkingCapability?: 'low' | 'medium' | 'high' | 'ultra';
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
    if (newConfig.useSearch !== undefined) {
      setUseSearch(newConfig.useSearch);
      localStorage.setItem('matrix_gemini_use_search', String(newConfig.useSearch));
    }
    if (newConfig.model !== undefined) {
      setModel(newConfig.model);
      localStorage.setItem('matrix_model', newConfig.model);
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
        useSearch: newConfig.useSearch ?? useSearch,
        model: newConfig.model ?? model,
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
        workspace: sendOptions.workspace
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

  const handleRegister = async (email: string, pass: string) => {
    try {
      const res = await fetch('http://localhost:3001/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        localStorage.setItem('matrix_user', JSON.stringify(data.user));
        notify('Account created successfully. Free Tier is active.', 'success');
      } else {
        notify(`Registration failed: ${data.error}`, 'error');
      }
    } catch (err: any) {
      notify(`Error registering: ${err.message}`, 'error');
    }
  };

  const handleLogin = async (email: string, pass: string) => {
    if (loginInFlightRef.current) return;
    loginInFlightRef.current = true;
    try {
      const res = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        localStorage.setItem('matrix_user', JSON.stringify(data.user));
        notify('Logged in successfully.', 'success');
      } else {
        notify(`Login failed: ${data.error}`, 'error');
      }
    } catch (err: any) {
      notify(`Error logging in: ${err.message}`, 'error');
    } finally {
      loginInFlightRef.current = false;
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('matrix_user');
    notify('Logged out from Kryleos Sync.', 'info');
  };

  const handleActivateLicense = async (licenseKey: string): Promise<boolean> => {
    if (!user) {
      notify('Sign in to activate a license key.', 'error');
      return false;
    }
    try {
      const res = await fetch('http://localhost:3001/api/license/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ licenseKey })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        localStorage.setItem('matrix_user', JSON.stringify(data.user));
        notify(`License activated — ${String(data.user?.tier).replace('_', ' ').toUpperCase()} tier unlocked.`, 'success');
        return true;
      }
      notify(data.error || 'License activation failed.', 'error');
      return false;
    } catch (err: any) {
      notify(`License activation error: ${err.message}`, 'error');
      return false;
    }
  };

  const handleCancelSubscription = async () => {
    if (!user) return;
    try {
      const res = await fetch('http://localhost:3001/api/billing/cancel-subscription', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${user.token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify('Cancellation scheduled for the end of the current billing cycle.', 'success');
      } else {
        notify(`Cancellation failed: ${data.error || 'Unknown billing account'}`, 'error');
      }
    } catch (err: any) {
      notify(`Cancellation error: ${err.message}`, 'error');
    }
  };

  const handleSubscribe = async (tier: string = 'basic') => {
    if (!user) return;
    if (tier === 'free') return handleCancelSubscription();
    if (isIndianLocale()) {
      return handleSubscribeRazorpay(tier);
    }
    try {
      const res = await fetch('http://localhost:3001/api/billing/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ tier })
      });
      const data = await res.json();
      if (res.ok && data.success && data.url) {
        const electronAPI = (window as any).electronAPI;
        if (electronAPI && electronAPI.openExternal) {
          await electronAPI.openExternal(data.url);
        } else {
          window.open(data.url, '_blank');
        }
        notify(`Redirecting to Stripe checkout for ${tier.toUpperCase()} plan...`, 'info');
      } else {
        notify(`Upgrade failed: ${data.error || 'No checkout URL returned'}`, 'error');
      }
    } catch (err: any) {
      notify(`Upgrade error: ${err.message}`, 'error');
    }
  };

  const handleSubscribeRazorpay = async (tier: string) => {
    if (!user) return;
    try {
      const res = await fetch('http://localhost:3001/api/billing/razorpay/create-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ tier })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify(`Upgrade failed: ${data.error || 'Could not create Razorpay subscription'}`, 'error');
        return;
      }

      const loaded = await loadRazorpayCheckoutScript();
      if (!loaded || !(window as any).Razorpay) {
        notify('Could not load Razorpay checkout. Check your connection and try again.', 'error');
        return;
      }

      const checkout = new (window as any).Razorpay({
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: 'Kryleos Forge',
        description: `Upgrade to ${tier.toUpperCase()} plan`,
        prefill: { email: user.email },
        handler: () => {
          notify(`Payment received — ${tier.toUpperCase()} plan will activate shortly.`, 'success');
        },
        modal: {
          ondismiss: () => notify('Checkout closed.', 'info'),
        },
      });
      checkout.open();
    } catch (err: any) {
      notify(`Upgrade error: ${err.message}`, 'error');
    }
  };

  const handleOpenBillingPortal = async () => {
    if (!user) return;
    try {
      const res = await fetch('http://localhost:3001/api/billing/create-portal-session', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${user.token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success && data.url) {
        const electronAPI = (window as any).electronAPI;
        if (electronAPI && electronAPI.openExternal) {
          await electronAPI.openExternal(data.url);
        } else {
          window.open(data.url, '_blank');
        }
        notify('Redirecting to your Stripe billing customer portal...', 'info');
      } else {
        notify(`Error loading portal: ${data.error}`, 'error');
      }
    } catch (err: any) {
      notify(`Portal error: ${err.message}`, 'error');
    }
  };

  const handleForceSync = useCallback(async () => {
    if (!user || !user.isPremium) return;
    try {
      setSyncStatus('syncing');
      
      const configState = {
        apiKey,
        geminiApiKey,
        openaiApiKey,
        anthropicApiKey,
        openrouterApiKey,
        ollamaUrl,
        workspaceRoot,
        theme,
        customInstructions,
        responseMode
      };

      const res = await fetch('http://localhost:3001/api/sync/push', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({
          config: configState,
          checklist,
          tasks
        })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncStatus('success');
        setLastSyncedAt(data.lastUpdated);
        localStorage.setItem('matrix_last_sync', data.lastUpdated);
      } else if (data.requiresBypass) {
        setSyncStatus('error');
        const proceed = window.confirm(`WARNING: Secrets detected during sync:\n${data.secrets.map((s: any) => `- ${s.secretType} (line ${s.line || 'unknown'})`).join('\n')}\n\nForce sync anyway?`);
        if (proceed) {
          setSyncStatus('syncing');
          const retryRes = await fetch('http://localhost:3001/api/sync/push', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.token}`
            },
            body: JSON.stringify({
              config: configState,
              checklist,
              tasks,
              bypassSecrets: true
            })
          });
          const retryData = await retryRes.json();
          if (retryRes.ok && retryData.success) {
            setSyncStatus('success');
            setLastSyncedAt(retryData.lastUpdated);
            localStorage.setItem('matrix_last_sync', retryData.lastUpdated);
            notify('Sync completed with secrets bypass.', 'info');
            return;
          }
        }
        notify(`Sync aborted: secrets detected.`, 'error');
      } else {
        setSyncStatus('error');
        notify(`Sync failed: ${data.error}`, 'error');
      }
    } catch (err: any) {
      setSyncStatus('error');
      notify(`Sync error: ${err.message}`, 'error');
    }
  }, [
    user,
    apiKey,
    geminiApiKey,
    openaiApiKey,
    anthropicApiKey,
    openrouterApiKey,
    ollamaUrl,
    workspaceRoot,
    theme,
    customInstructions,
    responseMode,
    checklist,
    tasks,
    notify
  ]);

  const handleStartCollabSession = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      notify('WebSocket connection is not open.', 'warning');
      return;
    }
    if (collabActive) {
      socketRef.current.send(JSON.stringify({ type: 'leave_collab_room' }));
      setCollabActive(false);
    } else {
      if (!user?.token) {
        notify('You must be signed in to start a collaboration session.', 'warning');
        return;
      }
      socketRef.current.send(JSON.stringify({
        type: 'join_collab_room',
        token: user.token
      }));
    }
  };

  const handlePullSync = useCallback(async (userToken: string) => {
    try {
      const res = await fetch('http://localhost:3001/api/sync/pull', {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${userToken}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success && data.syncData) {
        const { payload, lastUpdated } = data.syncData;
        if (payload) {
          const { config, checklist: syncedChecklist, tasks: syncedTasks } = payload;
          if (config) {
            // Synced secrets persist via the encrypted credential store, never plaintext localStorage.
            if (config.apiKey !== undefined) { setApiKey(config.apiKey); saveCredentials({ apiKey: config.apiKey }); }
            if (config.geminiApiKey !== undefined) { setGeminiApiKey(config.geminiApiKey); saveCredentials({ geminiApiKey: config.geminiApiKey }); }
            if (config.openaiApiKey !== undefined) { setOpenaiApiKey(config.openaiApiKey); saveCredentials({ openaiApiKey: config.openaiApiKey }); }
            if (config.anthropicApiKey !== undefined) { setAnthropicApiKey(config.anthropicApiKey); saveCredentials({ anthropicApiKey: config.anthropicApiKey }); }
            if (config.openrouterApiKey !== undefined) { setOpenrouterApiKey(config.openrouterApiKey); saveCredentials({ openrouterApiKey: config.openrouterApiKey }); }
            if (config.ollamaUrl !== undefined) { setOllamaUrl(config.ollamaUrl); localStorage.setItem('matrix_ollama_url', config.ollamaUrl); }
            if (config.workspaceRoot !== undefined) { setWorkspaceRoot(config.workspaceRoot); }
            if (config.theme !== undefined) { setTheme(config.theme); localStorage.setItem('matrix_theme', config.theme); }
            if (config.customInstructions !== undefined) { setCustomInstructions(config.customInstructions); localStorage.setItem('matrix_custom_instructions', config.customInstructions); }
            if (config.responseMode !== undefined) { setResponseMode(config.responseMode); localStorage.setItem('matrix_response_mode', config.responseMode); }
          }
          if (syncedChecklist !== undefined) setChecklist(syncedChecklist);
          if (syncedTasks !== undefined) setTasks(syncedTasks);
        }
        if (lastUpdated) {
          setLastSyncedAt(lastUpdated);
          localStorage.setItem('matrix_last_sync', lastUpdated);
          setSyncStatus('success');
        }
      }
    } catch (err) {
      console.error('Failed to pull sync data:', err);
    }
  }, []);

  useEffect(() => {
    if (user && user.isPremium) {
      handlePullSync(user.token);
    }
  }, [handlePullSync, user]);

  useEffect(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'config',
        token: user?.token || '',
        apiKey,
        geminiApiKey,
        openaiApiKey,
        anthropicApiKey,
        openrouterApiKey,
        ollamaUrl,
        useSearch,
        model,
        customInstructions,
        responseMode,
        workspaceRoot
      }));
    }
  }, [
    user,
    apiKey,
    geminiApiKey,
    openaiApiKey,
    anthropicApiKey,
    openrouterApiKey,
    ollamaUrl,
    useSearch,
    model,
    customInstructions,
    responseMode,
    workspaceRoot
  ]);

  useEffect(() => {
    if (user && user.isPremium) {
      const delayDebounce = setTimeout(() => {
        handleForceSync();
      }, 5000);
      return () => clearTimeout(delayDebounce);
    }
  }, [handleForceSync, user]);

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
            <div className="flex items-center gap-1.5 font-sans font-bold text-xs uppercase tracking-wider text-forge-text select-none">
              <Cpu size={13} className="text-forge-neon" />
              <span>Kryleos Forge</span>
              <span className="text-[8px] bg-forge-dark text-forge-dim px-1 py-0.5 rounded-sm">v2.5</span>
            </div>

            {/* Active Project Switcher / Indicator */}
            <div className="flex items-center gap-2 ml-4 select-none">
              {activeProject ? (
                <div className="flex items-center gap-2 border border-forge-neon/40 px-2 py-0.5 rounded bg-forge-neon/5 text-[10px]">
                  <span className="text-forge-neon font-bold uppercase">PROJECT: {activeProject.name}</span>
                  <button
                    onClick={() => setIsProjectModalOpen(true)}
                    className="text-forge-dim hover:text-white underline cursor-pointer text-[9px] bg-transparent border-0 outline-none"
                    type="button"
                  >
                    Switch
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsProjectModalOpen(true)}
                  className="text-forge-text font-bold text-[10px] border border-forge-neon/40 px-2 py-0.5 rounded bg-forge-neon/5 hover:bg-forge-dark cursor-pointer outline-none"
                  type="button"
                >
                  + Add project
                </button>
              )}
            </div>

            {/* Switchable Spaces tab bar */}
            <div className="forge-tabs ml-4">
              <button
                onClick={() => handleSpaceChange('plan')}
                disabled={isStreaming}
                className={`forge-tab transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${activeSpace === 'plan' ? 'forge-tab-active' : ''}`}
                title="F1"
              >
                Plan
              </button>
              <button
                onClick={() => handleSpaceChange('cowork')}
                disabled={isStreaming}
                className={`forge-tab transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${activeSpace === 'cowork' ? 'forge-tab-active' : ''}`}
                title="F2"
              >
                Crew
              </button>
              <button
                onClick={() => handleSpaceChange('project')}
                disabled={isStreaming}
                className={`forge-tab transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${activeSpace === 'project' ? 'forge-tab-active' : ''}`}
                title="F3"
              >
                Flow
              </button>
              <button
                onClick={() => handleSpaceChange('code')}
                disabled={isStreaming}
                className={`forge-tab transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${activeSpace === 'code' ? 'forge-tab-active' : ''}`}
                title="F4"
              >
                Forge
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
            useSearch={useSearch}
            model={model}
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
            user={user}
            syncStatus={syncStatus}
            lastSyncedAt={lastSyncedAt}
            onRegister={handleRegister}
            onLogin={handleLogin}
            onLogout={handleLogout}
            onSubscribe={handleSubscribe}
            onActivateLicense={handleActivateLicense}
            onOpenBillingPortal={handleOpenBillingPortal}
            onForceSync={handleForceSync}
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
                    checklist.map((item, idx) => {
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

                      const cleanItem = item.replace(/^\[[x\s/]*\]\s*/, '').trim();

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
          {activeSpace === 'chat' ? (
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
                userTier={user?.tier || (user?.isPremium ? 'basic' : 'free')}
                onSaveTasks={handleSaveTasks}
                onSaveAgents={handleSaveAgents}
                onSendQuery={handleSendQuery}
                onUpdateWorkspaceRoot={newPath => handleUpdateConfig({ workspaceRoot: newPath })}
                commandPendingApproval={commandPendingApproval}
                onApproveCommand={handleApproveCommand}
                onNotify={notify}
                onAbort={handleAbortWorkflow}
                onCreateProject={handleCreateProject}
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
                userTier={user?.tier || (user?.isPremium ? 'basic' : 'free')}
                authToken={user?.token || ''}
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
              onOpenConfig={() => { localStorage.setItem('matrix_setup_done', 'true'); setShowSetup(false); }}
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
          const activationSteps = [
            { label: 'Connect model', done: Boolean(apiKey || geminiApiKey || openaiApiKey || anthropicApiKey || openrouterApiKey || ollamaDetected) },
            { label: 'Run demo trace', done: localStorage.getItem('matrix_activation_demo') === 'true' },
            { label: 'Point at repo', done: localStorage.getItem('matrix_activation_repo') === 'true' }
          ];
          if (activationSteps.every(step => step.done)) return null;
          return (
            <div className="fixed bottom-3 right-3 z-40 w-64 border border-forge-neon/40 bg-forge-panel-bg shadow-lg rounded p-3 font-mono text-[10px] space-y-2 pointer-events-none">
              <div className="text-forge-neon uppercase font-bold">Activation checklist</div>
              {activationSteps.map(step => (
                <div key={step.label} className={step.done ? 'text-emerald-400' : 'text-forge-dim'}>
                  {step.done ? '[x]' : '[ ]'} {step.label}
                </div>
              ))}
              <div className="flex gap-1 pointer-events-auto">
                {!activationSteps[1].done && <button type="button" onClick={handleRunDemo} className="forge-btn px-2 py-1">RUN DEMO</button>}
                {!activationSteps[2].done && <button type="button" onClick={() => setIsProjectModalOpen(true)} className="forge-secondary-button px-2 py-1">ADD REPO</button>}
              </div>
            </div>
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
      </div>
    </>
    </ErrorBoundary>
  );
}

export default App;
