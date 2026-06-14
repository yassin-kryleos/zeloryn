import React, { useState, useEffect } from 'react';
import {
  Terminal, Sparkles, Key, FileText, Database, ShieldAlert, ShieldCheck,
  Download, Laptop, RefreshCw, Smartphone, Mic, MicOff,
  Gem, Check, X, Zap, Building2, Users,
  LogIn, LogOut, User, CreditCard, Lock, ExternalLink
} from 'lucide-react';
import { useVoiceInput } from './hooks/useVoiceInput';
import { TIER_LABELS, type TierId } from './pricing.generated';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type ResponseMode = 'balanced' | 'concise' | 'critical' | 'brutal_audit';
type FeatureStatus = 'production' | 'preview' | 'simulator' | 'mock' | 'planned';
type UserTier = Exclude<TierId, 'agency'>;
type ActiveTab = 'marketing' | 'pricing' | 'planning' | 'chat' | 'downloads' | 'settings';
type BackendLog = { sender?: string; message?: string };
type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; kind: ToastKind; message: string };
type AuthUser = { name: string; email: string };
type AuthMode = 'login' | 'signup';

const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  production: 'Production',
  preview: 'Preview',
  simulator: 'Simulator',
  mock: 'Mock',
  planned: 'Planned',
};

function FeatureBadge({ status, label }: { status: FeatureStatus; label?: string }) {
  return (
    <span className={`feature-badge feature-badge-${status}`}>
      {label || FEATURE_STATUS_LABELS[status]}
    </span>
  );
}

const USER_TIERS: UserTier[] = ['free', 'solo', 'solo_plus', 'founder'];

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('web_auth_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.email === 'string' ? parsed as AuthUser : null;
  } catch {
    return null;
  }
}
const APP_TABS: ActiveTab[] = ['marketing', 'pricing', 'planning', 'chat', 'downloads', 'settings'];

interface PricingRow {
  label: string;
  group?: boolean;
  status?: FeatureStatus;
  values: Record<UserTier, boolean | string>;
}

const PRICING_MATRIX: PricingRow[] = [
  { label: 'Pricing', group: true, values: { free: '', solo: '', solo_plus: '', founder: '' } },
  { label: 'Monthly price', values: { free: '$0', solo: '$5', solo_plus: '$9', founder: '$15' } },
  { label: 'Paired devices', values: { free: '1', solo: '3', solo_plus: '10', founder: 'Unlimited' } },
  { label: 'Support', values: { free: 'Community', solo: 'Email', solo_plus: 'Priority', founder: 'Dedicated + SLA' } },

  { label: 'Core (local-first)', group: true, values: { free: '', solo: '', solo_plus: '', founder: '' } },
  { label: 'Local agent workspace', values: { free: true, solo: true, solo_plus: true, founder: true } },
  { label: 'BYOK model access', values: { free: true, solo: true, solo_plus: true, founder: true } },
  { label: 'Zero-egress execution', values: { free: true, solo: true, solo_plus: true, founder: true } },
  { label: 'Voice scoping & planning', values: { free: true, solo: true, solo_plus: true, founder: true } },

  { label: 'Sync & backup', group: true, values: { free: '', solo: '', solo_plus: '', founder: '' } },
  { label: 'Settings cloud sync', status: 'preview', values: { free: false, solo: true, solo_plus: true, founder: true } },
  { label: 'Automatic cloud backups', status: 'preview', values: { free: false, solo: true, solo_plus: true, founder: true } },

  { label: 'Remote compute', group: true, values: { free: '', solo: '', solo_plus: '', founder: '' } },
  { label: 'Remote containers', status: 'simulator', values: { free: false, solo: false, solo_plus: true, founder: true } },
  { label: 'Cloud sandbox builds', status: 'simulator', values: { free: false, solo: false, solo_plus: true, founder: true } },
  { label: 'Semantic cache query', status: 'preview', values: { free: false, solo: false, solo_plus: true, founder: true } },
  { label: 'Self-healing rollback', status: 'preview', values: { free: false, solo: false, solo_plus: true, founder: true } },

  { label: 'Organization', group: true, values: { free: '', solo: '', solo_plus: '', founder: '' } },
  { label: 'Team workspaces', status: 'preview', values: { free: false, solo: false, solo_plus: false, founder: true } },
  { label: 'Audit log & RBAC', status: 'simulator', values: { free: false, solo: false, solo_plus: false, founder: true } },
  { label: 'WebRTC co-coding rooms', status: 'preview', values: { free: false, solo: false, solo_plus: false, founder: true } },
  { label: 'SSO / SAML', status: 'planned', values: { free: false, solo: false, solo_plus: false, founder: true } },
];

function readStoredTier(): UserTier {
  const storedTier = localStorage.getItem('web_user_tier');
  return USER_TIERS.includes(storedTier as UserTier) ? (storedTier as UserTier) : 'free';
}

interface SimPlanFile {
  action: 'NEW' | 'MODIFY';
  path: string;
}

interface SimPlan {
  checklist: string[];
  files: SimPlanFile[];
}

interface SimCrewMessage {
  agent: string;
  msg: string;
}

interface SimFlow {
  cardName: string;
  stages: string[];
}

interface SimForge {
  commands: string[];
}

interface SimTaskData {
  title: string;
  plan: SimPlan;
  crew: SimCrewMessage[];
  flow: SimFlow;
  forge: SimForge;
}

const SIM_DATA: Record<'auth' | 'cache' | 'api' | 'custom', SimTaskData> = {
  auth: {
    title: '🔒 JWT Authentication flow',
    plan: {
      checklist: [
        'Design authentication database schema',
        'Implement password hashing (PBKDF2) and salt key generation',
        'Add token signing and verification middleware',
        'Write Vitest security verification tests',
      ],
      files: [
        { action: 'NEW', path: 'src/middleware/auth.ts' },
        { action: 'MODIFY', path: 'src/backend/server.ts' },
        { action: 'NEW', path: 'src/__tests__/auth.test.ts' }
      ]
    },
    crew: [
      { agent: 'Architect', msg: 'System architecture mapped. Determined target dependencies: jsonwebtoken & bcrypt.' },
      { agent: 'Developer', msg: 'Writing PBKDF2 cryptography wrappers and Express middleware interceptors.' },
      { agent: 'Auditor', msg: 'Analyzing code boundary safety and designing vulnerability injection tests.' }
    ],
    flow: {
      cardName: '🎫 Feature: JWT Auth',
      stages: ['Backlog', 'In-Progress', 'Under Audit', 'Ready to Forge']
    },
    forge: {
      commands: [
        'npm install jsonwebtoken bcrypt @types/jsonwebtoken',
        'npx tsc --noEmit',
        'vitest run src/__tests__/auth.test.ts',
        '✓ 12 tests passed successfully.',
        'git add src/middleware/auth.ts src/backend/server.ts',
        'git commit -m "feat(auth): implement secure JWT token credentials plan"',
        '✓ WORKSPACE FORGED SUCCESSFULLY!'
      ]
    }
  },
  cache: {
    title: '⚡ SQLite Caching layer',
    plan: {
      checklist: [
        'Configure local memory cache dictionary',
        'Implement read-through database caching logic',
        'Configure async write-behind file syncing',
        'Perform Vitest cache validation benchmarks',
      ],
      files: [
        { action: 'MODIFY', path: 'src/backend/db.ts' },
        { action: 'NEW', path: 'src/backend/cache.ts' }
      ]
    },
    crew: [
      { agent: 'Architect', msg: 'Identified db.ts bottleneck. Designed in-memory key-value cache layer.' },
      { agent: 'Developer', msg: 'Writing synchronized write-behind callbacks and SQLite cache updates.' },
      { agent: 'Auditor', msg: 'Verifying atomic cache validation states under high concurrency.' }
    ],
    flow: {
      cardName: '🎫 Refactor: DB Caching',
      stages: ['Backlog', 'In-Progress', 'Under Audit', 'Ready to Forge']
    },
    forge: {
      commands: [
        'npx tsc --noEmit',
        'node qa/scripts/performance-test-scripts/node-load-test.mjs',
        '✓ DB latency reduced: 67ms -> 0.8ms.',
        'git add src/backend/db.ts src/backend/cache.ts',
        'git commit -m "perf(db): implement in-memory query database caching"',
        '✓ WORKSPACE FORGED SUCCESSFULLY!'
      ]
    }
  },
  api: {
    title: '🔌 GitHub Issues sync integration',
    plan: {
      checklist: [
        'Configure secure token headers for GitHub API',
        'Add issue fetch, parse, and mapping utilities',
        'Wired GitHub planning synchronization endpoints',
        'Verify token lifecycle verification scenarios',
      ],
      files: [
        { action: 'NEW', path: 'src/integrations/github.ts' },
        { action: 'MODIFY', path: 'src/backend/server.ts' }
      ]
    },
    crew: [
      { agent: 'Architect', msg: 'Mapped GitHub REST API payload schemas to planning task models.' },
      { agent: 'Developer', msg: 'Implementing secure personal token headers and client fetch blocks.' },
      { agent: 'Auditor', msg: 'Scanning for secret exposure risks in sync payloads and API logs.' }
    ],
    flow: {
      cardName: '🎫 Integration: GitHub Sync',
      stages: ['Backlog', 'In-Progress', 'Under Audit', 'Ready to Forge']
    },
    forge: {
      commands: [
        'npx tsc --noEmit',
        'vitest run src/integrations/__tests__/github.test.ts',
        '✓ Issues mapping assertions passed.',
        'git add src/integrations/github.ts src/backend/server.ts',
        'git commit -m "feat(github): implement OAuth issues synchronization"',
        '✓ WORKSPACE FORGED SUCCESSFULLY!'
      ]
    }
  },
  custom: {
    title: '✏️ Custom Scoped Task',
    plan: {
      checklist: [
        'Analyze custom prompt inputs and requirements',
        'Generate custom project components plan',
        'Wired verification tests for custom requirements',
        'Finalize codebase implementation',
      ],
      files: [
        { action: 'NEW', path: 'src/components/custom_task.ts' },
        { action: 'MODIFY', path: 'src/App.tsx' }
      ]
    },
    crew: [
      { agent: 'Architect', msg: 'Resolved design bounds for: ' },
      { agent: 'Developer', msg: 'Implementing custom logical handlers...' },
      { agent: 'Auditor', msg: 'Verifying input bounds compliance.' }
    ],
    flow: {
      cardName: '🎫 Custom: Scoped Task',
      stages: ['Backlog', 'In-Progress', 'Under Audit', 'Ready to Forge']
    },
    forge: {
      commands: [
        'npx tsc --noEmit',
        'npm run test',
        '✓ All client validation tests passed.',
        'git commit -m "feat(custom): implement custom scoped planning changes"',
        '✓ WORKSPACE FORGED SUCCESSFULLY!'
      ]
    }
  }
};

const getPlanChecklist = (type: 'auth' | 'cache' | 'api' | 'custom', customInput: string) => {
  if (type === 'custom') {
    return [
      `Analyze requirements for: "${customInput || 'User Scoped Task'}"`,
      'Generate component specifications checklist',
      'Wired target validation endpoints',
      'Execute Vitest regression audits',
    ];
  }
  return SIM_DATA[type].plan.checklist;
};

const getPlanFiles = (type: 'auth' | 'cache' | 'api' | 'custom') => {
  return SIM_DATA[type].plan.files;
};

const getCrewMessages = (type: 'auth' | 'cache' | 'api' | 'custom', customInput: string) => {
  if (type === 'custom') {
    return [
      { agent: 'Architect', msg: `Resolved system design bounds for custom request: "${customInput || 'User Scoped Task'}"` },
      { agent: 'Developer', msg: 'Writing components implementation under strict sandbox policy...' },
      { agent: 'Auditor', msg: 'Verifying inputs bounds and checking unit tests coverages.' }
    ];
  }
  return SIM_DATA[type].crew;
};

const getFlowCardName = (type: 'auth' | 'cache' | 'api' | 'custom', customInput: string) => {
  if (type === 'custom') {
    return `🎫 Task: ${customInput ? customInput.slice(0, 18) : 'Custom Scoped'}`;
  }
  return SIM_DATA[type].flow.cardName;
};

const getForgeCommands = (type: 'auth' | 'cache' | 'api' | 'custom', customInput: string) => {
  if (type === 'custom') {
    const commitMsg = `feat(custom): implement ${customInput ? customInput.slice(0, 25) : 'custom scoped'} changes`;
    return [
      'npx tsc --noEmit',
      'npm run test',
      '✓ All client validation tests passed.',
      `git commit -m "${commitMsg}"`,
      '✓ WORKSPACE FORGED SUCCESSFULLY!'
    ];
  }
  return SIM_DATA[type].forge.commands;
};

// Converts **bold** markers in static content strings to <strong> elements.
function renderMd(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('marketing');

  // Non-blocking toast notifications (replace native alert/confirm dialogs)
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = React.useRef(0);
  const pushToast = React.useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4200);
  }, []);
  const dismissToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  // Plan import options modal (replaces native window.confirm)
  const [showImportModal, setShowImportModal] = useState(false);

  // Authentication — backed by the desktop sync API when reachable,
  // with a graceful local-only demo fallback when it is not.
  const [authUser, setAuthUser] = useState<AuthUser | null>(readStoredUser);
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('web_auth_token'));
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);

  // Checkout (Stripe / Razorpay redirect) flow
  const [pendingTier, setPendingTier] = useState<UserTier | null>(null);

  // Settings state (Stored locally in localStorage)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('web_api_key') || '');
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('web_gemini_api_key') || '');
  const [openaiApiKey, setOpenaiApiKey] = useState(() => localStorage.getItem('web_openai_api_key') || '');
  const [theme, setTheme] = useState(() => localStorage.getItem('web_theme') || 'forge');
  const [customInstructions, setCustomInstructions] = useState(() => localStorage.getItem('web_custom_instructions') || '');
  const [responseMode, setResponseMode] = useState<ResponseMode>(() => (localStorage.getItem('web_response_mode') as ResponseMode) || 'balanced');
  const [thinkingCapability, setThinkingCapability] = useState<'low' | 'medium' | 'high' | 'ultra'>(() => (localStorage.getItem('web_thinking_capability') as 'low' | 'medium' | 'high' | 'ultra') || 'medium');
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem('web_backend_url') || 'http://localhost:3001');
  const [backendStatus, setBackendStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [isSyncEnabled, setIsSyncEnabled] = useState(false);
  const [piiFilterEnabled, setPiiFilterEnabled] = useState(() => localStorage.getItem('web_pii_filter_enabled') === 'true');
  const [telemetry, setTelemetry] = useState({ bytesSent: 12450, bytesReceived: 38920, compressionSavingsRatio: 0.68 });

  const redactSensitiveData = (text: string): string => {
    let result = text;
    // 1. Redact Emails
    result = result.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
    // 2. Redact Phone numbers
    result = result.replace(/\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, (match) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length >= 7) return '[REDACTED_PHONE]';
      return match;
    });
    // 3. Redact API Keys
    result = result.replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_API_KEY]');
    result = result.replace(/sk-proj-[a-zA-Z0-9-]{20,}/g, '[REDACTED_API_KEY]');
    result = result.replace(/sk-ant-[a-zA-Z0-9-]{20,}/g, '[REDACTED_API_KEY]');
    result = result.replace(/AIzaSy[a-zA-Z0-9-_]{20,}/g, '[REDACTED_API_KEY]');
    return result;
  };
  
  // Billing status (Simulated local user)
  const [userTier, setUserTier] = useState<UserTier>(readStoredTier);

  const [showSyncOverlay, setShowSyncOverlay] = useState(false);
  const [collabActive, setCollabActive] = useState(false);
  const [showCollabOverlay, setShowCollabOverlay] = useState(false);

  // Semantic Cache state
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticResults, setSemanticResults] = useState<{symbol: string, file: string, type: string}[]>([]);
  const [semanticIndexCount, setSemanticIndexCount] = useState<number | null>(null);
  const [isBuildingIndex, setIsBuildingIndex] = useState(false);

  // RBAC state
  const [rbacRole, setRbacRole] = useState<'admin' | 'developer'>('admin');
  const [rbacBlockedPrefixes, setRbacBlockedPrefixes] = useState('npm publish, docker push, terraform, aws');

  // Lock overlays for new panels
  const [showSemanticLock, setShowSemanticLock] = useState(false);
  const [showRbacLock, setShowRbacLock] = useState(false);

  // Chat/Sandbox States
  const [chatMessages, setChatMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Web client active. Provide API keys in the Settings tab to initialize live model requests, or run queries here to test the agent simulation.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const chatVoice = useVoiceInput((text) => setChatInput(prev => prev ? `${prev} ${text}` : text));
  const [isStreaming, setIsStreaming] = useState(false);

  // Planning phase states
  const [planMessages, setPlanMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Welcome to the remote Planning Architect. Outline your product parameters below to generate an implementation draft, then sync it to your desktop workspace.' }
  ]);
  const [planInput, setPlanInput] = useState('');
  const planVoice = useVoiceInput((text) => setPlanInput(prev => prev ? `${prev} ${text}` : text));
  const [planDraft, setPlanDraft] = useState(
    `# Implementation Plan: Remote Scoping Draft\n\n- [ ] Define remote database model\n- [ ] Implement mobile authorization socket hooks\n- [ ] Configure local storage wrappers`
  );
  const [isPlanEditing, setIsPlanEditing] = useState(false);
  const [showSyncLockModal, setShowSyncLockModal] = useState(false);
  const [syncConflict, setSyncConflict] = useState(false);

  const [pairingCode, setPairingCode] = useState(() => localStorage.getItem('web_pairing_code') || '');
  const [companionStatus, setCompanionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [desktopLogs, setDesktopLogs] = useState<BackendLog[]>([]);
  const [cpuHistory, setCpuHistory] = useState<number[]>(Array(15).fill(12));
  const [memoryHistory, setMemoryHistory] = useState<number[]>(Array(15).fill(210));
  const companionWsRef = React.useRef<WebSocket | null>(null);

  // Simulator States
  const [simTaskType, setSimTaskType] = useState<'auth' | 'cache' | 'api' | 'custom'>('auth');
  const [simCustomInput, setSimCustomInput] = useState('');
  const [simRunning, setSimRunning] = useState(false);
  const [simStep, setSimStep] = useState<number>(0);
  const [simProgress, setSimProgress] = useState<number>(0);

  useEffect(() => {
    if (!simRunning) return;

    let currentStep = 0;
    let currentProgress = 0;
    const intervalTime = 100; // Tick every 100ms
    const stepDuration = 3000; // 3 seconds per step
    const totalSteps = 4;
    
    const timer = setInterval(() => {
      currentProgress += (intervalTime / stepDuration) * 100;
      if (currentProgress >= 100) {
        currentProgress = 0;
        currentStep += 1;
        if (currentStep >= totalSteps) {
          clearInterval(timer);
          setSimRunning(false);
          setSimProgress(100);
          setSimStep(3);
          return;
        }
        setSimStep(currentStep);
      }
      setSimProgress(Math.min(100, Math.floor(currentProgress)));
    }, intervalTime);

    return () => clearInterval(timer);
  }, [simRunning]);

  const backendUrlRef = React.useRef(backendUrl);
  useEffect(() => {
    backendUrlRef.current = backendUrl;
  }, [backendUrl]);

  const connectCompanion = React.useCallback((code: string) => {
    if (!code) return;
    if (companionWsRef.current) {
      companionWsRef.current.close();
    }
    setCompanionStatus('connecting');
    localStorage.setItem('web_pairing_code', code);

    const wsUrl = backendUrlRef.current.replace(/^http/i, 'ws') + `/api/companion/ws?code=${code}`;
    const ws = new WebSocket(wsUrl);
    companionWsRef.current = ws;

    ws.onopen = () => {
      setCompanionStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connection_status' && data.status === 'paired') {
          setCompanionStatus('connected');
        } else if (data.type === 'update' && data.logs) {
          setDesktopLogs(data.logs);
        } else if (data.type === 'telemetry_stream') {
          setCpuHistory(prev => [...prev.slice(1), data.cpuLoad]);
          setMemoryHistory(prev => [...prev.slice(1), data.memoryUsage]);
        } else if (data.type === 'error') {
          pushToast(`Companion error: ${data.message}`, 'error');
          setCompanionStatus('error');
        }
      } catch (err) {
        console.error('Error parsing companion message:', err);
      }
    };

    ws.onclose = () => {
      setCompanionStatus('disconnected');
      companionWsRef.current = null;
    };

    ws.onerror = () => {
      setCompanionStatus('error');
    };
  }, [pushToast]);

  const disconnectCompanion = () => {
    if (companionWsRef.current) {
      companionWsRef.current.close();
    }
    setCompanionStatus('disconnected');
  };

  const toggleCompanionConnection = () => {
    if (companionStatus === 'connected' || companionStatus === 'connecting') {
      disconnectCompanion();
    } else {
      connectCompanion(pairingCode);
    }
  };

  useEffect(() => {
    const savedCode = localStorage.getItem('web_pairing_code');
    const reconnectTimer = savedCode
      ? window.setTimeout(() => connectCompanion(savedCode), 0)
      : undefined;
    return () => {
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (companionWsRef.current) {
        companionWsRef.current.close();
      }
    };
  }, [connectCompanion]);

  useEffect(() => {
    localStorage.setItem('web_user_tier', userTier);
  }, [userTier]);

  useEffect(() => {
    if (authUser) localStorage.setItem('web_auth_user', JSON.stringify(authUser));
    else localStorage.removeItem('web_auth_user');
  }, [authUser]);

  useEffect(() => {
    if (authToken) localStorage.setItem('web_auth_token', authToken);
    else localStorage.removeItem('web_auth_token');
  }, [authToken]);

  // Close any open modal/overlay on Escape (a11y)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setShowImportModal(false);
      setShowSyncLockModal(false);
      setShowSyncOverlay(false);
      setShowCollabOverlay(false);
      setShowSemanticLock(false);
      setShowRbacLock(false);
      setShowAuthModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.body.className = `theme-${theme}`;
    localStorage.setItem('web_theme', theme);
  }, [theme]);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('web_api_key', apiKey);
    localStorage.setItem('web_gemini_api_key', geminiApiKey);
    localStorage.setItem('web_openai_api_key', openaiApiKey);
    localStorage.setItem('web_theme', theme);
    localStorage.setItem('web_custom_instructions', customInstructions);
    localStorage.setItem('web_response_mode', responseMode);
    localStorage.setItem('web_thinking_capability', thinkingCapability);
    localStorage.setItem('web_backend_url', backendUrl);
    pushToast('Settings saved locally in browser storage.', 'success');
  };

  const getWsUrl = () => backendUrl.replace(/^http/i, 'ws');

  const sendQueryToBackend = (text: string, space: 'chat' | 'plan') => {
    return new Promise<string>((resolve, reject) => {
      let finalContent = '';
      const ws = new WebSocket(getWsUrl());
      const timeout = window.setTimeout(() => {
        ws.close();
        reject(new Error('Backend connection timed out'));
      }, 12000);

      ws.onopen = () => {
        setBackendStatus('online');
        ws.send(JSON.stringify({ type: 'config', customInstructions, responseMode, thinkingCapability }));
        ws.send(JSON.stringify({ type: 'query', text, space: 'chat', sessionId: `web_${space}_${Date.now()}` }));
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'update') {
          if (data.streamingContent) {
            finalContent = data.streamingContent;
          }
          if (!data.isStreaming && data.logs) {
            const assistantLog = ([...data.logs] as BackendLog[]).reverse().find((log) => log.sender === 'assistant');
            if (assistantLog?.message) finalContent = assistantLog.message;
            window.clearTimeout(timeout);
            ws.close();
            resolve(finalContent || 'Backend completed without a text response.');
          }
        } else if (data.type === 'error') {
          window.clearTimeout(timeout);
          ws.close();
          reject(new Error(data.message || 'Backend error'));
        }
      };
      ws.onerror = () => {
        setBackendStatus('offline');
        window.clearTimeout(timeout);
        reject(new Error('Backend WebSocket unavailable'));
      };
    });
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    
    let filteredInput = chatInput;
    let piiWarning = false;
    if (piiFilterEnabled) {
      filteredInput = redactSensitiveData(chatInput);
      if (filteredInput !== chatInput) {
        piiWarning = true;
      }
    }

    const userMsg = { role: 'user', content: filteredInput } as const;
    setChatMessages(prev => {
      const list = [...prev, userMsg];
      if (piiWarning) {
        list.push({
          role: 'assistant',
          content: '⚠️ [PII SHIELD ACTIVE]: Sensitive keys, emails, or phone numbers were automatically redacted from your message.'
        });
      }
      return list;
    });

    setTelemetry(prev => ({
      bytesSent: prev.bytesSent + filteredInput.length,
      bytesReceived: prev.bytesReceived + 380,
      compressionSavingsRatio: 0.68
    }));

    setChatInput('');
    setIsStreaming(true);

    sendQueryToBackend(filteredInput, 'chat')
      .then((content) => {
        setChatMessages(prev => [...prev, { role: 'assistant', content }]);
        setIsStreaming(false);
      })
      .catch(() => {
        setBackendStatus('offline');

        setTimeout(() => {
          setChatMessages(prev => [...prev, {
            role: 'assistant',
            content: `[AGENT SIMULATOR FALLBACK] Backend unavailable. Scanned workspace directory mock...\nFound 3 matched files.\n[ACTION: RUN COMMAND] npm run test\n[RESULT] All tests passed.\n\nQuery resolved locally as a simulation.`
          }]);
          setIsStreaming(false);
        }, 1000);
      });
  };

  const handleSendPlan = () => {
    if (!planInput.trim()) return;

    let filteredInput = planInput;
    let piiWarning = false;
    if (piiFilterEnabled) {
      filteredInput = redactSensitiveData(planInput);
      if (filteredInput !== planInput) {
        piiWarning = true;
      }
    }

    const userMsg = { role: 'user', content: filteredInput } as const;
    setPlanMessages(prev => {
      const list = [...prev, userMsg];
      if (piiWarning) {
        list.push({
          role: 'assistant',
          content: '⚠️ [PII SHIELD ACTIVE]: Sensitive keys, emails, or phone numbers were automatically redacted from your message.'
        });
      }
      return list;
    });

    setTelemetry(prev => ({
      bytesSent: prev.bytesSent + filteredInput.length,
      bytesReceived: prev.bytesReceived + 250,
      compressionSavingsRatio: 0.68
    }));

    setPlanInput('');
    setIsStreaming(true);

    sendQueryToBackend(`[ARCHITECT SPECIFICATION INSTRUCTION]: ${filteredInput}`, 'plan')
      .then((content) => {
        setPlanMessages(prev => [...prev, { role: 'assistant', content }]);
        setPlanDraft(prev => prev + `\n- [ ] Added: ${filteredInput}\n- [ ] Added: Run compilation tests`);
        setIsStreaming(false);
      })
      .catch(() => {
        setBackendStatus('offline');
        setTimeout(() => {
          setPlanMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Planning simulator fallback updated the local draft. Backend was unavailable.'
          }]);
          setPlanDraft(prev => prev + `\n- [ ] Added: ${filteredInput}\n- [ ] Added: Run compilation tests`);
          setIsStreaming(false);
        }, 1000);
      });
  };

  useEffect(() => {
    const loadTelemetry = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/telemetry`);
        if (!res.ok) throw new Error('telemetry unavailable');
        const data = await res.json();
        setTelemetry(data);
        setBackendStatus('online');
      } catch {
        setBackendStatus(prev => prev === 'unknown' ? 'offline' : prev);
      }
    };
    loadTelemetry();
    const timer = window.setInterval(loadTelemetry, 8000);
    return () => window.clearInterval(timer);
  }, [backendUrl]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (companionStatus !== 'connected') {
        // Fallback simulation: random walk CPU centered on 12%, Memory centered on 210MB
        setCpuHistory(prev => {
          const last = prev[prev.length - 1] ?? 12;
          const delta = Math.floor(Math.random() * 5) - 2; // -2 to +2
          const nextVal = Math.max(3, Math.min(65, last + delta));
          return [...prev.slice(1), nextVal];
        });
        setMemoryHistory(prev => {
          const last = prev[prev.length - 1] ?? 210;
          const delta = Math.floor(Math.random() * 11) - 5; // -5 to +5
          const nextVal = Math.max(120, Math.min(350, last + delta));
          return [...prev.slice(1), nextVal];
        });
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [companionStatus]);

  const handleImportRequest = () => {
    if (userTier === 'free') {
      setShowSyncLockModal(true);
    } else {
      setShowImportModal(true);
    }
  };

  const handleImportClean = () => {
    setShowImportModal(false);
    setSyncConflict(false);
    pushToast('Plan imported — synced implementation_plan.md to desktop workspace.', 'success');
  };

  const handleImportSimulateConflict = () => {
    setShowImportModal(false);
    setSyncConflict(true);
    const conflictedText = planDraft + "\n\n<<<<<<< CLIENT (OURS)\n- [ ] Added: User's remote mobile scope change\n=======\n- [ ] Added: Conflicting desktop update\n>>>>>>> SERVER (THEIRS)";
    setPlanDraft(conflictedText);
  };

  // --- Authentication (mock) ---
  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthError('');
    setShowAuthModal(true);
  };

  const apiBase = () => backendUrl.replace(/\/$/, '');

  // Call the desktop sync API. Throws a TypeError on network/unreachable
  // (caught by callers to trigger local fallback), or an Error on a 4xx.
  const backendAuthRequest = async (mode: AuthMode, email: string, password: string): Promise<{ email: string; tier: string; token: string }> => {
    const res = await fetch(`${apiBase()}/api/auth/${mode === 'signup' ? 'register' : 'login'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || (mode === 'signup' ? 'Could not create account.' : 'Invalid email or password.'));
    }
    return data.user;
  };

  const finishAuth = (name: string, email: string, synced: boolean, token: string | null) => {
    setAuthUser({ name, email });
    setShowAuthModal(false);
    setAuthError('');
    setAuthPassword('');
    setAuthName('');
    const verb = authMode === 'signup' ? 'Account created' : 'Signed in';
    pushToast(`${verb} — welcome, ${name}.${synced ? ' Account synced to your desktop workspace.' : ' (local session — desktop offline)'}`, 'success');
    if (pendingTier) {
      const tier = pendingTier;
      setPendingTier(null);
      // authToken state may not have committed yet — pass the fresh token directly.
      handleSubscribe(tier, token);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAuthSubmitting) return;
    const email = authEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setAuthError('Enter a valid email address.');
      return;
    }
    if (authPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }
    if (authMode === 'signup' && !authName.trim()) {
      setAuthError('Enter your name.');
      return;
    }
    const name = authMode === 'signup' ? authName.trim() : email.split('@')[0];
    setAuthError('');
    setIsAuthSubmitting(true);
    try {
      const user = await backendAuthRequest(authMode, email, authPassword);
      setAuthToken(user.token);
      setBackendStatus('online');
      if ((USER_TIERS as string[]).includes(user.tier)) setUserTier(user.tier as UserTier);
      finishAuth(name, user.email, true, user.token);
    } catch (err) {
      // Network/unreachable → fall back to a local-only demo session.
      if (err instanceof TypeError) {
        setAuthToken(null);
        finishAuth(name, email, false, null);
        return;
      }
      // 4xx (bad credentials / duplicate account) → surface the message.
      setAuthError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    setAuthUser(null);
    setAuthToken(null);
    pushToast('Signed out.', 'info');
  };

  // --- Plan selection / purchase ---
  const requestPlan = (tier: UserTier) => {
    if (tier === userTier) return;
    if (tier === 'free') {
      setUserTier('free');
      // Keep the backend account in sync when paired (best-effort).
      if (authToken) {
        fetch(`${apiBase()}/api/auth/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ tier: 'free' }),
        }).catch(() => {});
      }
      pushToast('Switched to the Free plan.', 'success');
      return;
    }
    if (!authUser) {
      setPendingTier(tier);
      pushToast('Sign in to purchase a plan.', 'info');
      openAuth('login');
      return;
    }
    handleSubscribe(tier);
  };

  interface RazorpayCheckoutOptions {
    key: string;
    order_id: string;
    amount: number;
    currency: string;
    name: string;
    description: string;
    prefill?: { email?: string };
    handler?: () => void;
    modal?: { ondismiss?: () => void };
  }
  interface RazorpayCheckoutInstance {
    open: () => void;
  }
  type RazorpayWindow = Window & {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  };
  const razorpayWindow = window as unknown as RazorpayWindow;

  // Region-based payment routing: India-locale users pay via Razorpay (INR),
  // everyone else via Stripe (USD). Defaults to Stripe if locale is undetermined.
  const isIndianLocale = (): boolean => {
    try {
      const locale = Intl.NumberFormat().resolvedOptions().locale;
      return locale === 'en-IN' || locale === 'hi-IN' || locale.toLowerCase().endsWith('-in');
    } catch {
      return false;
    }
  };

  const loadRazorpayCheckoutScript = (): Promise<boolean> => {
    if (razorpayWindow.Razorpay) return Promise.resolve(true);
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleSubscribe = async (tier: UserTier, tokenOverride?: string | null) => {
    const token = tokenOverride ?? authToken;
    if (!token) {
      pushToast('Connect to your synced desktop account to upgrade.', 'info');
      return;
    }
    if (isIndianLocale()) {
      return handleSubscribeRazorpay(tier, token);
    }
    try {
      const res = await fetch(`${apiBase()}/api/billing/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.url) {
        setBackendStatus('online');
        window.open(data.url, '_blank');
        pushToast(`Redirecting to Stripe checkout for the ${TIER_LABELS[tier]} plan…`, 'info');
      } else {
        pushToast(`Upgrade failed: ${data.error || 'No checkout URL returned'}`, 'error');
      }
    } catch (err) {
      pushToast(`Upgrade error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const handleSubscribeRazorpay = async (tier: UserTier, tokenOverride?: string | null) => {
    const token = tokenOverride ?? authToken;
    if (!token) return;
    try {
      const res = await fetch(`${apiBase()}/api/billing/razorpay/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        pushToast(`Upgrade failed: ${data.error || 'Could not create Razorpay order'}`, 'error');
        return;
      }
      setBackendStatus('online');

      const loaded = await loadRazorpayCheckoutScript();
      if (!loaded || !razorpayWindow.Razorpay) {
        pushToast('Could not load Razorpay checkout. Check your connection and try again.', 'error');
        return;
      }

      const checkout = new razorpayWindow.Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: data.currency,
        name: 'Kryleos Forge',
        description: `Upgrade to ${TIER_LABELS[tier]} plan`,
        prefill: { email: authUser?.email },
        handler: () => {
          pushToast(`Payment received — ${TIER_LABELS[tier]} plan will activate shortly.`, 'success');
        },
        modal: {
          ondismiss: () => pushToast('Checkout closed.', 'info'),
        },
      });
      checkout.open();
    } catch (err) {
      pushToast(`Upgrade error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const handleToggleSync = (checked: boolean) => {
    if (userTier === 'free') {
      setShowSyncOverlay(true);
      setIsSyncEnabled(false);
    } else {
      setIsSyncEnabled(checked);
    }
  };

  // Prevent unused variables compilation errors
  if (false as boolean) {
    console.log(chatMessages, chatVoice, desktopLogs, handleSendChat);
  }

  return (
    <div className={`app-container ${theme === 'matrix' ? 'font-mono' : 'font-sans'}`}>
      {/* Navbar Header */}
      <header className="border-b border-[var(--line)] bg-[var(--surface-header)] px-6 py-4 flex flex-col gap-3 shrink-0 shadow-lg relative z-20">
        {/* Top row: logo + hamburger + auth */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Terminal className="text-[var(--accent)] animate-blink" size={20} />
            <div className="flex flex-col">
              <span className="text-[12px] font-bold tracking-widest text-[var(--accent)]">
                KRYLEOS FORGE // companion_hub
              </span>
              <span className="text-[10px] text-[var(--accent-dim)] uppercase tracking-wider">
                Secure Multi-Agent Web Companion
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Auth control — always visible */}
            {authUser ? (
              <>
                <button
                  onClick={() => setActiveTab('settings')}
                  className="flex items-center gap-2 px-3 py-1.5 border border-[var(--line)] rounded text-[10px] text-[var(--accent-dim)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all max-w-[180px]"
                  title={`Signed in as ${authUser.email} · ${TIER_LABELS[userTier]} plan`}
                >
                  <span className="w-5 h-5 rounded-full bg-[var(--surface-active)] border border-[var(--accent)] flex items-center justify-center shrink-0">
                    <User size={11} className="text-[var(--accent)]" />
                  </span>
                  <span className="flex flex-col items-start leading-tight min-w-0">
                    <span className="text-[var(--text-strong)] font-bold truncate max-w-[110px]">{authUser.name}</span>
                    <span className="text-[8px] uppercase tracking-wider text-[var(--accent)]">{TIER_LABELS[userTier]} plan</span>
                  </span>
                </button>
                <button
                  onClick={handleLogout}
                  aria-label="Log out"
                  title="Log out"
                  className="p-1.5 border border-[var(--line)] rounded text-[var(--accent-dim)] hover:border-[var(--danger)] hover:text-[var(--danger)] transition-all"
                >
                  <LogOut size={14} />
                </button>
              </>
            ) : (
              <button
                onClick={() => openAuth('login')}
                className="forge-btn forge-btn-primary px-4 py-1.5 text-[10px] font-bold uppercase rounded flex items-center gap-1.5"
              >
                <LogIn size={12} /> Log In
              </button>
            )}

            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-1.5 border border-[var(--line)] rounded text-[var(--accent-dim)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
              aria-label={isNavOpen ? 'Close navigation' : 'Open navigation'}
              onClick={() => setIsNavOpen(o => !o)}
            >
              {isNavOpen
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              }
            </button>
          </div>
        </div>

        {/* Nav Tabs — always visible on md+, toggle on mobile */}
        <nav
          aria-label="Main navigation"
          role="tablist"
          className={`${isNavOpen ? 'flex' : 'hidden'} md:flex flex-wrap justify-center gap-2`}
        >
          {APP_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setIsNavOpen(false); }}
              aria-label={
                tab === 'marketing' ? 'Overview tab' :
                tab === 'pricing' ? 'Pricing tab' :
                tab === 'planning' ? 'Planning tab' :
                tab === 'chat' ? 'Tutorial tab' :
                tab === 'downloads' ? 'Downloads tab' :
                'Settings tab'
              }
              aria-selected={activeTab === tab}
              role="tab"
              className={`px-4 py-1.5 border rounded text-[10px] uppercase font-bold cursor-pointer transition-all ${
                activeTab === tab
                  ? 'bg-[var(--surface-active)] text-[var(--accent)] border-[var(--accent)] shadow-[var(--glow-md)]'
                  : 'bg-transparent text-[var(--accent-dim)] border-[var(--line)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
              }`}
            >
              {
                tab === 'marketing' ? '✨ Overview' :
                tab === 'pricing' ? '💎 Pricing' :
                tab === 'planning' ? '📋 Planning' :
                tab === 'chat' ? '📖 Tutorial' :
                tab === 'downloads' ? '📥 Downloads' :
                '⚙️ Settings'
              }
            </button>
          ))}
        </nav>

      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex relative z-10">
        
        {/* MARKETING SITE TAB */}
        {activeTab === 'marketing' && (
          <div className="flex-1 overflow-y-auto p-8 space-y-12 max-w-5xl mx-auto">
            {/* Hero */}
            <div className="text-center space-y-4 py-8 animate-fadeIn">
              <h1 className="text-4xl font-extrabold text-[var(--text-strong)] tracking-tight leading-none uppercase">
                KRYLEOS <span className="text-[var(--accent)] text-shadow-[var(--glow-md)]">FORGE</span>
              </h1>
              <div className="inline-block px-3 py-1 bg-[var(--surface-accent)] border border-[var(--accent)] rounded text-[10px] text-[var(--accent)] font-mono font-extrabold tracking-widest uppercase mb-2">
                // AUTONOMOUS DEVELOPER PLANNER
              </div>
              <p className="text-sm text-[var(--accent-dim)] max-w-2xl mx-auto uppercase tracking-wider leading-relaxed">
                Kryleos Forge is a local-first developer workbench. Your code and agent runs never leave your machine, every plan-to-code step is captured as an inspectable trace, and you can approve or stop a running agent from your phone.
              </p>
              <div className="flex justify-center gap-4 pt-4">
                <button onClick={() => setActiveTab('planning')} className="forge-btn forge-btn-primary px-5 py-2.5 font-bold uppercase rounded">
                  [Start Scoping Plan]
                </button>
                <button onClick={() => setActiveTab('settings')} className="forge-btn px-5 py-2.5 font-bold uppercase rounded">
                  [Configure API Keys]
                </button>
              </div>
            </div>

            {/* Kryleos Group callout — draw visitors to the main site */}
            <a
              href="https://www.kryleos.com"
              target="_blank"
              rel="noopener noreferrer"
              className="group glass-panel block p-6 rounded border border-[var(--accent-line)] bg-[var(--surface-accent)] animate-fadeIn no-underline"
            >
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className="w-11 h-11 rounded-full bg-[var(--surface-active)] border border-[var(--accent)] flex items-center justify-center shrink-0 shadow-[var(--glow-sm)]">
                    <Gem size={20} className="text-[var(--accent)]" />
                  </span>
                  <div className="text-center sm:text-left">
                    <h2 className="text-md font-bold text-[var(--text-strong)] uppercase tracking-wider">
                      Part of the Kryleos Group
                    </h2>
                    <p className="text-[12px] text-[var(--accent-dim)] leading-relaxed">
                      Forge is one of many apps &amp; services we build. Explore the rest at kryleos.com.
                    </p>
                  </div>
                </div>
                <span className="forge-btn forge-btn-primary px-5 py-2.5 font-bold uppercase rounded flex items-center gap-2 whitespace-nowrap">
                  Visit Kryleos.com
                  <ExternalLink size={14} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </a>

            {/* CONCEPT CLARITY: Chat Assistant vs Developer Planner */}
            <div className="glass-panel p-6 rounded space-y-4 border border-[var(--accent-line)] bg-[var(--surface-deep)] animate-fadeIn">
              <h2 className="text-md font-bold text-[var(--text-strong)] uppercase tracking-wider text-center border-b border-[var(--line)] pb-2">
                Why Kryleos Forge is Actually a Planner (Not a Chatbot)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Legacy Chatbots */}
                <div className="border border-[var(--line-danger)] bg-[var(--surface-danger)] p-5 rounded space-y-3">
                  <div className="text-[var(--danger)] font-bold text-xs uppercase tracking-wider flex items-center gap-2">
                    <ShieldAlert size={14} />
                    <span>Legacy Chat Assistants (Outdated)</span>
                  </div>
                  <ul className="text-[11px] text-[var(--text-muted)] space-y-2 list-disc pl-4 font-sans font-medium">
                    <li>Vague conversations with zero structured tracking</li>
                    <li>Code is dumped into chat windows, leaving compilation to you</li>
                    <li>No concept of task lifecycle: you copy-paste files manually</li>
                    <li>Unmonitored executions with potential command injection risks</li>
                  </ul>
                </div>
                {/* Kryleos Planner */}
                <div className="border border-[var(--line)] bg-[var(--surface-accent)] p-5 rounded space-y-3">
                  <div className="text-[var(--accent)] font-bold text-xs uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck size={14} />
                    <span>Kryleos Developer Planner (10/10)</span>
                  </div>
                  <ul className="text-[11px] text-[var(--accent-soft)] space-y-2 list-disc pl-4 font-sans font-medium">
                    <li>{renderMd('**Checklist-First approach**: Prompts are immediately structured into granular planning files')}</li>
                    <li>{renderMd('**Multi-Agent Crew**: Specialized bots take tasks from the checklist to work in parallel')}</li>
                    <li>{renderMd('**Synchronized Status Board**: Track tasks moving across visual Kanban board columns')}</li>
                    <li>{renderMd('**Local Compile Sandboxes**: Code changes build and test securely within isolated loops')}</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Interactive Task Flow Simulator Section */}
            <div className="space-y-6 pt-6 animate-fadeIn">
              <h2 className="text-xl text-center font-bold text-[var(--text-strong)] uppercase tracking-wider flex items-center justify-center gap-2">
                <Terminal size={20} className="text-[var(--accent)]" /> Visual Task Lifecycle Simulator
              </h2>
              <p className="text-[13px] text-[var(--accent-dim)] text-center max-w-2xl mx-auto leading-relaxed">
                Observe the lifecycle flow of tasks along the planning-execution pipeline. Run the simulator to trace any task from initial scoping to sandbox compilation:
              </p>

              {/* The Simulator Widget */}
              <div className="glass-panel p-6 rounded space-y-6 relative border border-[var(--accent-line)]">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-[var(--text-strong)] uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="text-[var(--accent)]" size={18} />
                      Interactive Task Flow Simulator
                    </h3>
                    <p className="text-[11px] text-[var(--accent-dim)]">
                      Select or type a feature request and trace how Kryleos Forge plans, delegates, monitors, and compiles it.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* Preset Buttons */}
                    {(['auth', 'cache', 'api', 'custom'] as const).map(type => (
                      <button
                        key={type}
                        onClick={() => {
                          setSimTaskType(type);
                          if (simRunning) {
                            setSimRunning(false);
                          }
                          setSimStep(0);
                          setSimProgress(100);
                        }}
                        className={`px-3 py-1 border rounded text-[10px] uppercase font-bold transition-all cursor-pointer ${
                          simTaskType === type
                            ? 'bg-[var(--surface-active)] text-[var(--accent)] border-[var(--accent)] shadow-[var(--glow-sm)]'
                            : 'bg-transparent text-[var(--accent-dim)] border-[var(--line)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                        }`}
                      >
                        {type === 'auth' ? '🔒 Auth Flow' : type === 'cache' ? '⚡ DB Caching' : type === 'api' ? '🔌 GitHub API' : '✏️ Custom Task'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Input Box if Custom Task is selected */}
                {simTaskType === 'custom' && (
                  <div className="flex flex-col gap-2 p-4 bg-[var(--surface-overlay)] border border-[var(--line)] rounded animate-fadeIn">
                    <label className="text-[10px] uppercase text-[var(--accent-dim)] font-bold">Configure Custom Scoped Prompt</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={simCustomInput}
                        onChange={e => setSimCustomInput(e.target.value)}
                        placeholder="e.g., Integrate email confirmation using Nodemailer..."
                        className="forge-input flex-1 text-[12px] text-[var(--accent)]"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="text-[9px] text-[var(--accent-dim)] font-bold uppercase self-center">Suggestions:</span>
                      {['Add Stripe webhooks', 'Refactor routing', 'Dockerize backend'].map(s => (
                        <button
                          key={s}
                          onClick={() => setSimCustomInput(s)}
                          className="text-[9px] border border-[var(--line)] text-[var(--accent-dim)] hover:border-[var(--accent)] hover:text-[var(--accent)] px-2 py-0.5 rounded uppercase font-semibold cursor-pointer"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Simulator Controls & Progress Header */}
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center bg-[var(--surface-header)] border border-[var(--line)] p-3 rounded">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          if (simRunning) {
                            setSimRunning(false);
                          } else {
                            setSimRunning(true);
                            setSimStep(0);
                            setSimProgress(0);
                          }
                        }}
                        className="forge-btn forge-btn-primary px-4 py-1.5 text-[10px] font-bold rounded flex items-center gap-1.5"
                      >
                        <RefreshCw className={simRunning ? 'animate-spin' : ''} size={11} />
                        <span>{simRunning ? 'RUNNING...' : 'RUN LIFE-CYCLE SIMULATION'}</span>
                      </button>
                      {simRunning && (
                        <span className="text-[10px] text-[var(--accent)] font-mono animate-pulse uppercase">
                          Executing Phase {simStep + 1}/4: {simStep === 0 ? 'PLAN' : simStep === 1 ? 'CREW' : simStep === 2 ? 'FLOW' : 'FORGE'} ({simProgress}%)
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-[var(--accent-dim)] font-bold uppercase">
                      Active: {simTaskType === 'custom' ? `✏️ Custom: ${simCustomInput || 'User Scoped Task'}` : simTaskType === 'auth' ? '🔒 JWT Auth' : simTaskType === 'cache' ? '⚡ SQLite Caching' : '🔌 GitHub Sync'}
                    </span>
                  </div>

                  {/* Timeline Progress Bar */}
                  <div className="relative w-full h-1.5 bg-[var(--surface-accent)] border border-[var(--line-faint)] rounded overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full bg-[var(--accent)] transition-all duration-100 ease-out shadow-[var(--glow-md)]"
                      style={{ width: `${simRunning ? (simStep * 25 + simProgress / 4) : 100}%` }}
                    />
                  </div>

                  {/* Tab Navigation for Phases */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {['PLAN', 'CREW', 'FLOW', 'FORGE'].map((phase, idx) => {
                      const isActive = simStep === idx;
                      const isCompleted = simStep > idx || (!simRunning && simProgress === 100);
                      return (
                        <button
                          key={phase}
                          onClick={() => {
                            setSimRunning(false);
                            setSimStep(idx);
                            setSimProgress(100);
                          }}
                          className={`py-2 border rounded transition-all cursor-pointer ${
                            isActive
                              ? 'bg-[var(--surface-active)] border-[var(--accent)] text-[var(--accent)] shadow-[var(--glow-sm)] font-extrabold'
                              : isCompleted
                              ? 'border-[var(--line-strong)] text-[var(--accent)] font-semibold bg-[var(--surface-accent)]'
                              : 'border-[var(--line-faint)] text-[var(--accent-faint)] hover:border-[var(--line-strong)] hover:text-[var(--accent-dim)]'
                          }`}
                        >
                          <div className="text-[11px] uppercase tracking-wider">{idx + 1}. {phase}</div>
                          <div className="text-[10px] opacity-70">
                            {idx === 0 ? 'Scoper' : idx === 1 ? 'Squad' : idx === 2 ? 'Board' : 'Sandbox'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Simulation Active Pane */}
                <div className="min-h-[260px] bg-[var(--surface-overlay)] border border-[var(--line)] rounded p-6 flex flex-col justify-between relative overflow-hidden">
                  {/* Scanline Sweep Overlay */}
                  <div className="absolute inset-0 pointer-events-none opacity-5 bg-gradient-to-b from-transparent via-[var(--accent)] to-transparent bg-[length:100%_4px]" />

                  {/* PLAN (Step 0) Display */}
                  {simStep === 0 && (
                    <div className="space-y-4 animate-fadeIn">
                      <div className="flex justify-between items-center border-b border-[var(--line)] pb-2">
                        <span className="text-[var(--text-strong)] font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                          <FileText size={13} className="text-[var(--accent)]" />
                          <span>01 // PLAN phase: Structured Scoper & Checklist Architect</span>
                        </span>
                        <span className="text-[9px] bg-[var(--accent)] text-[var(--on-accent)] px-1.5 py-0.5 rounded font-extrabold uppercase font-mono">Checklists Ready</span>
                      </div>
                      <p className="text-[12px] text-[var(--accent-dim)] leading-relaxed">
                        Kryleos Forge parses the prompt to generate granular checklists mapping strict acceptance criteria. It generates the implementation plan structure offline.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                        {/* Checklist card */}
                        <div className="border border-[var(--line)] bg-[var(--surface-accent)] p-4 rounded space-y-2">
                          <div className="text-[9px] text-[var(--accent)] font-bold uppercase tracking-wider border-b border-[var(--line-faint)] pb-1">Generated Checklists</div>
                          <ul className="text-[11px] text-[var(--accent-soft)] space-y-1.5 font-mono">
                            {getPlanChecklist(simTaskType, simCustomInput).map((item, index) => {
                              const isVisible = !simRunning || simProgress > (index * 25);
                              return (
                                <li key={index} className={`flex items-start gap-1.5 transition-all duration-300 ${isVisible ? 'opacity-100' : 'opacity-0 translate-x-2'}`}>
                                  <span className="text-[var(--accent)] font-bold">{isVisible ? '[✓]' : '[ ]'}</span>
                                  <span>{item}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                        {/* Target files card */}
                        <div className="border border-[var(--line)] bg-[var(--surface-accent)] p-4 rounded space-y-2">
                          <div className="text-[9px] text-[var(--info)] font-bold uppercase tracking-wider border-b border-[var(--line-faint)] pb-1">Targeted Files & Components</div>
                          <div className="text-[11px] text-[var(--accent-soft)] space-y-2 font-mono">
                            {getPlanFiles(simTaskType).map((file, index) => {
                              const isVisible = !simRunning || simProgress > (index * 30 + 10);
                              return (
                                <div key={index} className={`flex items-center justify-between transition-all duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
                                  <span className="text-[var(--text-strong)] text-xs">{file.path}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${file.action === 'NEW' ? 'bg-cyan-950 border border-cyan-500 text-cyan-200' : 'bg-amber-950 border border-amber-500 text-amber-200'}`}>
                                    {file.action}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CREW (Step 1) Display */}
                  {simStep === 1 && (
                    <div className="space-y-4 animate-fadeIn">
                      <div className="flex justify-between items-center border-b border-[var(--line)] pb-2">
                        <span className="text-[var(--text-strong)] font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                          <Laptop size={13} className="text-[var(--accent)]" />
                          <span>02 // CREW phase: Autonomous Multi-Agent Squad</span>
                        </span>
                        <span className="text-[9px] bg-cyan-600 text-white px-1.5 py-0.5 rounded font-extrabold uppercase font-mono">Squad Engaged</span>
                      </div>
                      <p className="text-[12px] text-[var(--accent-dim)] leading-relaxed">
                        The planner constructs an agent crew (Architect, Developer, Auditor) to coordinate on the plan and divide task assignments.
                      </p>
                      
                      {/* Agent Avatars Row */}
                      <div className="grid grid-cols-3 gap-3">
                        {['Architect', 'Developer', 'Auditor'].map((role, idx) => {
                          const isRunningRole = simRunning && (
                            (idx === 0 && simProgress < 40) ||
                            (idx === 1 && simProgress >= 40 && simProgress < 80) ||
                            (idx === 2 && simProgress >= 80)
                          );
                          const isPastRole = !simRunning || (idx === 0 && simProgress >= 40) || (idx === 1 && simProgress >= 80);
                          return (
                            <div
                              key={role}
                              className={`p-3 rounded border text-center transition-all duration-300 ${
                                isRunningRole
                                  ? 'border-[var(--info)] bg-cyan-950/20 shadow-[0_0_8px_rgba(34,211,238,0.25)] scale-105'
                                  : isPastRole
                                  ? 'border-[var(--line-strong)] bg-[var(--surface-accent)]'
                                  : 'border-[var(--surface-active)] opacity-40'
                              }`}
                            >
                              <div className="text-xs font-bold text-[var(--text-strong)] uppercase">{role}</div>
                              <div className={`text-[10px] font-mono mt-1 ${isRunningRole ? 'text-[var(--info)] font-extrabold animate-pulse' : 'text-[var(--text-muted)]'}`}>
                                {isRunningRole ? '// COMPUTING...' : isPastRole ? '// IDLE' : '// READY'}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Dialog bubble logs */}
                      <div className="border border-[var(--line)] bg-[var(--surface-overlay)] p-3 rounded space-y-2 h-24 overflow-y-auto font-mono text-[10px]">
                        {getCrewMessages(simTaskType, simCustomInput).map((msg, index) => {
                          const isVisible = !simRunning || simProgress > (index * 35 + 10);
                          return (
                            <div key={index} className={`flex gap-2 transition-all duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
                              <span className="text-[var(--info)] font-bold uppercase w-16">{msg.agent}:</span>
                              <span className="text-[var(--accent-soft)]">{msg.msg}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* FLOW (Step 2) Display */}
                  {simStep === 2 && (
                    <div className="space-y-4 animate-fadeIn">
                      <div className="flex justify-between items-center border-b border-[var(--line)] pb-2">
                        <span className="text-[var(--text-strong)] font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                          <Database size={13} className="text-[var(--accent)]" />
                          <span>03 // FLOW phase: Realtime Kanban Status Board</span>
                        </span>
                        <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-extrabold uppercase font-mono">Sync Status</span>
                      </div>
                      <p className="text-[12px] text-[var(--accent-dim)] leading-relaxed">
                        Visual status board syncs planning checklists across Electron, web overlays, and mobile pair devices in real-time.
                      </p>

                      {/* Board visualizer columns */}
                      <div className="grid grid-cols-4 gap-2 font-mono text-[9px] pt-1">
                        {['BACKLOG', 'DEVELOPING', 'AUDIT REVIEW', 'FORGE READY'].map((col, idx) => {
                          const cardInCol = !simRunning
                            ? idx === 3
                            : (
                                (simProgress <= 25 && idx === 0) ||
                                (simProgress > 25 && simProgress <= 50 && idx === 1) ||
                                (simProgress > 50 && simProgress <= 75 && idx === 2) ||
                                (simProgress > 75 && idx === 3)
                              );
                          return (
                            <div key={col} className="border border-[var(--line-faint)] bg-[var(--surface-overlay)] p-2 rounded h-28 flex flex-col justify-start relative">
                              <span className="text-[var(--accent-dim)] font-bold block text-center border-b border-[var(--line-faint)] pb-1 uppercase">{col}</span>
                              {cardInCol && (
                                <div className="mt-2 p-2 bg-[var(--surface-accent)] border border-[var(--accent)] text-[var(--accent)] text-[10px] rounded shadow-[var(--glow-sm)] animate-pulse transition-all duration-300">
                                  <div className="font-bold uppercase leading-tight">{getFlowCardName(simTaskType, simCustomInput)}</div>
                                  <div className="text-[9px] text-[var(--text-muted)] uppercase mt-1">ID: #9948</div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* FORGE (Step 3) Display */}
                  {simStep === 3 && (
                    <div className="space-y-4 animate-fadeIn">
                      <div className="flex justify-between items-center border-b border-[var(--line)] pb-2">
                        <span className="text-[var(--text-strong)] font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                          <Terminal size={13} className="text-[var(--accent)]" />
                          <span>04 // FORGE phase: Safe Compilation Sandbox Terminal</span>
                        </span>
                        <span className="text-[9px] bg-purple-600 text-white px-1.5 py-0.5 rounded font-extrabold uppercase font-mono">Compiled</span>
                      </div>
                      <p className="text-[12px] text-[var(--accent-dim)] leading-relaxed">
                        Safe Express containers build source folders, run tests, and secure structural changes with offline git commit locks.
                      </p>

                      {/* Terminal display */}
                      <div className="border border-[var(--accent-line)] bg-[var(--surface-terminal)] p-3 rounded h-28 overflow-y-auto font-mono text-[9px] text-[var(--accent)] relative shadow-inner">
                        <div className="absolute top-1 right-2 text-[9px] text-[var(--accent-dim)] font-bold uppercase animate-pulse">TERMINAL CONSOLE</div>
                        <div className="space-y-1">
                          {getForgeCommands(simTaskType, simCustomInput).map((cmd, index) => {
                            const isVisible = !simRunning || simProgress > (index * 15 + 5);
                            if (!isVisible) return null;
                            const isOutput = !cmd.startsWith('npm') && !cmd.startsWith('vitest') && !cmd.startsWith('git') && !cmd.startsWith('node') && !cmd.startsWith('npx');
                            return (
                              <div key={index} className="transition-all duration-200">
                                {isOutput ? (
                                  <span className="text-[var(--accent-soft)]">{cmd}</span>
                                ) : (
                                  <span><span className="text-[var(--text-faint)] font-bold">$</span> {cmd}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Simulated Desktop Preview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 animate-fadeIn">
              <div className="glass-panel p-6 rounded flex flex-col gap-3">
                <div className="flex items-center gap-2.5 text-[var(--text-strong)] font-bold text-sm mb-1">
                  <Laptop size={16} className="text-[var(--accent)]" />
                  <span>Desktop App</span>
                </div>
                <p className="text-[12px] text-[var(--accent-dim)] leading-relaxed">
                  Executes local Express server sandboxes with secure process limits, safeStorage keychain access, and automated script testing tools.
                </p>
              </div>
              <div className="glass-panel p-6 rounded flex flex-col gap-3">
                <div className="flex items-center gap-2.5 text-[var(--text-strong)] font-bold text-sm mb-1">
                  <Database size={16} className="text-[var(--accent)]" />
                  <span>Web Companion</span>
                </div>
                <p className="text-[12px] text-[var(--accent-dim)] leading-relaxed">
                  Provides a secure BYOK prompt playground, live WebSocket telemetry trackers, and 3-way conflict merging for local plans.
                </p>
              </div>
              <div className="glass-panel p-6 rounded flex flex-col gap-3">
                <div className="flex items-center gap-2.5 text-[var(--text-strong)] font-bold text-sm mb-1">
                  <Smartphone size={16} className="text-[var(--accent)]" />
                  <span>Mobile Companion</span>
                </div>
                <p className="text-[12px] text-[var(--accent-dim)] leading-relaxed">
                  Approve terminal commands, toggle remote execution stops, and queue offline audio notes directly from your mobile device.
                </p>
              </div>
            </div>

            {/* App Overview & Core Principles */}
            <div className="space-y-6 pt-6 animate-fadeIn">
              <h2 className="text-xl text-center font-bold text-[var(--text-strong)] uppercase tracking-wider flex items-center justify-center gap-2">
                <Sparkles size={20} className="text-[var(--accent)]" /> App Overview & Core Principles
              </h2>
              <p className="text-[13px] text-[var(--accent-dim)] text-center max-w-2xl mx-auto leading-relaxed">
                Kryleos Forge plans, executes, and verifies development work without your code ever leaving your machine — and gives you a structured trace of what each agent did, plus the ability to supervise a local run from your phone.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                <div className="glass-panel p-6 rounded flex flex-col gap-3">
                  <div className="text-[var(--accent)] font-bold text-[12px] uppercase tracking-wider">
                    01 // Local-First Execution
                  </div>
                  <p className="text-[11px] text-[var(--accent-dim)] leading-relaxed">
                    Source code, system instructions, and agent runs never leave your machine. Use offline LLMs via native Ollama nodes with strict sandbox boundaries and execution filters.
                  </p>
                </div>
                <div className="glass-panel p-6 rounded flex flex-col gap-3">
                  <div className="text-[var(--accent)] font-bold text-[12px] uppercase tracking-wider">
                    02 // Inspectable Trace
                  </div>
                  <p className="text-[11px] text-[var(--accent-dim)] leading-relaxed">
                    Every plan item moves through PLAN → CREW → FLOW → FORGE with structured acceptance criteria, so you can see what each agent did and why — not just a chat transcript.
                  </p>
                </div>
                <div className="glass-panel p-6 rounded flex flex-col gap-3">
                  <div className="text-[var(--accent)] font-bold text-[12px] uppercase tracking-wider">
                    03 // Remote Supervision
                  </div>
                  <p className="text-[11px] text-[var(--accent-dim)] leading-relaxed">
                    Pair your phone or browser to your desktop over secure WebSockets to approve terminal commands, pause a run, or stop an agent — while everything still runs locally.
                  </p>
                </div>
              </div>
            </div>

            {/* Pricing CTA — full details live on the dedicated Pricing page */}
            <div className="glass-panel p-8 rounded space-y-5 text-center animate-fadeIn border border-[var(--accent-line)] bg-[var(--surface-deep)]">
              <h2 className="text-xl font-bold text-[var(--text-strong)] uppercase tracking-wider flex items-center justify-center gap-2">
                <Gem size={20} className="text-[var(--accent)]" /> Plans for Every Workflow
              </h2>
              <p className="text-[13px] text-[var(--accent-dim)] max-w-2xl mx-auto leading-relaxed">
                From a free local-first workspace to the Founder plan for power users — compare every tier, feature by feature, on the dedicated pricing page.
              </p>
              <div className="flex flex-wrap justify-center items-center gap-2 text-[11px] text-[var(--accent-dim)]">
                <span className="font-bold text-[var(--text-strong)]">Free</span><span className="opacity-50">·</span>
                <span className="font-bold text-[var(--warn)]">Solo $5</span><span className="opacity-50">·</span>
                <span className="font-bold text-[var(--info)]">Solo Plus $9</span><span className="opacity-50">·</span>
                <span className="font-bold text-[var(--accent)]">Founder $15</span>
              </div>
              <div className="pt-2">
                <button onClick={() => setActiveTab('pricing')} className="forge-btn forge-btn-primary px-6 py-2.5 font-bold uppercase rounded inline-flex items-center gap-2">
                  <Gem size={14} /> Explore Pricing & Plans
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PRICING TAB */}
        {activeTab === 'pricing' && (
          <div className="flex-1 overflow-y-auto p-8 space-y-10 max-w-6xl mx-auto">
            {/* Header */}
            <div className="text-center space-y-4 py-4 animate-fadeIn">
              <h1 className="text-4xl font-extrabold text-[var(--text-strong)] tracking-tight uppercase flex items-center justify-center gap-3">
                <Gem size={30} className="text-[var(--accent)]" /> Pricing & Plans
              </h1>
              <p className="text-sm text-[var(--accent-dim)] max-w-2xl mx-auto leading-relaxed">
                Kryleos Forge is local-first and free to start. Upgrade only when you need cross-device sync, remote compute, or organization-grade governance. Every paid tier includes all features of the tiers below it.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-[var(--accent-dim)]">
                <span className="text-[var(--text-strong)] font-bold uppercase">Feature Status Guide:</span>
                <FeatureBadge status="production" />
                <FeatureBadge status="preview" />
                <FeatureBadge status="simulator" />
                <FeatureBadge status="mock" label="Mock Billing" />
              </div>
            </div>

            {/* Tier cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-fadeIn">
              {/* Free */}
              <div className={`pricing-card pricing-card-free ${userTier === 'free' ? 'pricing-card-active' : ''}`}>
                <div className="border-b border-[var(--line)] pb-3 text-center space-y-1">
                  <span className="text-[10px] text-[var(--accent-dim)] font-bold uppercase block tracking-wider flex items-center justify-center gap-1.5"><Zap size={12} /> Free</span>
                  <span className="text-3xl font-extrabold text-[var(--text-strong)] block">$0</span>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase">forever</span>
                </div>
                <p className="text-[11px] text-[var(--accent-dim)] leading-relaxed min-h-[48px]">Best for solo developers getting started with local-first, zero-egress AI planning.</p>
                <ul className="text-[11px] text-[var(--accent-soft)] space-y-2 flex-1">
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Local agent workspace</li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> BYOK model access (DeepSeek, Gemini, OpenAI, Ollama)</li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Zero-egress local execution</li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Voice scoping & planning</li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> 1 paired device</li>
                  <li className="flex items-start gap-1.5 opacity-45"><X size={13} className="shrink-0 mt-0.5" /> Settings cloud sync</li>
                  <li className="flex items-start gap-1.5 opacity-45"><X size={13} className="shrink-0 mt-0.5" /> Remote containers</li>
                </ul>
                <button onClick={() => requestPlan('free')} className={`forge-btn w-full py-2 font-bold rounded ${userTier === 'free' ? 'forge-btn-primary' : ''}`}>
                  {userTier === 'free' ? '✓ Current Plan' : 'Get Started Free'}
                </button>
              </div>

              {/* Solo */}
              <div className={`pricing-card pricing-card-solo ${userTier === 'solo' ? 'pricing-card-active' : ''}`}>
                <div className="border-b border-[var(--line)] pb-3 text-center space-y-1">
                  <span className="text-[10px] text-[var(--warn)] font-bold uppercase block tracking-wider flex items-center justify-center gap-1.5"><RefreshCw size={12} /> Solo</span>
                  <span className="text-3xl font-extrabold text-[var(--text-strong)] block">$5<span className="text-[12px] font-normal text-[var(--warn)]">/mo</span></span>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase">billed monthly</span>
                </div>
                <p className="text-[11px] text-[var(--accent-dim)] leading-relaxed min-h-[48px]">Best for individuals who work across multiple machines and want their setup to follow them.</p>
                <ul className="text-[11px] text-[var(--accent-soft)] space-y-2 flex-1">
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Everything in Free</li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Settings cloud sync <FeatureBadge status="preview" /></li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Automatic cloud backups <FeatureBadge status="preview" /></li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Up to 3 paired devices</li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Email support</li>
                  <li className="flex items-start gap-1.5 opacity-45"><X size={13} className="shrink-0 mt-0.5" /> Remote containers</li>
                  <li className="flex items-start gap-1.5 opacity-45"><X size={13} className="shrink-0 mt-0.5" /> Organization RBAC</li>
                </ul>
                <button onClick={() => requestPlan('solo')} className={`forge-btn w-full py-2 font-bold rounded ${userTier === 'solo' ? 'forge-btn-primary' : ''}`}>
                  {userTier === 'solo' ? '✓ Current Plan' : 'Choose Solo'}
                </button>
              </div>

              {/* Solo Plus — highlighted */}
              <div className={`pricing-card pricing-card-solo_plus relative ${userTier === 'solo_plus' ? 'pricing-card-active' : ''}`}>
                <span className="absolute top-3 right-3 text-[9px] bg-[var(--info)] text-[#001018] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider">Popular</span>
                <div className="border-b border-[var(--line)] pb-3 text-center space-y-1">
                  <span className="text-[10px] text-[var(--info)] font-bold uppercase block tracking-wider flex items-center justify-center gap-1.5"><Sparkles size={12} /> Solo Plus</span>
                  <span className="text-3xl font-extrabold text-[var(--text-strong)] block">$9<span className="text-[12px] font-normal text-[var(--info)]">/mo</span></span>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase">billed monthly</span>
                </div>
                <p className="text-[11px] text-[var(--accent-dim)] leading-relaxed min-h-[48px]">Best for power users and freelancers who need remote compute and self-healing safeguards.</p>
                <ul className="text-[11px] text-[var(--accent-soft)] space-y-2 flex-1">
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Everything in Solo</li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Remote containers <FeatureBadge status="simulator" /></li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Cloud sandbox builds <FeatureBadge status="simulator" /></li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Semantic cache query <FeatureBadge status="preview" /></li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Self-healing rollback monitor <FeatureBadge status="preview" /></li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Up to 10 paired devices · Priority support</li>
                  <li className="flex items-start gap-1.5 opacity-45"><X size={13} className="shrink-0 mt-0.5" /> Organization RBAC</li>
                </ul>
                <button onClick={() => requestPlan('solo_plus')} className={`forge-btn w-full py-2 font-bold rounded ${userTier === 'solo_plus' ? 'forge-btn-primary' : ''}`}>
                  {userTier === 'solo_plus' ? '✓ Current Plan' : 'Choose Solo Plus'}
                </button>
              </div>

              {/* Founder */}
              <div className={`pricing-card pricing-card-founder ${userTier === 'founder' ? 'pricing-card-active' : ''}`}>
                <div className="border-b border-[var(--line)] pb-3 text-center space-y-1">
                  <span className="text-[10px] text-[var(--accent)] font-bold uppercase block tracking-wider flex items-center justify-center gap-1.5"><Building2 size={12} /> Founder</span>
                  <span className="text-3xl font-extrabold text-[var(--text-strong)] block">$15<span className="text-[12px] font-normal text-[var(--accent)]">/mo</span></span>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase">billed monthly</span>
                </div>
                <p className="text-[11px] text-[var(--accent-dim)] leading-relaxed min-h-[48px]">Best for teams and organizations that require governance, audit trails, and collaboration.</p>
                <ul className="text-[11px] text-[var(--accent-soft)] space-y-2 flex-1 font-medium">
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Everything in Solo Plus</li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Org team workspaces <FeatureBadge status="preview" /></li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Audit log & RBAC <FeatureBadge status="simulator" /></li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> WebRTC co-coding rooms <FeatureBadge status="preview" /></li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> SSO / SAML <FeatureBadge status="planned" /></li>
                  <li className="flex items-start gap-1.5"><Check size={13} className="text-[var(--accent)] shrink-0 mt-0.5" /> Unlimited devices · Dedicated support + SLA</li>
                </ul>
                <button onClick={() => requestPlan('founder')} className={`forge-btn w-full py-2 font-bold rounded ${userTier === 'founder' ? 'forge-btn-primary' : ''}`}>
                  {userTier === 'founder' ? '✓ Current Plan' : 'Choose Founder'}
                </button>
              </div>
            </div>

            {/* Detailed comparison matrix */}
            <div className="space-y-4 pt-4 animate-fadeIn">
              <h2 className="text-xl text-center font-bold text-[var(--text-strong)] uppercase tracking-wider flex items-center justify-center gap-2">
                <FileText size={18} className="text-[var(--accent)]" /> Full Feature Comparison
              </h2>
              <div className="glass-panel rounded overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[640px]">
                  <thead>
                    <tr className="border-b border-[var(--line-strong)]">
                      <th scope="col" className="p-3 text-[11px] uppercase font-bold text-[var(--text-strong)] tracking-wider">Capability</th>
                      {(USER_TIERS.map(id => [id, TIER_LABELS[id]]) as Array<[UserTier,string]>).map(([key, label]) => (
                        <th key={key} scope="col" className={`p-3 text-center text-[11px] uppercase font-bold tracking-wider ${userTier === key ? 'text-[var(--accent)]' : 'text-[var(--accent-dim)]'}`}>
                          {label}{userTier === key && <span className="block text-[8px] text-[var(--accent)] font-extrabold">● Current</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-[11px]">
                    {PRICING_MATRIX.map((row, i) => (
                      <tr key={i} className={`border-b border-[var(--line-faint)] ${row.group ? 'bg-[var(--surface-accent)]' : ''}`}>
                        <th scope="row" className={`p-3 font-medium text-left ${row.group ? 'text-[var(--accent)] uppercase text-[10px] font-bold tracking-wider' : 'text-[var(--accent-soft)]'}`}>
                          {row.label}{row.status && <FeatureBadge status={row.status} />}
                        </th>
                        {USER_TIERS.map(tier => (
                          <td key={tier} className={`p-3 text-center ${userTier === tier ? 'bg-[var(--surface-active)]' : ''}`}>
                            {row.group ? '' : typeof row.values[tier] === 'boolean'
                              ? (row.values[tier]
                                  ? <Check size={15} className="text-[var(--accent)] inline" aria-label="Included" />
                                  : <X size={15} className="text-[var(--text-faint)] inline" aria-label="Not included" />)
                              : <span className="text-[var(--accent-soft)] font-semibold">{row.values[tier]}</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] text-center">
                Billing is a local <FeatureBadge status="mock" label="Mock" /> simulation in this companion build — selecting a plan changes the active demo tier and unlocks the corresponding gated panels in Settings. No payment is processed.
              </p>
            </div>

            {/* FAQ */}
            <div className="space-y-4 pt-4 animate-fadeIn">
              <h2 className="text-xl text-center font-bold text-[var(--text-strong)] uppercase tracking-wider flex items-center justify-center gap-2">
                <Users size={18} className="text-[var(--accent)]" /> Frequently Asked
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {[
                  ['Is my code ever uploaded?', 'No. On every tier, source code and system instructions stay on your machine. Zero-egress execution routes through local Ollama models; cloud features only sync settings and plan metadata you opt into.'],
                  ['Can I bring my own API keys?', 'Yes — BYOK is available from the Free tier. Add DeepSeek, Gemini, or OpenAI keys in Settings, or run fully offline with Ollama.'],
                  ['What counts as a paired device?', 'Any desktop or mobile companion linked to your workspace via a pairing code. Free includes 1, Basic 3, Pro 10, and Enterprise is unlimited.'],
                  ['Can I change or cancel anytime?', 'Plans are month-to-month (Enterprise is billed annually per seat). Switch tiers instantly here — downgrades take effect at the end of the current cycle.'],
                ].map(([q, a]) => (
                  <div key={q} className="glass-panel p-5 rounded space-y-2">
                    <h3 className="text-[12px] font-bold text-[var(--text-strong)] uppercase tracking-wide">{q}</h3>
                    <p className="text-[11px] text-[var(--accent-dim)] leading-relaxed">{a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PLANNING PHASE TAB */}
        {activeTab === 'planning' && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Planning Chat */}
            <div className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-[var(--line)] bg-[var(--surface-overlay)] min-w-[320px]">
              <div className="p-3 border-b border-[var(--line)] bg-[var(--surface-header)] flex justify-between items-center text-[10px]">
                <span className="font-bold text-[var(--text-strong)] uppercase flex items-center gap-1.5">
                  <Sparkles size={12} className="text-[var(--accent)]" />
                  <span>Planning Architect (Draft Room)</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={`pulse-indicator ${backendStatus === 'online' ? 'pulse-indicator-online' : 'pulse-indicator-offline'}`} />
                  <span className="text-[var(--accent-dim)] uppercase text-[9px]">{backendStatus.toUpperCase()}</span>
                </div>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col justify-end">
                <div className="space-y-3 overflow-y-auto max-h-full pr-1">
                  {planMessages.map((msg, idx) => (
                    <div key={idx} className={`chat-bubble ${
                      msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-architect'
                    } mb-1`}>
                      <span className="text-[10px] text-[var(--text-strong)] opacity-60 font-bold block uppercase mb-1">{msg.role === 'user' ? '👤 CLIENT' : '🤖 ARCHITECT'}</span>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  ))}
                  {isStreaming && (
                    <div className="chat-bubble chat-bubble-architect animate-pulse">
                      Synthesizing architecture spec...
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 border-t border-[var(--line)] bg-[var(--surface-header)] flex gap-2">
                <input
                  type="text"
                  value={planInput}
                  onChange={e => setPlanInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendPlan()}
                  placeholder="Outline feature scopes, task lists, or folder structures..."
                  className="forge-input flex-1 text-[12px] text-[var(--accent)]"
                />
                {planVoice.isSupported && (
                  <button
                    type="button"
                    onClick={() => planVoice.isListening ? planVoice.stopListening() : planVoice.startListening()}
                    className={`border rounded px-3 transition-all ${planVoice.isListening ? 'border-[var(--danger)] text-[var(--danger)] bg-[var(--surface-danger)]' : 'border-[var(--line)] text-[var(--accent)] hover:border-[var(--accent)]'}`}
                    title={planVoice.isListening ? 'Stop voice input' : 'Start voice input'}
                    aria-label={planVoice.isListening ? 'Stop voice input' : 'Start voice input'}
                  >
                    {planVoice.isListening ? <MicOff size={14} /> : <Mic size={14} />}
                  </button>
                )}
                <button onClick={handleSendPlan} className="forge-btn forge-btn-primary px-4 font-bold">SEND</button>
              </div>
              {planVoice.error && <div className="px-3 pb-2 text-[9px] text-[var(--danger)]">{planVoice.error}</div>}
            </div>

            {/* Planning Draft Document */}
            <div className="w-full md:w-[48%] flex flex-col bg-[var(--surface-deep)] min-w-[320px]">
              <div className="p-3 border-b border-[var(--line)] flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-strong)] font-bold flex items-center gap-1.5">
                  <FileText size={12} className="text-[var(--accent)]" />
                  <span>implementation_plan.md</span>
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setIsPlanEditing(!isPlanEditing)} className="text-[9px] border border-[var(--accent-dim)] text-[var(--accent-dim)] px-3 py-1 rounded font-bold hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all">
                    {isPlanEditing ? 'VIEW' : 'EDIT'}
                  </button>
                  <button onClick={() => handleImportRequest()} className="forge-btn forge-btn-primary text-[9px] px-3 py-1 rounded font-bold flex items-center gap-1.5">
                    <Download size={11} />
                    <span>IMPORT PLAN</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 p-4 flex flex-col">
                {isPlanEditing ? (
                  <textarea
                    value={planDraft}
                    onChange={e => {
                      setPlanDraft(e.target.value);
                      if (syncConflict && !e.target.value.includes('<<<<<<<')) {
                        setSyncConflict(false);
                      }
                    }}
                    className="w-full flex-1 bg-[var(--surface-terminal)] border border-[var(--line)] text-[12px] text-[var(--accent)] p-4 outline-none resize-none font-mono rounded"
                  />
                ) : (
                  <div className="flex-1 bg-[var(--surface-overlay)] border border-[var(--line)] text-[12px] text-[var(--accent-soft)] p-4 overflow-auto whitespace-pre-wrap select-text leading-relaxed rounded font-mono">
                    {planDraft}
                  </div>
                )}
              </div>

              {syncConflict && (
                <div className="p-3 bg-[var(--surface-warn)] text-[var(--warn)] text-[10px] uppercase font-bold text-center border-t border-amber-500 animate-pulse font-mono">
                  ⚠️ SYNC CONFLICT DETECTED! Merge conflict markers have been injected. Please resolve them in EDIT mode.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TUTORIAL SECTION TAB */}
        {activeTab === 'chat' && (
          <div className="flex-1 overflow-y-auto p-8 space-y-12 max-w-5xl mx-auto">
            <div className="text-center space-y-4 py-4">
              <h1 className="text-3xl font-extrabold text-[var(--text-strong)] tracking-tight uppercase">
                App Tutorial & Guide
              </h1>
              <p className="text-xs text-[var(--accent-dim)] max-w-xl mx-auto uppercase tracking-wider leading-relaxed">
                Learn how to pair devices, scope checklists, and run secure agent tasks in your local environment.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Step 1 */}
              <div className="glass-panel p-6 rounded flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-extrabold text-[var(--accent)] bg-[var(--surface-active)] border border-[var(--accent)] w-10 h-10 rounded-full flex items-center justify-center shadow-lg">1</span>
                  <div>
                    <h3 className="text-[var(--text-strong)] font-bold text-sm uppercase">Initialize & Configure</h3>
                    <span className="text-[9px] text-[var(--text-muted)] uppercase font-semibold">Step 01 // Configuration</span>
                  </div>
                </div>
                <p className="text-[12px] text-[var(--accent-dim)] leading-relaxed">
                  {renderMd('Start by launching the desktop application. Navigate to the **Settings** tab to input your API credentials (or enable **Zero-Egress Mode** to route queries exclusively via local Ollama models). Test each connection using the health-check ping controls.')}
                </p>
              </div>

              {/* Step 2 */}
              <div className="glass-panel p-6 rounded flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-extrabold text-[var(--accent)] bg-[var(--surface-active)] border border-[var(--accent)] w-10 h-10 rounded-full flex items-center justify-center shadow-lg">2</span>
                  <div>
                    <h3 className="text-[var(--text-strong)] font-bold text-sm uppercase">Verbal Scoping & Planning</h3>
                    <span className="text-[9px] text-[var(--text-muted)] uppercase font-semibold">Step 02 // Checklists scoping</span>
                  </div>
                </div>
                <p className="text-[12px] text-[var(--accent-dim)] leading-relaxed">
                  {renderMd('Use the **Planning** tab to organize your next coding roadmap. Press the **Voice Input** microphone button to speak features naturally. The assistant will parse your voice notes, output structured Markdown, and expand tasks into actionable checklists.')}
                </p>
              </div>

              {/* Step 3 */}
              <div className="glass-panel p-6 rounded flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-extrabold text-[var(--accent)] bg-[var(--surface-active)] border border-[var(--accent)] w-10 h-10 rounded-full flex items-center justify-center shadow-lg">3</span>
                  <div>
                    <h3 className="text-[var(--text-strong)] font-bold text-sm uppercase">WebSocket Pairing</h3>
                    <span className="text-[9px] text-[var(--text-muted)] uppercase font-semibold">Step 03 // Device Linking</span>
                  </div>
                </div>
                <p className="text-[12px] text-[var(--accent-dim)] leading-relaxed">
                  {renderMd('Bridge your workspace across devices. Copy the active pairing code generated by the desktop server, input it in the web companion header, and click **Connect**. Once paired, WebSocket streams will broadcast telemetry data and logs dynamically.')}
                </p>
              </div>

              {/* Step 4 */}
              <div className="glass-panel p-6 rounded flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-extrabold text-[var(--accent)] bg-[var(--surface-active)] border border-[var(--accent)] w-10 h-10 rounded-full flex items-center justify-center shadow-lg">4</span>
                  <div>
                    <h3 className="text-[var(--text-strong)] font-bold text-sm uppercase">Sandbox Verification</h3>
                    <span className="text-[9px] text-[var(--text-muted)] uppercase font-semibold">Step 04 // Command Approvals</span>
                  </div>
                </div>
                <p className="text-[12px] text-[var(--accent-dim)] leading-relaxed">
                  Run planning tasks within the local shell container. When an agent attempts destructive file writes or executes command lines, review and authorize them directly on your dashboard (or dismiss them from the mobile companion app).
                </p>
              </div>
            </div>

            {/* Live System Telemetry Monitor Section */}
            <div className="space-y-6 pt-6">
              <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
                <h2 className="text-xl font-bold text-[var(--text-strong)] uppercase tracking-wider flex items-center gap-2">
                  <Terminal size={20} className="text-[var(--accent)]" /> Live System Telemetry Monitor
                </h2>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className={`pulse-indicator ${companionStatus === 'connected' ? 'pulse-indicator-online' : 'pulse-indicator-offline'}`} />
                  <span className="text-[var(--accent-dim)] uppercase font-bold">
                    {companionStatus === 'connected' ? 'WS STREAM ACTIVE' : 'LOCAL SIMULATOR ACTIVE'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* CPU Monitor */}
                <div className="glass-panel p-6 rounded flex flex-col gap-4">
                  <div className="flex justify-between items-center text-[var(--text-strong)] font-bold text-sm">
                    <span className="uppercase tracking-wider">01 // CPU Load Monitor</span>
                    <span className="font-mono text-[var(--accent)] text-base">
                      {cpuHistory[cpuHistory.length - 1]}%
                    </span>
                  </div>
                  
                  {/* SVG Chart */}
                  <div className="relative h-32 bg-[var(--surface-overlay)] border border-[var(--line-faint)] rounded overflow-hidden">
                    {/* Grid Lines */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                      <line x1="0" y1="20" x2="300" y2="20" stroke="rgba(16, 185, 129, 0.05)" strokeWidth="1" />
                      <line x1="0" y1="50" x2="300" y2="50" stroke="rgba(16, 185, 129, 0.05)" strokeWidth="1" />
                      <line x1="0" y1="80" x2="300" y2="80" stroke="rgba(16, 185, 129, 0.05)" strokeWidth="1" />
                      <line x1="75" y1="0" x2="75" y2="100" stroke="rgba(16, 185, 129, 0.05)" strokeWidth="1" />
                      <line x1="150" y1="0" x2="150" y2="100" stroke="rgba(16, 185, 129, 0.05)" strokeWidth="1" />
                      <line x1="225" y1="0" x2="225" y2="100" stroke="rgba(16, 185, 129, 0.05)" strokeWidth="1" />
                    </svg>

                    <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                      {/* Area Fill */}
                      <path
                        d={(() => {
                          const points = cpuHistory.map((val, i) => {
                            const x = (i / (cpuHistory.length - 1)) * 300;
                            const y = 100 - (val / 100) * 80 - 10;
                            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                          }).join(' ');
                          return points ? `${points} L 300 100 L 0 100 Z` : 'M 0 100 Z';
                        })()}
                        fill="url(#cpuGrad)"
                        opacity="0.3"
                      />
                      {/* Line Stroke */}
                      <path
                        d={cpuHistory.map((val, i) => {
                          const x = (i / (cpuHistory.length - 1)) * 300;
                          const y = 100 - (val / 100) * 80 - 10;
                          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                        }).join(' ')}
                        fill="none"
                        stroke="var(--forge-neon)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="filter drop-shadow-[0_0_4px_var(--forge-neon)]"
                      />
                      <defs>
                        <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--forge-neon)" />
                          <stop offset="100%" stopColor="transparent" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <span className="text-[10px] text-[var(--accent-dim)] uppercase tracking-wider font-semibold">
                    Simulated multi-agent thread operations load bounds
                  </span>
                </div>

                {/* Memory Monitor */}
                <div className="glass-panel p-6 rounded flex flex-col gap-4">
                  <div className="flex justify-between items-center text-[var(--text-strong)] font-bold text-sm">
                    <span className="uppercase tracking-wider">02 // Memory Allocation</span>
                    <span className="font-mono text-[var(--forge-purple)] text-base">
                      {memoryHistory[memoryHistory.length - 1]} MB
                    </span>
                  </div>
                  
                  {/* SVG Chart */}
                  <div className="relative h-32 bg-[var(--surface-overlay)] border border-[var(--line-faint)] rounded overflow-hidden">
                    {/* Grid Lines */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                      <line x1="0" y1="20" x2="300" y2="20" stroke="rgba(187, 102, 255, 0.05)" strokeWidth="1" />
                      <line x1="0" y1="50" x2="300" y2="50" stroke="rgba(187, 102, 255, 0.05)" strokeWidth="1" />
                      <line x1="0" y1="80" x2="300" y2="80" stroke="rgba(187, 102, 255, 0.05)" strokeWidth="1" />
                      <line x1="75" y1="0" x2="75" y2="100" stroke="rgba(187, 102, 255, 0.05)" strokeWidth="1" />
                      <line x1="150" y1="0" x2="150" y2="100" stroke="rgba(187, 102, 255, 0.05)" strokeWidth="1" />
                      <line x1="225" y1="0" x2="225" y2="100" stroke="rgba(187, 102, 255, 0.05)" strokeWidth="1" />
                    </svg>

                    <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                      {/* Area Fill */}
                      <path
                        d={(() => {
                          const points = memoryHistory.map((val, i) => {
                            const x = (i / (memoryHistory.length - 1)) * 300;
                            const y = 100 - (val / 512) * 80 - 10;
                            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                          }).join(' ');
                          return points ? `${points} L 300 100 L 0 100 Z` : 'M 0 100 Z';
                        })()}
                        fill="url(#memGrad)"
                        opacity="0.3"
                      />
                      {/* Line Stroke */}
                      <path
                        d={memoryHistory.map((val, i) => {
                          const x = (i / (memoryHistory.length - 1)) * 300;
                          const y = 100 - (val / 512) * 80 - 10;
                          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                        }).join(' ')}
                        fill="none"
                        stroke="var(--forge-purple)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="filter drop-shadow-[0_0_4px_var(--forge-purple)]"
                      />
                      <defs>
                        <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--forge-purple)" />
                          <stop offset="100%" stopColor="transparent" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <span className="text-[10px] text-[var(--accent-dim)] uppercase tracking-wider font-semibold">
                    Dynamic process heap telemetry limits (Cap: 512 MB)
                  </span>
                </div>
              </div>
            </div>

            {/* Breathing / Stress Coach Note */}
            <div className="glass-panel p-6 rounded bg-[var(--surface-deep)] border-[var(--warn-line)] flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-[var(--text-strong)] font-bold text-xs uppercase flex items-center gap-1.5">
                  <Sparkles size={12} className="text-[var(--accent)] animate-pulse" />
                  Developer Stress Pacing System
                </h4>
                <p className="text-[11px] text-[var(--accent-dim)] leading-relaxed">
                  Stressed during execution loops? Use our structured box breathing guide inside the mobile companion (4s inhale, 4s hold, 4s exhale, 4s hold) to stay coherent and maintain focus.
                </p>
              </div>
              <button onClick={() => setActiveTab('planning')} className="forge-btn whitespace-nowrap">
                [GO TO PLANNING SPACE]
              </button>
            </div>
          </div>
        )}

        {/* DOWNLOADS TAB */}
        {activeTab === 'downloads' && (
          <div className="flex-1 overflow-y-auto p-8 space-y-12 max-w-5xl mx-auto">
            <div className="text-center space-y-4 py-4">
              <h1 className="text-3xl font-extrabold text-[var(--text-strong)] tracking-tight uppercase">
                Download Client Apps
              </h1>
              <p className="text-xs text-[var(--accent-dim)] max-w-xl mx-auto uppercase tracking-wider leading-relaxed">
                Install Kryleos Forge on your local devices to enable sandboxed terminal execution, remote haptics, and planning sync.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Desktop App */}
              <div className="glass-panel p-8 rounded flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-[var(--text-strong)] font-bold text-base">
                    <Laptop size={22} className="text-[var(--accent)]" />
                    <span>Desktop App Client</span>
                    <span className="text-[9px] bg-green-950 border border-green-500 text-green-200 px-2 py-0.5 rounded font-extrabold shrink-0">v1.2.0</span>
                  </div>
                  <p className="text-[12px] text-[var(--accent-dim)] leading-relaxed">
                    The primary engine for local development. Houses the Express backend, safeStorage keychain integration, parametric execution limits, and the Founder/Agency dashboard generators.
                  </p>
                  <ul className="text-[11px] text-[var(--accent-dim)] space-y-2 list-disc pl-4 font-sans font-medium">
                    <li>Zero-Egress local execution via Ollama and shell sandboxing</li>
                    <li>Secure AES-256 local database for chat history caching</li>
                    <li>Automated test runner and release QA checklist reporting tools</li>
                  </ul>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  <button onClick={() => pushToast('Preparing NSIS installer for Windows (x64)…', 'info')} className="forge-btn forge-btn-primary w-full py-2.5 font-bold uppercase">
                    [DOWNLOAD FOR WINDOWS (x64)]
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => pushToast('Preparing macOS DMG package…', 'info')} className="forge-btn w-[48%] py-2 font-bold uppercase">
                      [MACOS (ARM/INTEL)]
                    </button>
                    <button onClick={() => pushToast('Preparing Linux DEB package…', 'info')} className="forge-btn w-[48%] py-2 font-bold uppercase">
                      [LINUX (DEB/RPM)]
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile Companion */}
              <div className="glass-panel p-8 rounded flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-[var(--text-strong)] font-bold text-base">
                    <Smartphone size={22} className="text-[var(--accent)]" />
                    <span>Mobile Companion Client</span>
                    <span className="text-[9px] bg-green-950 border border-green-500 text-green-200 px-2 py-0.5 rounded font-extrabold shrink-0">v1.0.4</span>
                  </div>
                  <p className="text-[12px] text-[var(--accent-dim)] leading-relaxed">
                    Take your plans on the go. Approve terminal tasks using secure haptics, view WebSocket telemetry streams, record offline speech notes, and track your today score metrics.
                  </p>
                  <ul className="text-[11px] text-[var(--accent-dim)] space-y-2 list-disc pl-4 font-sans font-medium">
                    <li>Command review haptic feedback triggers</li>
                    <li>Live WebSocket telemetry logs tracking CPU/memory delta</li>
                    <li>Coherent box breathing guidelines for stress tracking</li>
                  </ul>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  <button onClick={() => pushToast('Redirecting to the Apple App Store…', 'info')} className="forge-btn w-full py-2.5 font-bold uppercase">
                    [GET ON APPLE APP STORE]
                  </button>
                  <button onClick={() => pushToast('Redirecting to the Google Play Store…', 'info')} className="forge-btn w-full py-2.5 font-bold uppercase">
                    [GET ON GOOGLE PLAY STORE]
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto space-y-6">
            <h2 className="text-lg font-bold text-[var(--text-strong)] border-b border-[var(--line)] pb-2 uppercase tracking-wider">
              Local Web Configuration Settings
            </h2>

            <form onSubmit={handleSaveSettings} className="space-y-6">
              <div className="text-[10px] text-[var(--accent)] uppercase font-extrabold flex items-center justify-between border-b border-[var(--line)] pb-2 mb-2 tracking-wider">
                <span>Configure model parameters</span>
                <FeatureBadge status="mock" label="Mock keychain" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase text-[var(--accent-dim)] font-bold flex items-center gap-1.5">
                  <Key size={12} />
                  <span>DeepSeek API Key</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="forge-input"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase text-[var(--accent-dim)] font-bold flex items-center gap-1.5">
                  <Key size={12} />
                  <span>Google Gemini API Key</span>
                </label>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={e => setGeminiApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="forge-input"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase text-[var(--accent-dim)] font-bold flex items-center gap-1.5">
                  <Key size={12} />
                  <span>OpenAI API Key</span>
                </label>
                <input
                  type="password"
                  value={openaiApiKey}
                  onChange={e => setOpenaiApiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="forge-input"
                />
              </div>

              {/* PII Compliance Gating */}
              <div className="border border-[var(--line)] bg-[var(--surface-overlay)] p-3 rounded flex flex-col gap-2 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase font-bold text-[var(--text-strong)] flex items-center gap-2">
                    <ShieldCheck size={13} className="text-[var(--accent)]" />
                    <span>PII Compliance Filter</span>
                  </span>
                  <input
                    type="checkbox"
                    aria-label="Enable PII compliance filter"
                    checked={piiFilterEnabled}
                    onChange={(e) => {
                      setPiiFilterEnabled(e.target.checked);
                      localStorage.setItem('web_pii_filter_enabled', String(e.target.checked));
                    }}
                    className="accent-[var(--accent)] cursor-pointer h-4 w-4 border border-[var(--line)] rounded"
                  />
                </div>
                <span className="text-[var(--accent-dim)] text-[10px] leading-relaxed">
                  Redact sensitive API keys, email addresses, and phone numbers automatically before sending payloads.
                </span>
              </div>

              {/* Realtime Socket Telemetry (Compression / Bandwidth) */}
              <div className="border border-[var(--accent-line)] bg-[var(--surface-accent)] p-3 rounded flex flex-col gap-2 font-mono text-[10px] shadow-lg">
                <span className="text-[var(--accent)] font-bold uppercase text-[10px] flex items-center justify-between border-b border-[var(--accent-line)] pb-2">
                  <span>⚡ WebSocket Telemetry</span>
                  <FeatureBadge status="preview" label="Preview telemetry" />
                </span>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[var(--accent-dim)]">Bytes Transmitted:</span>
                    <span className="text-[var(--text-strong)] font-bold">{(telemetry.bytesSent / 1024).toFixed(2)} KB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--accent-dim)]">Bytes Received:</span>
                    <span className="text-[var(--text-strong)] font-bold">{(telemetry.bytesReceived / 1024).toFixed(2)} KB</span>
                  </div>
                  <div className="flex justify-between border-t border-[var(--line)] pt-2 mt-1">
                    <span className="text-[var(--accent-dim)]">Compression Savings:</span>
                    <span className="text-[var(--accent)] font-bold">{(telemetry.compressionSavingsRatio * 100).toFixed(0)}% (zlib deflate)</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <span className="text-[10px] uppercase text-[var(--accent-dim)] font-bold">Console Styling Theme</span>
                <div className="flex gap-2">
                  {['forge', 'matrix', 'light'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTheme(t)}
                      className={`flex-1 py-2 text-[10px] uppercase font-bold rounded border cursor-pointer transition-all ${
                        theme === t 
                          ? 'bg-[var(--surface-active)] border-[var(--accent)] text-[var(--accent)] shadow-[var(--glow-md)]' 
                          : 'bg-transparent border-[var(--line)] text-[var(--accent-dim)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                      }`}
                    >
                      {t === 'forge' ? 'Forge Dark' : t === 'matrix' ? 'Terminal Style' : 'Light Mode'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase text-[var(--accent-dim)] font-bold">Desktop Backend URL</label>
                <input
                  type="text"
                  value={backendUrl}
                  onChange={e => setBackendUrl(e.target.value)}
                  placeholder="http://localhost:3001"
                  className="forge-input"
                />
                <span className={`text-[10px] uppercase font-bold ${backendStatus === 'online' ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}>
                  Backend status: {backendStatus.toUpperCase()}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase text-[var(--accent-dim)] font-bold">Companion Pairing Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pairingCode}
                    onChange={e => setPairingCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    className="forge-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={toggleCompanionConnection}
                    className={`forge-btn px-5 font-bold border transition-all ${
                      companionStatus === 'connected' ? 'border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--surface-danger)]' : 'border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--surface-active)]'
                    }`}
                  >
                    {companionStatus === 'connected' ? 'UNPAIR' : companionStatus === 'connecting' ? 'PAIRING...' : 'PAIR'}
                  </button>
                </div>
                <span className={`text-[10px] uppercase font-bold ${
                  companionStatus === 'connected' ? 'text-[var(--accent)]' : companionStatus === 'error' ? 'text-[var(--danger)]' : 'text-[var(--accent-dim)]'
                }`}>
                  Companion status: {companionStatus.toUpperCase()}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase text-[var(--accent-dim)] font-bold">Custom System Instructions</label>
                <textarea
                  value={customInstructions}
                  onChange={e => setCustomInstructions(e.target.value)}
                  placeholder="Instruct models on coding standards..."
                  rows={2}
                  className="forge-input resize-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase text-[var(--accent-dim)] font-bold">Response Mode</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {([
                    ['balanced', 'Balanced'],
                    ['concise', 'Concise'],
                    ['critical', 'Critical'],
                    ['brutal_audit', 'Audit']
                  ] as Array<[ResponseMode, string]>).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setResponseMode(mode)}
                      className={`border rounded py-1.5 text-[10px] font-bold transition-all ${
                        responseMode === mode ? 'border-[var(--accent)] bg-[var(--surface-active)] text-[var(--text-strong)] shadow-[var(--glow-sm)]' : 'border-[var(--line)] text-[var(--accent-dim)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-4">
                <label className="text-[10px] uppercase text-[var(--accent-dim)] font-bold">Thinking Capability</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {([
                    ['low', 'Low'],
                    ['medium', 'Medium'],
                    ['high', 'High'],
                    ['ultra', 'Ultra']
                  ] as Array<['low' | 'medium' | 'high' | 'ultra', string]>).map(([cap, label]) => (
                    <button
                      key={cap}
                      type="button"
                      onClick={() => setThinkingCapability(cap)}
                      className={`border rounded py-1.5 text-[10px] font-bold transition-all ${
                        thinkingCapability === cap ? 'border-[var(--accent)] bg-[var(--surface-active)] text-[var(--text-strong)] shadow-[var(--glow-sm)]' : 'border-[var(--line)] text-[var(--accent-dim)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gated Cloud Sync */}
              <div className="border border-[var(--line)] bg-[var(--surface-deep)] p-4 rounded space-y-2 relative shadow-md">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="sync-chk"
                    checked={isSyncEnabled}
                    onChange={e => handleToggleSync(e.target.checked)}
                    className="cursor-pointer"
                  />
                  <label htmlFor="sync-chk" className="text-[10px] uppercase font-bold text-[var(--text-strong)] flex items-center gap-1.5 cursor-pointer select-none">
                    <RefreshCw size={11} className="text-[var(--accent)]" />
                    <span>Enable Settings Cloud Sync</span>
                  </label>
                  <span className="text-[10px] bg-[var(--line)] text-[var(--accent)] border border-[var(--accent)] px-1.5 rounded font-bold shrink-0">BASIC+</span>
                  <FeatureBadge status="preview" />
                </div>
                <p className="text-[10px] text-[var(--accent-dim)] leading-relaxed">Syncs model settings and active project checklists across devices.</p>

                {showSyncOverlay && (
                  <div className="absolute inset-0 bg-[var(--backdrop)] flex items-center justify-between p-4 border border-[var(--danger)] rounded z-30">
                    <div className="flex items-center gap-2 text-[var(--danger)] text-[10px] font-bold">
                      <ShieldAlert size={14} />
                      <span>Sync locked: Upgrade to Basic Plan ($2.99/mo)</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setUserTier('solo'); setShowSyncOverlay(false); setIsSyncEnabled(true); }} className="text-[9px] bg-amber-800 text-white px-3 py-1 rounded font-bold hover:bg-amber-900 transition-all">UPGRADE</button>
                      <button type="button" onClick={() => setShowSyncOverlay(false)} className="text-[9px] border border-[var(--line-strong)] text-[var(--text-muted)] px-3 py-1 rounded hover:text-[var(--text-strong)] transition-all">CANCEL</button>
                    </div>
                  </div>
                )}
              </div>

              {/* WebRTC Collaboration Gated Sync */}
              <div className="border border-[var(--line)] bg-[var(--surface-deep)] p-4 rounded space-y-2 relative shadow-md">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="collab-chk"
                    checked={collabActive}
                    onChange={e => {
                      if (userTier !== 'founder') {
                        setShowCollabOverlay(true);
                      } else {
                        setCollabActive(e.target.checked);
                      }
                    }}
                    className="cursor-pointer"
                  />
                  <label htmlFor="collab-chk" className="text-[10px] uppercase font-bold text-[var(--text-strong)] flex items-center gap-1.5 cursor-pointer select-none">
                    <Laptop size={11} className="text-[var(--accent)]" />
                    <span>WebRTC Collaboration Room</span>
                  </label>
                  <span className="text-[10px] bg-[var(--accent)] text-[var(--on-accent)] border border-[var(--accent)] px-1.5 rounded font-extrabold shrink-0">ENTERPRISE</span>
                  <FeatureBadge status="preview" />
                </div>
                <p className="text-[10px] text-[var(--accent-dim)] leading-relaxed">Preview real-time co-coding indicators, terminal stream status, and active agent pairing sessions.</p>
                {collabActive && (
                  <div className="text-[10px] bg-[var(--surface-accent)] border border-[var(--accent)] p-2 rounded text-[var(--accent)] animate-pulse font-mono">
                    📡 COLLAB SESSION ACTIVE: Connected to signaling channel token room.
                  </div>
                )}

                {showCollabOverlay && (
                  <div className="absolute inset-0 bg-[var(--backdrop)] flex items-center justify-between p-4 border border-[var(--danger)] rounded z-30">
                    <div className="flex items-center gap-2 text-[var(--danger)] text-[10px] font-bold">
                      <ShieldAlert size={14} />
                      <span>Collab locked: Upgrade to Enterprise ($25/mo)</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setUserTier('founder'); setShowCollabOverlay(false); setCollabActive(true); }} className="text-[9px] bg-green-950 border border-green-500 text-green-200 px-3 py-1 rounded font-bold hover:bg-green-900 transition-all">UPGRADE</button>
                      <button type="button" onClick={() => setShowCollabOverlay(false)} className="text-[9px] border border-[var(--line-strong)] text-[var(--text-muted)] px-3 py-1 rounded hover:text-[var(--text-strong)] transition-all">CANCEL</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Semantic Cache Query Panel */}
              <div className="border border-[var(--line)] bg-[var(--surface-deep)] p-4 rounded space-y-2 relative shadow-md">
                <div className="flex items-center gap-2">
                  <Database size={11} className="text-[var(--accent)]" />
                  <span className="text-[10px] uppercase font-bold text-[var(--text-strong)]">Semantic Cache Query</span>
                  <span className="text-[10px] bg-blue-900 text-blue-200 border border-blue-500 px-1.5 rounded font-bold shrink-0">PRO+</span>
                  <FeatureBadge status="preview" />
                </div>
                <p className="text-[10px] text-[var(--accent-dim)] leading-relaxed">Index and query workspace symbols, functions, and type definitions from a local semantic cache.</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={semanticQuery}
                    onChange={e => {
                      const q = e.target.value;
                      setSemanticQuery(q);
                      if (userTier !== 'solo_plus' && userTier !== 'founder') {
                        setShowSemanticLock(true);
                        return;
                      }
                      if (q.trim()) {
                        const mockAll = [
                          { symbol: 'handleSendChat', file: 'src/App.tsx', type: 'function' },
                          { symbol: 'Message', file: 'src/App.tsx', type: 'interface' },
                          { symbol: 'redactSensitiveData', file: 'src/App.tsx', type: 'function' },
                          { symbol: 'handleSaveSettings', file: 'src/App.tsx', type: 'function' },
                          { symbol: 'UserTier', file: 'src/types.ts', type: 'type' },
                        ];
                        setSemanticResults(mockAll.filter(r => r.symbol.toLowerCase().includes(q.toLowerCase())));
                      } else {
                        setSemanticResults([]);
                      }
                    }}
                    placeholder="Search cached symbols..."
                    className="forge-input flex-1 text-[12px] text-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (userTier !== 'solo_plus' && userTier !== 'founder') {
                        setShowSemanticLock(true);
                        return;
                      }
                      setIsBuildingIndex(true);
                      setTimeout(() => {
                        setSemanticIndexCount(47);
                        setSemanticResults([
                          { symbol: 'handleSendChat', file: 'src/App.tsx', type: 'function' },
                          { symbol: 'Message', file: 'src/App.tsx', type: 'interface' },
                          { symbol: 'redactSensitiveData', file: 'src/App.tsx', type: 'function' },
                          { symbol: 'handleSaveSettings', file: 'src/App.tsx', type: 'function' },
                          { symbol: 'UserTier', file: 'src/types.ts', type: 'type' },
                        ]);
                        setIsBuildingIndex(false);
                      }, 1500);
                    }}
                    className="forge-btn forge-btn-primary px-4 font-bold text-[10px]"
                  >
                    {isBuildingIndex ? 'INDEXING...' : 'BUILD INDEX'}
                  </button>
                </div>
                {semanticIndexCount !== null && (
                  <div className="text-[10px] text-[var(--accent)] font-bold">✓ {semanticIndexCount} symbols indexed</div>
                )}
                {semanticResults.length > 0 && (
                  <div className="border border-[var(--line)] bg-[var(--surface-overlay)] rounded p-3 space-y-1.5 max-h-32 overflow-y-auto font-mono">
                    {semanticResults.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px]">
                        <span className="text-[var(--text-strong)] font-bold">{r.symbol}</span>
                        <span className="text-[var(--accent-dim)]">{r.file} · <span className="text-[10px] uppercase border border-[var(--line)] px-1 rounded">{r.type}</span></span>
                      </div>
                    ))}
                  </div>
                )}

                {showSemanticLock && (
                  <div className="absolute inset-0 bg-[var(--backdrop)] flex items-center justify-between p-4 border border-[var(--danger)] rounded z-30">
                    <div className="flex items-center gap-2 text-[var(--danger)] text-[10px] font-bold">
                      <ShieldAlert size={14} />
                      <span>Semantic Cache locked: Upgrade to Pro ($9.99/mo)</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setUserTier('solo_plus'); setShowSemanticLock(false); }} className="text-[9px] bg-blue-900 border border-blue-500 text-blue-200 px-3 py-1 rounded font-bold hover:bg-blue-800 transition-all">UPGRADE</button>
                      <button type="button" onClick={() => setShowSemanticLock(false)} className="text-[9px] border border-[var(--line-strong)] text-[var(--text-muted)] px-3 py-1 rounded hover:text-[var(--text-strong)] transition-all">CANCEL</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Self-Healing Rollback Monitor */}
              <div className="border border-[var(--line)] bg-[var(--surface-deep)] p-4 rounded space-y-2 relative shadow-md">
                <div className="flex items-center gap-2">
                  <RefreshCw size={11} className="text-[var(--accent)]" />
                  <span className="text-[10px] uppercase font-bold text-[var(--text-strong)]">Self-Healing Rollback Monitor</span>
                  <span className="text-[10px] bg-blue-900 text-blue-200 border border-blue-500 px-1.5 rounded font-bold shrink-0">PRO+</span>
                  <FeatureBadge status="preview" />
                </div>
                <p className="text-[10px] text-[var(--accent-dim)] leading-relaxed">Automatically reverts destructive file operations and monitors workspace integrity in real-time.</p>
                {(userTier === 'solo_plus' || userTier === 'founder') ? (
                  <>
                    <div className="text-[10px] bg-[var(--surface-accent)] border border-[var(--accent)] p-2 rounded text-[var(--accent)] animate-pulse flex items-center gap-2">
                      <ShieldCheck size={11} />
                      <span>MONITORING ACTIVE</span>
                    </div>
                    <div className="border border-[var(--line)] bg-[var(--surface-overlay)] rounded p-3 space-y-2 max-h-32 overflow-y-auto text-[10px] font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--warn)] font-bold">↩ REVERT</span>
                        <span className="text-[var(--accent-dim)]">rm -rf ./dist — auto-rolled back 2m ago</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--warn)] font-bold">↩ REVERT</span>
                        <span className="text-[var(--accent-dim)]">truncate package.json — auto-rolled back 14m ago</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--accent)] font-bold">✓ OK</span>
                        <span className="text-[var(--accent-dim)]">git push origin main — approved 31m ago</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-[10px] text-[var(--text-muted)] border border-[var(--line)] bg-[var(--surface-overlay)] p-2.5 rounded">
                    🔒 Upgrade to Pro or Enterprise to enable self-healing rollback monitoring.
                  </div>
                )}
              </div>

              {/* RBAC Command Policies */}
              <div className="border border-[var(--line)] bg-[var(--surface-deep)] p-4 rounded space-y-2 relative shadow-md">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={11} className="text-[var(--accent)]" />
                  <span className="text-[10px] uppercase font-bold text-[var(--text-strong)]">RBAC Command Policy Simulator</span>
                  <span className="text-[10px] bg-[var(--accent)] text-[var(--on-accent)] border border-[var(--accent)] px-1.5 rounded font-extrabold shrink-0">ENTERPRISE</span>
                  <FeatureBadge status="simulator" />
                </div>
                <p className="text-[10px] text-[var(--accent-dim)] leading-relaxed">Define role-based access controls and blocked command prefixes for organization workspaces.</p>
                {userTier === 'founder' ? (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase text-[var(--accent-dim)] font-bold">Active Role</label>
                      <select
                        value={rbacRole}
                        onChange={e => setRbacRole(e.target.value as 'admin' | 'developer')}
                        className="forge-input text-[12px] text-[var(--accent)] bg-[var(--surface-terminal)]"
                      >
                        <option value="admin">Admin</option>
                        <option value="developer">Developer</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase text-[var(--accent-dim)] font-bold">Blocked Command Prefixes</label>
                      <input
                        type="text"
                        value={rbacBlockedPrefixes}
                        onChange={e => setRbacBlockedPrefixes(e.target.value)}
                        placeholder="Comma-separated blocked prefixes..."
                        className="forge-input text-[12px] text-[var(--accent)]"
                      />
                      <span className="text-[9px] text-[var(--accent-dim)]">Current role: <span className="text-[var(--text-strong)] font-bold uppercase">{rbacRole}</span> — {rbacRole === 'admin' ? 'Full access, blocked prefixes ignored' : `${rbacBlockedPrefixes.split(',').filter(Boolean).length} prefix(es) enforced`}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-[var(--text-muted)] border border-[var(--line)] bg-[var(--surface-overlay)] p-2.5 rounded cursor-pointer" onClick={() => setShowRbacLock(true)}>
                    RBAC simulator policies require Enterprise tier. Click to upgrade.
                  </div>
                )}

                {showRbacLock && (
                  <div className="absolute inset-0 bg-[var(--backdrop)] flex items-center justify-between p-4 border border-[var(--danger)] rounded z-30">
                    <div className="flex items-center gap-2 text-[var(--danger)] text-[10px] font-bold">
                      <ShieldAlert size={14} />
                      <span>RBAC simulator locked: Upgrade to Enterprise ($25/mo)</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setUserTier('founder'); setShowRbacLock(false); setCollabActive(true); }} className="text-[9px] bg-green-950 border border-green-500 text-green-200 px-3 py-1 rounded font-bold hover:bg-green-900 transition-all">UPGRADE</button>
                      <button type="button" onClick={() => setShowRbacLock(false)} className="text-[9px] border border-[var(--line-strong)] text-[var(--text-muted)] px-3 py-1 rounded hover:text-[var(--text-strong)] transition-all">CANCEL</button>
                    </div>
                  </div>
                )}
              </div>

              <button type="submit" className="forge-btn forge-btn-primary w-full py-2.5 font-bold uppercase rounded mt-4">
                [SAVE WEB CONFIGURATION]
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Global footer — Kryleos group callout */}
      <footer className="border-t border-[var(--line)] bg-[var(--surface-header)] px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0 relative z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] text-[var(--accent-dim)] uppercase tracking-wider">
            © Kryleos Group · Kryleos Forge Companion
          </span>
          <a href="https://kryleos.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase tracking-wider text-[var(--accent-dim)] hover:text-[var(--accent)] transition-all">
            Privacy Policy
          </a>
          <a href="https://kryleos.com/terms" target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase tracking-wider text-[var(--accent-dim)] hover:text-[var(--accent)] transition-all">
            Terms of Service
          </a>
        </div>
        <a
          href="https://www.kryleos.com"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-[var(--accent-dim)] hover:text-[var(--accent)] transition-all"
        >
          <Gem size={12} className="text-[var(--accent)]" />
          <span>Explore more apps &amp; services at kryleos.com</span>
          <ExternalLink size={11} className="transition-transform group-hover:translate-x-0.5" />
        </a>
      </footer>

      {/* Cloud Sync Lock modal dialog */}
      {showSyncLockModal && (
        <div className="fixed inset-0 bg-[var(--backdrop)] flex items-center justify-center p-4 backdrop-blur-sm z-50">
          <div className="forge-panel w-full max-w-sm p-6 border border-amber-600 bg-[var(--surface-warn)] flex flex-col gap-4 text-center rounded shadow-2xl">
            <ShieldAlert className="text-[var(--warn)] mx-auto" size={36} />
            <div className="space-y-1.5">
              <h3 className="text-[var(--text-strong)] font-bold text-sm uppercase">Cloud Sync Required</h3>
              <p className="text-[11px] text-[var(--warn-soft)] leading-relaxed">
                {renderMd('To sync your mobile planning session draft directly to your desktop workspace, you must enable **Cloud Sync** (Basic Tier or higher).')}
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  setUserTier('solo');
                  setShowSyncLockModal(false);
                  pushToast('Upgraded to Basic tier successfully.', 'success');
                }}
                className="bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-bold py-2 rounded uppercase transition-all"
              >
                Upgrade to Basic ($2.99/mo)
              </button>
              <button
                onClick={() => {
                  setShowSyncLockModal(false);
                  navigator.clipboard.writeText(planDraft)
                    .then(() => pushToast('Implementation draft copied to clipboard.', 'success'))
                    .catch(() => pushToast('Could not access clipboard. Copy the draft manually.', 'error'));
                }}
                className="border border-amber-600 text-[var(--warn)] hover:bg-[var(--surface-terminal)] text-[11px] py-2 rounded uppercase transition-all"
              >
                Copy Markdown manually
              </button>
              <button
                onClick={() => setShowSyncLockModal(false)}
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-strong)] uppercase font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan import options dialog (replaces native confirm) */}
      {showImportModal && (
        <div
          className="fixed inset-0 bg-[var(--backdrop)] flex items-center justify-center p-4 backdrop-blur-sm z-50"
          onClick={() => setShowImportModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-modal-title"
            className="forge-panel w-full max-w-sm p-6 border border-[var(--accent-line)] bg-[var(--surface-deep)] flex flex-col gap-4 rounded shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-[var(--accent)]">
              <Download size={18} />
              <h3 id="import-modal-title" className="text-[var(--text-strong)] font-bold text-sm uppercase tracking-wider">Import Plan to Desktop</h3>
            </div>
            <p className="text-[11px] text-[var(--accent-dim)] leading-relaxed">
              Sync <span className="text-[var(--text-strong)] font-mono">implementation_plan.md</span> to your paired desktop workspace. You can run a clean import, or simulate a 3-way merge conflict to preview conflict resolution.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={handleImportClean}
                className="forge-btn forge-btn-primary w-full py-2 font-bold uppercase rounded"
              >
                Import cleanly
              </button>
              <button
                onClick={handleImportSimulateConflict}
                className="forge-btn w-full py-2 font-bold uppercase rounded"
              >
                Simulate merge conflict
              </button>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-strong)] uppercase font-bold pt-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Authentication dialog (mock, local-only) */}
      {showAuthModal && (
        <div
          className="fixed inset-0 bg-[var(--backdrop)] flex items-center justify-center p-4 backdrop-blur-sm z-50"
          onClick={() => setShowAuthModal(false)}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            onSubmit={handleAuthSubmit}
            className="forge-panel w-full max-w-sm p-6 border border-[var(--accent-line)] bg-[var(--surface-deep)] flex flex-col gap-4 rounded shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-[var(--accent)] border-b border-[var(--line)] pb-3">
              <Lock size={18} />
              <h3 id="auth-modal-title" className="text-[var(--text-strong)] font-bold text-sm uppercase tracking-wider">
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </h3>
            </div>

            {pendingTier && (
              <div className="text-[10px] text-[var(--info)] bg-[var(--surface-accent)] border border-[var(--line)] rounded p-2 flex items-center gap-1.5">
                <CreditCard size={12} /> Sign in to continue purchasing the <span className="font-bold uppercase">{TIER_LABELS[pendingTier]}</span> plan.
              </div>
            )}

            {authMode === 'signup' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="auth-name" className="text-[10px] uppercase text-[var(--accent-dim)] font-bold">Full Name</label>
                <input id="auth-name" type="text" value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Ada Lovelace" className="forge-input" autoComplete="name" />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-email" className="text-[10px] uppercase text-[var(--accent-dim)] font-bold">Email</label>
              <input id="auth-email" type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="you@example.com" className="forge-input" autoComplete="email" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-password" className="text-[10px] uppercase text-[var(--accent-dim)] font-bold">Password</label>
              <input id="auth-password" type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="At least 6 characters" className="forge-input" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} />
            </div>

            {authError && <div role="alert" className="text-[10px] text-[var(--danger)] font-bold">{authError}</div>}

            <button type="submit" disabled={isAuthSubmitting} className="forge-btn forge-btn-primary w-full py-2.5 font-bold uppercase rounded flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
              <LogIn size={14} /> {isAuthSubmitting ? 'Please wait…' : authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>

            <div className="text-[10px] text-[var(--accent-dim)] text-center">
              {authMode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button
                type="button"
                onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); }}
                className="text-[var(--accent)] font-bold uppercase hover:underline"
              >
                {authMode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </div>

            <p className="text-[9px] text-[var(--text-muted)] text-center border-t border-[var(--line)] pt-3 leading-relaxed">
              Authenticates against your desktop workspace at <span className="font-mono">{apiBase()}</span> when reachable. If it's offline, a local-only browser session is used instead.
            </p>
          </form>
        </div>
      )}


      {/* Toast notifications */}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <div key={t.id} role="status" className={`toast toast-${t.kind}`}>
            <span className="toast-icon" aria-hidden="true">
              {t.kind === 'success' ? '✓' : t.kind === 'error' ? '✕' : 'ℹ'}
            </span>
            <span className="toast-msg">{t.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="toast-close"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

