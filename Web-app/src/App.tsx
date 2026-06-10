import React, { useState, useEffect } from 'react';
import { 
  Terminal, Sparkles, Key, FileText, Database, ShieldAlert, ShieldCheck,
  Download, Laptop, RefreshCw, Smartphone, Mic, MicOff
} from 'lucide-react';
import { useVoiceInput } from './hooks/useVoiceInput';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type ResponseMode = 'balanced' | 'concise' | 'critical' | 'brutal_audit';
type FeatureStatus = 'production' | 'preview' | 'simulator' | 'mock' | 'planned';
type UserTier = 'free' | 'basic' | 'pro' | 'enterprise';
type ActiveTab = 'marketing' | 'planning' | 'chat' | 'settings';
type BackendLog = { sender?: string; message?: string };

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

const USER_TIERS: UserTier[] = ['free', 'basic', 'pro', 'enterprise'];
const APP_TABS: ActiveTab[] = ['marketing', 'planning', 'chat', 'settings'];

function readStoredTier(): UserTier {
  const storedTier = localStorage.getItem('web_user_tier');
  return USER_TIERS.includes(storedTier as UserTier) ? (storedTier as UserTier) : 'free';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('marketing');
  
  // Settings state (Stored locally in localStorage)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('web_api_key') || '');
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('web_gemini_api_key') || '');
  const [openaiApiKey, setOpenaiApiKey] = useState(() => localStorage.getItem('web_openai_api_key') || '');
  const [theme, setTheme] = useState(() => localStorage.getItem('web_theme') || 'forge');
  const [customInstructions, setCustomInstructions] = useState(() => localStorage.getItem('web_custom_instructions') || '');
  const [responseMode, setResponseMode] = useState<ResponseMode>(() => (localStorage.getItem('web_response_mode') as ResponseMode) || 'balanced');
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
  const [desktopLogs, setDesktopLogs] = useState<any[]>([]);
  const companionWsRef = React.useRef<WebSocket | null>(null);

  const connectCompanion = (code: string) => {
    if (!code) return;
    if (companionWsRef.current) {
      companionWsRef.current.close();
    }
    setCompanionStatus('connecting');
    localStorage.setItem('web_pairing_code', code);

    const wsUrl = getWsUrl() + `/api/companion/ws?code=${code}`;
    const ws = new WebSocket(wsUrl);
    companionWsRef.current = (ws as any);

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
        } else if (data.type === 'error') {
          alert(`Companion error: ${data.message}`);
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
  };

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
    if (savedCode) {
      connectCompanion(savedCode);
    }
    return () => {
      if (companionWsRef.current) {
        companionWsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('web_user_tier', userTier);
  }, [userTier]);

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
    localStorage.setItem('web_backend_url', backendUrl);
    alert('Settings saved locally in browser storage!');
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
        ws.send(JSON.stringify({ type: 'config', customInstructions, responseMode }));
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

  const handleImportRequest = () => {
    if (userTier === 'free') {
      setShowSyncLockModal(true);
    } else {
      const simulateConflict = window.confirm("Would you like to simulate a Sync Conflict for this plan import (3-way merge)?");
      if (simulateConflict) {
        setSyncConflict(true);
        const conflictedText = planDraft + "\n\n<<<<<<< CLIENT (OURS)\n- [ ] Added: User's remote mobile scope change\n=======\n- [ ] Added: Conflicting desktop update\n>>>>>>> SERVER (THEIRS)";
        setPlanDraft(conflictedText);
      } else {
        setSyncConflict(false);
        alert('Plan imported successfully! Synced implementation_plan.md to desktop workspace.');
      }
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

  return (
    <div className={`flex flex-col min-h-screen bg-black text-[#aaffbb] ${theme === 'matrix' ? 'font-mono' : 'font-sans'}`}>
      {/* Navbar Header */}
      <header className="border-b border-[#004411] bg-[#060f07] px-6 py-3 flex flex-col md:flex-row gap-3 items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Terminal className="text-[#00ff66] animate-blink" size={18} />
          <span className="text-[12px] font-bold tracking-widest text-[#00ff66]">
            KRYLEOS FORGE // web_node_online
          </span>
        </div>
        
        {/* Nav Tabs */}
        <nav aria-label="Main navigation" className="flex flex-wrap justify-center gap-2">
          {APP_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              aria-label={tab === 'marketing' ? 'Overview tab' : tab === 'planning' ? 'Planning tab' : tab === 'chat' ? 'Chat tab' : 'Settings tab'}
              aria-selected={activeTab === tab}
              role="tab"
              className={`px-3 py-1 border rounded text-[10px] uppercase font-bold cursor-pointer transition-all ${
                activeTab === tab 
                  ? 'bg-[#002205] text-[#00ff66] border-[#00ff66] shadow-[0_0_5px_rgba(0,255,102,0.3)]' 
                  : 'bg-transparent text-[#00aa44] border-[#004411] hover:text-[#00ff66]'
              }`}
            >
              {tab === 'marketing' ? '✨ Overview' : tab === 'planning' ? '📋 Planning Phase' : tab === 'chat' ? '💬 Chat Sandbox' : '⚙️ Settings'}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex">
        
        {/* MARKETING SITE TAB */}
        {activeTab === 'marketing' && (
          <div className="flex-1 overflow-y-auto p-8 space-y-12 max-w-5xl mx-auto">
            {/* Hero */}
            <div className="text-center space-y-4 py-6">
              <h1 className="text-4xl font-extrabold text-white tracking-tight leading-none">
                KRYLEOS <span className="text-[#00ff66] text-shadow-[0_0_8px_rgba(0,255,102,0.4)]">FORGE</span>
              </h1>
              <p className="text-sm text-[#00aa44] max-w-xl mx-auto uppercase tracking-wider">
                Multi-Agent AI developer workspace. Scopes architectures on mobile, syncs checklists, and executes commands safely.
              </p>
              <div className="flex justify-center gap-4 pt-2">
                <button onClick={() => setActiveTab('planning')} className="matrix-btn px-4 py-2 font-bold uppercase rounded">
                  [Start Scoping Plan]
                </button>
                <button onClick={() => setActiveTab('settings')} className="matrix-btn px-4 py-2 font-bold uppercase rounded bg-transparent text-[#00aa44]">
                  [View Pricing Tiers]
                </button>
              </div>
            </div>

            {/* Simulated Desktop Preview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="matrix-panel p-5 rounded border border-[#004411] flex flex-col gap-2">
                <div className="flex items-center gap-2 text-white font-bold text-xs mb-1">
                  <Laptop size={14} className="text-[#00ff66]" />
                  <span>Desktop App</span>
                </div>
                <p className="text-[11px] text-[#00aa44] leading-relaxed">Runs Express server sandboxes locally. Full filesystem access, git helper tools, and script compilation checks.</p>
              </div>
              <div className="matrix-panel p-5 rounded border border-[#004411] flex flex-col gap-2">
                <div className="flex items-center gap-2 text-white font-bold text-xs mb-1">
                  <Database size={14} className="text-[#00ff66]" />
                  <span>Web App Client</span>
                </div>
                <p className="text-[11px] text-[#00aa44] leading-relaxed">BYOK (Bring Your Own Key) sandbox. Sketch designs on the go, view file charts, and configure project scopes in the browser.</p>
              </div>
              <div className="matrix-panel p-5 rounded border border-[#004411] flex flex-col gap-2">
                <div className="flex items-center gap-2 text-white font-bold text-xs mb-1">
                  <Smartphone size={14} className="text-[#00ff66]" />
                  <span>Mobile Companion</span>
                </div>
                <p className="text-[11px] text-[#00aa44] leading-relaxed">Monitor CPU usage, approve terminal commands remotely, and check task list checklists from your phone.</p>
              </div>
            </div>

            {/* Pricing Section */}
            <div className="space-y-6 pt-4">
              <h2 className="text-xl text-center font-bold text-white uppercase tracking-wider">
                Subscription Billing Tiers <FeatureBadge status="mock" label="Mock Billing" />
              </h2>
              <div className="matrix-panel p-3 rounded border border-[#004411] text-[9px] text-[#00aa44] flex flex-wrap items-center justify-center gap-2">
                <span className="text-white font-bold uppercase">Feature maturity:</span>
                <FeatureBadge status="production" />
                <FeatureBadge status="preview" />
                <FeatureBadge status="simulator" />
                <FeatureBadge status="mock" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Free */}
                <div className="matrix-panel p-4 rounded border border-[#004411] flex flex-col gap-3">
                  <div className="border-b border-[#004411] pb-2 text-center">
                    <span className="text-[9px] text-[#00aa44] font-bold uppercase block">Free Tier</span>
                    <span className="text-lg font-bold text-white">$0.00</span>
                  </div>
                  <ul className="text-[10px] text-[#00aa44] space-y-1.5 flex-1">
                    <li>[+] Local agent workspace <FeatureBadge status="production" /></li>
                    <li>[+] BYOK model access <FeatureBadge status="preview" /></li>
                    <li>[-] Settings Cloud Sync <FeatureBadge status="preview" /></li>
                    <li>[-] Remote container runs <FeatureBadge status="simulator" /></li>
                  </ul>
                  <button onClick={() => setUserTier('free')} className={`py-1 text-[9px] font-bold rounded ${userTier === 'free' ? 'bg-[#004411] text-white' : 'matrix-btn'}`}>
                    {userTier === 'free' ? '[ACTIVE]' : 'SELECT FREE'}
                  </button>
                </div>

                {/* Basic */}
                <div className="matrix-panel p-4 rounded border border-amber-800 bg-[#0c0803] flex flex-col gap-3">
                  <div className="border-b border-amber-800 pb-2 text-center">
                    <span className="text-[9px] text-amber-500 font-bold uppercase block">Basic Tier</span>
                    <span className="text-lg font-bold text-white">$2.99<span className="text-[10px] font-normal text-amber-500">/mo</span></span>
                  </div>
                  <ul className="text-[10px] text-amber-200 space-y-1.5 flex-1">
                    <li>[+] Includes all Free features</li>
                    <li>[+] WebSocket Cloud Sync <FeatureBadge status="preview" /></li>
                    <li>[+] Automated Cloud Backups <FeatureBadge status="preview" /></li>
                    <li>[-] Remote container runs <FeatureBadge status="simulator" /></li>
                  </ul>
                  <button onClick={() => setUserTier('basic')} className={`py-1 text-[9px] font-bold rounded ${userTier === 'basic' ? 'bg-amber-800 text-white' : 'matrix-btn border-amber-500 text-amber-500 hover:bg-amber-500'}`}>
                    {userTier === 'basic' ? '[ACTIVE]' : 'SELECT BASIC'}
                  </button>
                </div>

                {/* Pro */}
                <div className="matrix-panel p-4 rounded border-blue-900 bg-[#030912] flex flex-col gap-3">
                  <div className="border-b border-blue-900 pb-2 text-center">
                    <span className="text-[9px] text-blue-400 font-bold uppercase block">Pro Tier</span>
                    <span className="text-lg font-bold text-white">$9.99<span className="text-[10px] font-normal text-blue-400">/mo</span></span>
                  </div>
                  <ul className="text-[10px] text-blue-200 space-y-1.5 flex-1">
                    <li>[+] Includes all Basic features</li>
                    <li>[+] Remote Container <FeatureBadge status="simulator" /></li>
                    <li>[+] Cloud Sandbox <FeatureBadge status="simulator" /></li>
                    <li>[-] Organization RBAC <FeatureBadge status="simulator" /></li>
                  </ul>
                  <button onClick={() => setUserTier('pro')} className={`py-1 text-[9px] font-bold rounded ${userTier === 'pro' ? 'bg-blue-800 text-white' : 'matrix-btn border-blue-500 text-blue-400 hover:bg-blue-500'}`}>
                    {userTier === 'pro' ? '[ACTIVE]' : 'SELECT PRO'}
                  </button>
                </div>

                {/* Enterprise */}
                <div className="matrix-panel p-4 rounded border-[#00ff66] bg-[#020d04] flex flex-col gap-3">
                  <div className="border-b border-[#00ff66] pb-2 text-center">
                    <span className="text-[9px] text-[#00ff66] font-bold uppercase block">Enterprise</span>
                    <span className="text-lg font-bold text-white">$25.00<span className="text-[10px] font-normal text-[#00ff66]">/mo</span></span>
                  </div>
                  <ul className="text-[10px] text-[#aaffbb] space-y-1.5 flex-1 font-bold">
                    <li>[+] Includes all Pro features</li>
                    <li>[+] Shared Organization workspaces <FeatureBadge status="preview" /></li>
                    <li>[+] Audit log & RBAC <FeatureBadge status="simulator" /></li>
                    <li>[+] Real-time collaboration <FeatureBadge status="preview" /></li>
                  </ul>
                  <button onClick={() => setUserTier('enterprise')} className={`py-1 text-[9px] font-bold rounded ${userTier === 'enterprise' ? 'bg-[#00ff66] text-black font-extrabold' : 'matrix-btn border-[#00ff66] text-[#00ff66] hover:bg-[#00ff66]'}`}>
                    {userTier === 'enterprise' ? '[ACTIVE]' : 'SELECT ENTERPRISE'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PLANNING PHASE TAB */}
        {activeTab === 'planning' && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Planning Chat */}
            <div className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-[#004411] bg-black bg-opacity-40 min-w-[320px]">
              <div className="p-3 border-b border-[#004411] bg-[#060f07] flex justify-between items-center text-[10px]">
                <span className="font-bold text-white uppercase flex items-center gap-1">
                  <Sparkles size={11} className="text-[#00ff66]" />
                  <span>Planning Architect (Draft Room)</span>
                </span>
                <span className="text-[#00aa44]">Status: Scoping Spec</span>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col justify-end">
                <div className="space-y-3 overflow-y-auto max-h-full pr-1">
                  {planMessages.map((msg, idx) => (
                    <div key={idx} className={`p-2.5 rounded border text-[11px] max-w-[85%] ${
                      msg.role === 'user' ? 'bg-[#031104] border-[#004411] text-[#aaffbb] ml-auto' : 'bg-[#0a0512] border-purple-900 text-purple-200'
                    }`}>
                      <span className="text-[8px] text-[#00aa44] font-bold block uppercase mb-1">{msg.role === 'user' ? '👤 YOU' : '🤖 ARCHITECT'}</span>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  ))}
                  {isStreaming && (
                    <div className="p-2.5 rounded border border-[#004411] bg-black text-[11px] animate-pulse max-w-[85%]">
                      Thinking...
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 border-t border-[#004411] bg-[#060f07] flex gap-2">
                <input
                  type="text"
                  value={planInput}
                  onChange={e => setPlanInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendPlan()}
                  placeholder="Outline feature scopes, task lists, or folder structures..."
                  className="matrix-input flex-1 text-[11px] text-[#00ff66]"
                />
                {planVoice.isSupported && (
                  <button
                    type="button"
                    onClick={() => planVoice.isListening ? planVoice.stopListening() : planVoice.startListening()}
                    className={`border rounded px-2.5 ${planVoice.isListening ? 'border-[#ff3333] text-[#ff3333]' : 'border-[#004411] text-[#00ff66]'}`}
                    title={planVoice.isListening ? 'Stop voice input' : 'Start voice input'}
                    aria-label={planVoice.isListening ? 'Stop voice input' : 'Start voice input'}
                  >
                    {planVoice.isListening ? <MicOff size={13} /> : <Mic size={13} />}
                  </button>
                )}
                <button onClick={handleSendPlan} className="matrix-btn px-3.5 font-bold">SEND</button>
              </div>
              {planVoice.error && <div className="px-3 text-[9px] text-[#ff3333]">{planVoice.error}</div>}
            </div>

            {/* Planning Draft Document */}
            <div className="w-full md:w-[48%] flex flex-col bg-[#050a06] min-w-[320px]">
              <div className="p-3 border-b border-[#004411] flex items-center justify-between">
                <span className="text-[10px] text-white font-bold flex items-center gap-1.5">
                  <FileText size={11} className="text-[#00ff66]" />
                  <span>implementation_plan.md</span>
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setIsPlanEditing(!isPlanEditing)} className="text-[9px] border border-[#004411] px-2 py-0.5 rounded text-white hover:bg-black">
                    {isPlanEditing ? 'VIEW' : 'EDIT'}
                  </button>
                  <button onClick={() => handleImportRequest()} className="text-[9px] bg-[#00ff66] text-black px-2.5 py-0.5 rounded font-bold hover:bg-white flex items-center gap-1">
                    <Download size={10} />
                    <span>IMPORT TO WORKSPACE</span>
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
                    className="w-full flex-1 bg-black border border-[#004411] text-[11px] text-[#00ff66] p-3 outline-none resize-none font-mono"
                  />
                ) : (
                  <div className="flex-1 bg-black bg-opacity-30 border border-[#004411] text-[11px] text-[#aaffbb] p-3 overflow-auto whitespace-pre-wrap select-text leading-relaxed">
                    {planDraft}
                  </div>
                )}
              </div>

              {syncConflict && (
                <div className="p-2 bg-[#2b1b02] text-amber-500 text-[10px] uppercase font-bold text-center border-t border-amber-500 animate-pulse font-mono">
                  ⚠️ SYNC CONFLICT DETECTED! Merge conflict markers have been injected. Please resolve them in EDIT mode.
                </div>
              )}
            </div>
          </div>
        )}

        {/* CHAT SANDBOX TAB */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col bg-[#020502]">
              <div className="p-3 border-b border-[#004411] bg-[#060f07] flex items-center justify-between text-[10px]">
                <span className="font-bold text-white flex items-center gap-1">
                  <Terminal size={11} className="text-[#00ff66]" />
                  <span>Web Agent Sandbox ({backendStatus === 'online' ? 'Backend Linked' : 'Fallback Simulator'})</span>
                  <FeatureBadge status={backendStatus === 'online' ? 'preview' : 'simulator'} />
                </span>
                <span className="text-[#00aa44]">BYOK Mode</span>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col justify-end">
                <div className="space-y-3 overflow-y-auto max-h-full pr-1">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`p-2.5 rounded border text-[11px] max-w-[85%] ${
                      msg.role === 'user' ? 'bg-[#031104] border-[#004411] text-[#aaffbb] ml-auto' : 'bg-black border-[#004411] text-[#00ff66]'
                    }`}>
                      <span className="text-[8px] text-[#00aa44] font-bold block uppercase mb-1">{msg.role === 'user' ? '👤 YOU' : '🤖 FORGE-AGENT'}</span>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  ))}
                  {isStreaming && (
                    <div className="p-2.5 rounded border border-[#004411] bg-black text-[11px] animate-pulse max-w-[85%]">
                      Executing simulator loops...
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 border-t border-[#004411] bg-[#060f07] flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                  placeholder="Ask agent to run commands, edit files, or search paths..."
                  className="matrix-input flex-1 text-[11px] text-[#00ff66]"
                />
                {chatVoice.isSupported && (
                  <button
                    type="button"
                    onClick={() => chatVoice.isListening ? chatVoice.stopListening() : chatVoice.startListening()}
                    className={`border rounded px-2.5 ${chatVoice.isListening ? 'border-[#ff3333] text-[#ff3333]' : 'border-[#004411] text-[#00ff66]'}`}
                    title={chatVoice.isListening ? 'Stop voice input' : 'Start voice input'}
                    aria-label={chatVoice.isListening ? 'Stop voice input' : 'Start voice input'}
                  >
                    {chatVoice.isListening ? <MicOff size={13} /> : <Mic size={13} />}
                  </button>
                )}
                <button onClick={handleSendChat} className="matrix-btn px-3.5 font-bold">RUN</button>
              </div>
              {chatVoice.error && <div className="px-3 pb-2 text-[9px] text-[#ff3333]">{chatVoice.error}</div>}
            </div>

            {companionStatus === 'connected' && (
              <div className="w-[48%] border-l border-[#004411] bg-[#030a04] flex flex-col">
                <div className="p-3 border-b border-[#004411] bg-[#060f07] flex items-center justify-between text-[10px]">
                  <span className="font-bold text-[#00ff66] flex items-center gap-1.5">
                    <Terminal size={11} className="animate-pulse" />
                    <span>DESKTOP COMMAND LOG TRACES</span>
                  </span>
                  <button 
                    onClick={() => setDesktopLogs([])} 
                    className="text-[8px] border border-[#00aa44] text-[#00aa44] px-1.5 py-0.5 rounded hover:border-[#00ff66] hover:text-[#00ff66]"
                  >
                    CLEAR
                  </button>
                </div>
                <div className="flex-1 p-3 overflow-y-auto font-mono text-[10px] space-y-1.5 scrollbar-thin select-text">
                  {desktopLogs.length === 0 ? (
                    <div className="text-gray-500 italic text-center pt-8">No command execution logs received yet.</div>
                  ) : (
                    desktopLogs.map((log, i) => (
                      <div key={i} className={`p-1.5 rounded border ${
                        log.type === 'error' ? 'bg-[#220002] border-[#ff3333] text-[#ffaaaa]' :
                        log.type === 'action' ? 'bg-[#002205] border-[#00ff66] text-[#00ff66] font-bold' :
                        log.type === 'result' ? 'bg-[#001103] border-[#00aa44] text-[#aaffbb]' :
                        'bg-black border-transparent text-[#00ff66]'
                      }`}>
                        <span className="text-[7px] text-gray-500 block">[{log.timestamp}] {log.sender} &rarr; {log.recipient}</span>
                        <div className="whitespace-pre-wrap">{log.message}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto space-y-6">
            <h2 className="text-lg font-bold text-white border-b border-[#004411] pb-2 uppercase tracking-wider">
              Local Web Configuration Settings
            </h2>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="text-[9px] text-[#00aa44] uppercase font-bold flex items-center justify-between border-b border-[#004411] pb-1.5 mb-2">
                <span>Configure model parameters</span>
                <FeatureBadge status="mock" label="Mock keychain" />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-[#00aa44] font-bold flex items-center gap-1.5">
                  <Key size={11} />
                  <span>DeepSeek API Key</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="matrix-input"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-[#00aa44] font-bold flex items-center gap-1.5">
                  <Key size={11} />
                  <span>Google Gemini API Key</span>
                </label>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={e => setGeminiApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="matrix-input"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-[#00aa44] font-bold flex items-center gap-1.5">
                  <Key size={11} />
                  <span>OpenAI API Key</span>
                </label>
                <input
                  type="password"
                  value={openaiApiKey}
                  onChange={e => setOpenaiApiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="matrix-input"
                />
              </div>

              {/* PII Compliance Gating */}
              <div className="border border-[#004411] bg-black bg-opacity-30 p-2.5 rounded flex flex-col gap-1.5 font-mono">
                <span className="text-[10px] uppercase font-bold text-white flex items-center justify-between">
                  <span>PII Compliance Filter</span>
                  <input
                    type="checkbox"
                    checked={piiFilterEnabled}
                    onChange={(e) => {
                      setPiiFilterEnabled(e.target.checked);
                      localStorage.setItem('web_pii_filter_enabled', String(e.target.checked));
                    }}
                    className="accent-matrix-neon cursor-pointer h-3.5 w-3.5 border border-[#004411] rounded"
                  />
                </span>
                <span className="text-[#00aa44] text-[9px]">Redact sensitive API keys, emails, and phone numbers before querying model nodes.</span>
              </div>

              {/* Realtime Socket Telemetry (Compression / Bandwidth) */}
              <div className="border border-[#00ff66] border-opacity-30 bg-[#001103] p-2.5 rounded flex flex-col gap-1.5 font-mono text-[9px] mb-1">
                <span className="text-[#00ff66] font-bold uppercase text-[9.5px] flex items-center justify-between border-b border-[#00ff66] border-opacity-30 pb-1">
                  <span>⚡ WebSocket Telemetry</span>
                  <FeatureBadge status="preview" label="Preview telemetry" />
                </span>
                <div className="flex justify-between">
                  <span className="text-[#00aa44]">Bytes Transmitted:</span>
                  <span className="text-white font-bold">{(telemetry.bytesSent / 1024).toFixed(2)} KB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#00aa44]">Bytes Received:</span>
                  <span className="text-white font-bold">{(telemetry.bytesReceived / 1024).toFixed(2)} KB</span>
                </div>
                <div className="flex justify-between border-t border-[#004411] pt-1 mt-0.5">
                  <span className="text-[#00aa44]">Compression Savings:</span>
                  <span className="text-[#00ff66] font-bold">{(telemetry.compressionSavingsRatio * 100).toFixed(0)}% (zlib deflate)</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 pt-2">
                <span className="text-[10px] uppercase text-[#00aa44] font-bold">Console Styling Theme</span>
                <div className="flex gap-2">
                  {['forge', 'matrix', 'light'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTheme(t)}
                      className={`flex-1 py-1.5 text-[9px] uppercase font-bold rounded border cursor-pointer ${
                        theme === t 
                          ? 'bg-matrix-dark border-matrix-neon text-white shadow-[0_0_5px_var(--matrix-neon)]' 
                          : 'bg-transparent border-matrix-dark text-matrix-dim hover:text-matrix-neon'
                      }`}
                    >
                      {t === 'forge' ? 'Forge Dark' : t === 'matrix' ? 'Terminal Style' : 'Light Mode'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-[#00aa44] font-bold">Desktop Backend URL</label>
                <input
                  type="text"
                  value={backendUrl}
                  onChange={e => setBackendUrl(e.target.value)}
                  placeholder="http://localhost:3001"
                  className="matrix-input"
                />
                <span className={`text-[9px] ${backendStatus === 'online' ? 'text-[#00ff66]' : 'text-[#ff3333]'}`}>
                  Backend status: {backendStatus.toUpperCase()}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-[#00aa44] font-bold">Companion Pairing Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pairingCode}
                    onChange={e => setPairingCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    className="matrix-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={toggleCompanionConnection}
                    className={`matrix-btn px-4 font-bold border ${
                      companionStatus === 'connected' ? 'border-[#ff3333] text-[#ff3333] hover:bg-[#220002]' : 'border-[#00ff66] text-[#00ff66] hover:bg-[#002205]'
                    }`}
                  >
                    {companionStatus === 'connected' ? 'UNPAIR' : companionStatus === 'connecting' ? 'PAIRING...' : 'PAIR'}
                  </button>
                </div>
                <span className={`text-[9px] uppercase font-bold ${
                  companionStatus === 'connected' ? 'text-[#00ff66]' : companionStatus === 'error' ? 'text-[#ff3333]' : 'text-[#00aa44]'
                }`}>
                  Companion status: {companionStatus.toUpperCase()}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-[#00aa44] font-bold">Custom System Instructions</label>
                <textarea
                  value={customInstructions}
                  onChange={e => setCustomInstructions(e.target.value)}
                  placeholder="Instruct models on coding standards..."
                  rows={2}
                  className="matrix-input resize-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase text-[#00aa44] font-bold">Response Mode</label>
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
                      className={`border rounded py-1 text-[9px] font-bold ${
                        responseMode === mode ? 'border-[#00ff66] bg-[#003311] text-white' : 'border-[#004411] text-[#00aa44]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gated Cloud Sync */}
              <div className="border border-[#004411] bg-[#020502] p-3 rounded space-y-2 relative">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="sync-chk"
                    checked={isSyncEnabled}
                    onChange={e => handleToggleSync(e.target.checked)}
                    className="cursor-pointer"
                  />
                  <label htmlFor="sync-chk" className="text-[10px] uppercase font-bold text-white flex items-center gap-1.5 cursor-pointer select-none">
                    <RefreshCw size={11} className="text-[#00ff66]" />
                    <span>Enable Settings Cloud Sync</span>
                  </label>
                  <span className="text-[8px] bg-[#004411] text-[#00ff66] border border-[#00ff66] px-1 rounded font-normal shrink-0">BASIC+</span>
                  <FeatureBadge status="preview" />
                </div>
                <p className="text-[9px] text-[#00aa44]">Syncs model settings and active project checklists across devices.</p>

                {showSyncOverlay && (
                  <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-between p-3 border border-[#ff3333] rounded">
                    <div className="flex items-center gap-1.5 text-[#ff3333] text-[9.5px] font-bold">
                      <ShieldAlert size={12} />
                      <span>Sync locked: Upgrade to Basic Plan ($2.99/mo)</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setUserTier('basic'); setShowSyncOverlay(false); setIsSyncEnabled(true); }} className="text-[8px] bg-amber-800 text-white px-2 py-0.5 rounded font-bold">UPGRADE</button>
                      <button type="button" onClick={() => setShowSyncOverlay(false)} className="text-[8px] border border-gray-600 text-gray-400 px-2 py-0.5 rounded">CANCEL</button>
                    </div>
                  </div>
                )}
              </div>

              {/* WebRTC Collaboration Gated Sync */}
              <div className="border border-[#004411] bg-[#020502] p-3 rounded space-y-2 relative">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="collab-chk"
                    checked={collabActive}
                    onChange={e => {
                      if (userTier !== 'enterprise') {
                        setShowCollabOverlay(true);
                      } else {
                        setCollabActive(e.target.checked);
                      }
                    }}
                    className="cursor-pointer"
                  />
                  <label htmlFor="collab-chk" className="text-[10px] uppercase font-bold text-white flex items-center gap-1.5 cursor-pointer select-none">
                    <Laptop size={11} className="text-[#00ff66]" />
                    <span>WebRTC Collaboration Room</span>
                  </label>
                  <span className="text-[8px] bg-[#00ff66] text-black border border-[#00ff66] px-1 rounded font-extrabold shrink-0">ENTERPRISE</span>
                  <FeatureBadge status="preview" />
                </div>
                <p className="text-[9px] text-[#00aa44]">Preview real-time co-coding indicators, terminal stream status, and active agent pairing sessions.</p>
                {collabActive && (
                  <div className="text-[9px] bg-[#001102] border border-[#00ff66] p-1.5 rounded text-[#00ff66] animate-pulse">
                    📡 COLLAB SESSION ACTIVE: Connected to signaling channel token room.
                  </div>
                )}

                {showCollabOverlay && (
                  <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-between p-3 border border-[#ff3333] rounded">
                    <div className="flex items-center gap-1.5 text-[#ff3333] text-[9.5px] font-bold">
                      <ShieldAlert size={12} />
                      <span>Collab locked: Upgrade to Enterprise ($25/mo)</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setUserTier('enterprise'); setShowCollabOverlay(false); setCollabActive(true); }} className="text-[8px] bg-green-950 border border-green-500 text-green-200 px-2 py-0.5 rounded font-bold">UPGRADE</button>
                      <button type="button" onClick={() => setShowCollabOverlay(false)} className="text-[8px] border border-gray-600 text-gray-400 px-2 py-0.5 rounded">CANCEL</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Semantic Cache Query Panel */}
              <div className="border border-[#004411] bg-[#020502] p-3 rounded space-y-2 relative">
                <div className="flex items-center gap-2">
                  <Database size={11} className="text-[#00ff66]" />
                  <span className="text-[10px] uppercase font-bold text-white">Semantic Cache Query</span>
                  <span className="text-[8px] bg-blue-900 text-blue-200 border border-blue-500 px-1 rounded font-bold shrink-0">PRO+</span>
                  <FeatureBadge status="preview" />
                </div>
                <p className="text-[9px] text-[#00aa44]">Index and query workspace symbols, functions, and type definitions from a local semantic cache.</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={semanticQuery}
                    onChange={e => {
                      const q = e.target.value;
                      setSemanticQuery(q);
                      if (userTier !== 'pro' && userTier !== 'enterprise') {
                        setShowSemanticLock(true);
                        return;
                      }
                      if (q.trim() && semanticResults.length > 0) {
                        const mockAll = [
                          { symbol: 'handleSendChat', file: 'src/App.tsx', type: 'function' },
                          { symbol: 'Message', file: 'src/App.tsx', type: 'interface' },
                          { symbol: 'redactSensitiveData', file: 'src/App.tsx', type: 'function' },
                          { symbol: 'handleSaveSettings', file: 'src/App.tsx', type: 'function' },
                          { symbol: 'UserTier', file: 'src/types.ts', type: 'type' },
                        ];
                        setSemanticResults(mockAll.filter(r => r.symbol.toLowerCase().includes(q.toLowerCase())));
                      }
                    }}
                    placeholder="Search cached symbols..."
                    className="matrix-input flex-1 text-[11px] text-[#00ff66]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (userTier !== 'pro' && userTier !== 'enterprise') {
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
                    className="matrix-btn px-3 font-bold text-[9px]"
                  >
                    {isBuildingIndex ? 'INDEXING...' : 'BUILD INDEX'}
                  </button>
                </div>
                {semanticIndexCount !== null && (
                  <div className="text-[9px] text-[#00ff66] font-bold">✓ {semanticIndexCount} symbols indexed</div>
                )}
                {semanticResults.length > 0 && (
                  <div className="border border-[#004411] bg-black bg-opacity-40 rounded p-2 space-y-1 max-h-28 overflow-y-auto">
                    {semanticResults.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-[9px]">
                        <span className="text-white font-bold">{r.symbol}</span>
                        <span className="text-[#00aa44]">{r.file} · <span className="text-[8px] uppercase border border-[#004411] px-1 rounded">{r.type}</span></span>
                      </div>
                    ))}
                  </div>
                )}

                {showSemanticLock && (
                  <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-between p-3 border border-[#ff3333] rounded">
                    <div className="flex items-center gap-1.5 text-[#ff3333] text-[9.5px] font-bold">
                      <ShieldAlert size={12} />
                      <span>Semantic Cache locked: Upgrade to Pro ($9.99/mo)</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setUserTier('pro'); setShowSemanticLock(false); }} className="text-[8px] bg-blue-900 border border-blue-500 text-blue-200 px-2 py-0.5 rounded font-bold">UPGRADE</button>
                      <button type="button" onClick={() => setShowSemanticLock(false)} className="text-[8px] border border-gray-600 text-gray-400 px-2 py-0.5 rounded">CANCEL</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Self-Healing Rollback Monitor */}
              <div className="border border-[#004411] bg-[#020502] p-3 rounded space-y-2 relative">
                <div className="flex items-center gap-2">
                  <RefreshCw size={11} className="text-[#00ff66]" />
                  <span className="text-[10px] uppercase font-bold text-white">Self-Healing Rollback Monitor</span>
                  <span className="text-[8px] bg-blue-900 text-blue-200 border border-blue-500 px-1 rounded font-bold shrink-0">PRO+</span>
                  <FeatureBadge status="preview" />
                </div>
                <p className="text-[9px] text-[#00aa44]">Automatically reverts destructive file operations and monitors workspace integrity in real-time.</p>
                {(userTier === 'pro' || userTier === 'enterprise') ? (
                  <>
                    <div className="text-[9px] bg-[#001102] border border-[#00ff66] p-1.5 rounded text-[#00ff66] animate-pulse flex items-center gap-1.5">
                      <ShieldCheck size={10} />
                      <span>MONITORING ACTIVE</span>
                    </div>
                    <div className="border border-[#004411] bg-black bg-opacity-40 rounded p-2 space-y-1.5 max-h-28 overflow-y-auto text-[9px]">
                      <div className="flex items-center justify-between">
                        <span className="text-amber-400 font-bold">↩ REVERT</span>
                        <span className="text-[#00aa44]">rm -rf ./dist — auto-rolled back 2m ago</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-amber-400 font-bold">↩ REVERT</span>
                        <span className="text-[#00aa44]">truncate package.json — auto-rolled back 14m ago</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#00ff66] font-bold">✓ OK</span>
                        <span className="text-[#00aa44]">git push origin main — approved 31m ago</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-[9px] text-gray-500 border border-[#004411] bg-black bg-opacity-30 p-2 rounded">
                    🔒 Upgrade to Pro or Enterprise to enable self-healing rollback monitoring.
                  </div>
                )}
              </div>

              {/* RBAC Command Policies */}
              <div className="border border-[#004411] bg-[#020502] p-3 rounded space-y-2 relative">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={11} className="text-[#00ff66]" />
                  <span className="text-[10px] uppercase font-bold text-white">RBAC Command Policy Simulator</span>
                  <span className="text-[8px] bg-[#00ff66] text-black border border-[#00ff66] px-1 rounded font-extrabold shrink-0">ENTERPRISE</span>
                  <FeatureBadge status="simulator" />
                </div>
                <p className="text-[9px] text-[#00aa44]">Define role-based access controls and blocked command prefixes for organization workspaces.</p>
                {userTier === 'enterprise' ? (
                  <div className="space-y-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase text-[#00aa44] font-bold">Active Role</label>
                      <select
                        value={rbacRole}
                        onChange={e => setRbacRole(e.target.value as 'admin' | 'developer')}
                        className="matrix-input text-[11px] text-[#00ff66] bg-black"
                      >
                        <option value="admin">Admin</option>
                        <option value="developer">Developer</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase text-[#00aa44] font-bold">Blocked Command Prefixes</label>
                      <input
                        type="text"
                        value={rbacBlockedPrefixes}
                        onChange={e => setRbacBlockedPrefixes(e.target.value)}
                        placeholder="Comma-separated blocked prefixes..."
                        className="matrix-input text-[11px] text-[#00ff66]"
                      />
                      <span className="text-[8px] text-[#00aa44]">Current role: <span className="text-white font-bold uppercase">{rbacRole}</span> — {rbacRole === 'admin' ? 'Full access, blocked prefixes ignored' : `${rbacBlockedPrefixes.split(',').filter(Boolean).length} prefix(es) enforced`}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[9px] text-gray-500 border border-[#004411] bg-black bg-opacity-30 p-2 rounded cursor-pointer" onClick={() => setShowRbacLock(true)}>
                    RBAC simulator policies require Enterprise tier. Click to upgrade.
                  </div>
                )}

                {showRbacLock && (
                  <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-between p-3 border border-[#ff3333] rounded">
                    <div className="flex items-center gap-1.5 text-[#ff3333] text-[9.5px] font-bold">
                      <ShieldAlert size={12} />
                      <span>RBAC simulator locked: Upgrade to Enterprise ($25/mo)</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setUserTier('enterprise'); setShowRbacLock(false); }} className="text-[8px] bg-green-950 border border-green-500 text-green-200 px-2 py-0.5 rounded font-bold">UPGRADE</button>
                      <button type="button" onClick={() => setShowRbacLock(false)} className="text-[8px] border border-gray-600 text-gray-400 px-2 py-0.5 rounded">CANCEL</button>
                    </div>
                  </div>
                )}
              </div>

              <button type="submit" className="matrix-btn w-full py-2 font-bold uppercase rounded mt-4">
                [SAVE WEB CONFIGURATION]
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Cloud Sync Lock modal dialog */}
      {showSyncLockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4 backdrop-blur-sm z-50">
          <div className="matrix-panel w-full max-w-sm p-5 border border-amber-600 bg-[#0e0804] flex flex-col gap-4 text-center rounded">
            <ShieldAlert className="text-amber-500 mx-auto" size={32} />
            <div className="space-y-1">
              <h3 className="text-white font-bold text-sm uppercase">Cloud Sync Required</h3>
              <p className="text-[10px] text-amber-200 leading-relaxed">
                To sync your mobile planning session draft directly to your desktop workspace, you must enable **Cloud Sync** (Basic Tier or higher).
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => {
                  setUserTier('basic');
                  setShowSyncLockModal(false);
                  alert('Upgraded status to Basic Tier successfully!');
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold py-1.5 rounded uppercase"
              >
                Upgrade to Basic ($2.99/mo)
              </button>
              <button
                onClick={() => {
                  setShowSyncLockModal(false);
                  alert('Copied implementation draft to clipboard!');
                  navigator.clipboard.writeText(planDraft);
                }}
                className="border border-amber-600 text-amber-500 hover:bg-[#000] text-[10px] py-1.5 rounded uppercase"
              >
                Copy Markdown manually
              </button>
              <button
                onClick={() => setShowSyncLockModal(false)}
                className="text-[9px] text-gray-500 hover:text-white uppercase font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
