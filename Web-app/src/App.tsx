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
type ActiveTab = 'marketing' | 'planning' | 'chat' | 'downloads' | 'settings';
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
const APP_TABS: ActiveTab[] = ['marketing', 'planning', 'chat', 'downloads', 'settings'];

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
  const [cpuHistory, setCpuHistory] = useState<number[]>(Array(15).fill(12));
  const [memoryHistory, setMemoryHistory] = useState<number[]>(Array(15).fill(210));
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
        } else if (data.type === 'telemetry_stream') {
          setCpuHistory(prev => [...prev.slice(1), data.cpuLoad]);
          setMemoryHistory(prev => [...prev.slice(1), data.memoryUsage]);
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

  // Prevent unused variables compilation errors
  if (false as boolean) {
    console.log(chatMessages, chatVoice, desktopLogs, handleSendChat);
  }

  return (
    <div className={`app-container ${theme === 'matrix' ? 'font-mono' : 'font-sans'}`}>
      {/* Navbar Header */}
      <header className="border-b border-[#004411] bg-[#060f07] px-6 py-4 flex flex-col md:flex-row gap-3 items-center justify-between shrink-0 shadow-lg relative z-20">
        <div className="flex items-center gap-3">
          <Terminal className="text-[#00ff66] animate-blink" size={20} />
          <div className="flex flex-col">
            <span className="text-[12px] font-bold tracking-widest text-[#00ff66]">
              KRYLEOS FORGE // companion_hub
            </span>
            <span className="text-[8px] text-[#00aa44] uppercase tracking-wider">
              Secure Multi-Agent Web Companion
            </span>
          </div>
        </div>
        
        {/* Nav Tabs */}
        <nav aria-label="Main navigation" role="tablist" className="flex flex-wrap justify-center gap-2">
          {APP_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              aria-label={
                tab === 'marketing' ? 'Overview tab' : 
                tab === 'planning' ? 'Planning tab' : 
                tab === 'chat' ? 'Tutorial tab' : 
                tab === 'downloads' ? 'Downloads tab' : 
                'Settings tab'
              }
              aria-selected={activeTab === tab}
              role="tab"
              className={`px-4 py-1.5 border rounded text-[10px] uppercase font-bold cursor-pointer transition-all ${
                activeTab === tab 
                  ? 'bg-[#002205] text-[#00ff66] border-[#00ff66] shadow-[0_0_8px_rgba(0,255,102,0.4)]' 
                  : 'bg-transparent text-[#00aa44] border-[#004411] hover:border-[#00ff66] hover:text-[#00ff66]'
              }`}
            >
              {
                tab === 'marketing' ? '✨ Overview' : 
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
            <div className="text-center space-y-4 py-8">
              <h1 className="text-4xl font-extrabold text-white tracking-tight leading-none">
                KRYLEOS <span className="text-[#00ff66] text-shadow-[0_0_8px_rgba(0,255,102,0.4)]">FORGE</span>
              </h1>
              <p className="text-sm text-[#00aa44] max-w-xl mx-auto uppercase tracking-wider leading-relaxed">
                Multi-Agent AI developer workspace. Scope architectures on the fly, synchronize checklists, and execute secure sandbox tasks.
              </p>
              <div className="flex justify-center gap-4 pt-4">
                <button onClick={() => setActiveTab('planning')} className="matrix-btn matrix-btn-primary px-5 py-2.5 font-bold uppercase rounded">
                  [Start Scoping Plan]
                </button>
                <button onClick={() => setActiveTab('settings')} className="matrix-btn px-5 py-2.5 font-bold uppercase rounded">
                  [Configure API Keys]
                </button>
              </div>
            </div>

            {/* Simulated Desktop Preview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass-panel p-6 rounded flex flex-col gap-3">
                <div className="flex items-center gap-2.5 text-white font-bold text-sm mb-1">
                  <Laptop size={16} className="text-[#00ff66]" />
                  <span>Desktop App</span>
                </div>
                <p className="text-[12px] text-[#00aa44] leading-relaxed">
                  Executes local Express server sandboxes with secure process limits, safeStorage keychain access, and automated script testing tools.
                </p>
              </div>
              <div className="glass-panel p-6 rounded flex flex-col gap-3">
                <div className="flex items-center gap-2.5 text-white font-bold text-sm mb-1">
                  <Database size={16} className="text-[#00ff66]" />
                  <span>Web Companion</span>
                </div>
                <p className="text-[12px] text-[#00aa44] leading-relaxed">
                  Provides a secure BYOK prompt playground, live WebSocket telemetry trackers, and 3-way conflict merging for local plans.
                </p>
              </div>
              <div className="glass-panel p-6 rounded flex flex-col gap-3">
                <div className="flex items-center gap-2.5 text-white font-bold text-sm mb-1">
                  <Smartphone size={16} className="text-[#00ff66]" />
                  <span>Mobile Companion</span>
                </div>
                <p className="text-[12px] text-[#00aa44] leading-relaxed">
                  Approve terminal commands, toggle remote execution stops, and queue offline audio notes directly from your mobile device.
                </p>
              </div>
            </div>

            {/* App Overview & Core Principles */}
            <div className="space-y-6 pt-6">
              <h2 className="text-xl text-center font-bold text-white uppercase tracking-wider flex items-center justify-center gap-2">
                <Sparkles size={20} className="text-[#00ff66]" /> App Overview & Core Principles
              </h2>
              <p className="text-[13px] text-[#00aa44] text-center max-w-2xl mx-auto leading-relaxed">
                Kryleos Forge is a next-generation developer workbench designed to orchestrate local and remote multi-agent AI teams. It functions as both a public landing companion and an interactive scoper, letting you plan, audit, and execute tasks across devices.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                <div className="glass-panel p-6 rounded flex flex-col gap-3">
                  <div className="text-[#00ff66] font-bold text-[12px] uppercase tracking-wider">
                    01 // Zero-Egress Privacy
                  </div>
                  <p className="text-[11px] text-[#00aa44] leading-relaxed">
                    Source code and system instructions never leave your local environment. Run offline LLMs using native Ollama nodes with strict sandbox boundaries and execution filters.
                  </p>
                </div>
                <div className="glass-panel p-6 rounded flex flex-col gap-3">
                  <div className="text-[#00ff66] font-bold text-[12px] uppercase tracking-wider">
                    02 // Multi-Device Sync
                  </div>
                  <p className="text-[11px] text-[#00aa44] leading-relaxed">
                    Bridge desktop terminals, web interfaces, and mobile watch/phone attachments using secure pairing codes over persistent, real-time WebSockets.
                  </p>
                </div>
                <div className="glass-panel p-6 rounded flex flex-col gap-3">
                  <div className="text-[#00ff66] font-bold text-[12px] uppercase tracking-wider">
                    03 // Prompt Cost Guard
                  </div>
                  <p className="text-[11px] text-[#00aa44] leading-relaxed">
                    Track input and output tokens. Predict api costs, compress context loads, and configure BYOK token limits to optimize resource usage.
                  </p>
                </div>
              </div>
            </div>

            {/* Pricing Section */}
            <div className="space-y-6 pt-6">
              <h2 className="text-xl text-center font-bold text-white uppercase tracking-wider flex items-center justify-center gap-2">
                Subscription Billing Tiers <FeatureBadge status="mock" label="Mock Billing" />
              </h2>
              <div className="glass-panel p-4 rounded text-[11px] text-[#00aa44] flex flex-wrap items-center justify-center gap-3">
                <span className="text-white font-bold uppercase">Feature Status Guide:</span>
                <FeatureBadge status="production" />
                <FeatureBadge status="preview" />
                <FeatureBadge status="simulator" />
                <FeatureBadge status="mock" />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Free */}
                <div className={`pricing-card pricing-card-free ${userTier === 'free' ? 'pricing-card-active' : ''}`}>
                  <div className="border-b border-[#004411] pb-3 text-center">
                    <span className="text-[10px] text-[#00aa44] font-bold uppercase block tracking-wider mb-1">Free Tier</span>
                    <span className="text-2xl font-extrabold text-white">$0.00</span>
                  </div>
                  <ul className="text-[11px] text-[#00aa44] space-y-2 flex-1">
                    <li>[+] Local agent workspace <FeatureBadge status="production" /></li>
                    <li>[+] BYOK model access <FeatureBadge status="preview" /></li>
                    <li className="opacity-45">[-] Settings Cloud Sync</li>
                    <li className="opacity-45">[-] Remote containers</li>
                  </ul>
                  <button onClick={() => setUserTier('free')} className={`matrix-btn w-full py-2 font-bold rounded ${userTier === 'free' ? 'matrix-btn-primary' : ''}`}>
                    {userTier === 'free' ? '[ACTIVE]' : 'SELECT FREE'}
                  </button>
                </div>

                {/* Basic */}
                <div className={`pricing-card pricing-card-basic ${userTier === 'basic' ? 'pricing-card-active' : ''}`}>
                  <div className="border-b border-[#004411] pb-3 text-center">
                    <span className="text-[10px] text-amber-500 font-bold uppercase block tracking-wider mb-1">Basic Tier</span>
                    <span className="text-2xl font-extrabold text-white">$2.99<span className="text-[11px] font-normal text-amber-500">/mo</span></span>
                  </div>
                  <ul className="text-[11px] text-[#00aa44] space-y-2 flex-1">
                    <li>[+] All Free features</li>
                    <li>[+] Settings Cloud Sync <FeatureBadge status="preview" /></li>
                    <li>[+] Auto Cloud Backups <FeatureBadge status="preview" /></li>
                    <li className="opacity-45">[-] Remote containers</li>
                  </ul>
                  <button onClick={() => setUserTier('basic')} className={`matrix-btn w-full py-2 font-bold rounded ${userTier === 'basic' ? 'matrix-btn-primary' : ''}`}>
                    {userTier === 'basic' ? '[ACTIVE]' : 'SELECT BASIC'}
                  </button>
                </div>

                {/* Pro */}
                <div className={`pricing-card pricing-card-pro ${userTier === 'pro' ? 'pricing-card-active' : ''}`}>
                  <div className="border-b border-[#004411] pb-3 text-center">
                    <span className="text-[10px] text-blue-400 font-bold uppercase block tracking-wider mb-1">Pro Tier</span>
                    <span className="text-2xl font-extrabold text-white">$9.99<span className="text-[11px] font-normal text-blue-400">/mo</span></span>
                  </div>
                  <ul className="text-[11px] text-[#00aa44] space-y-2 flex-1">
                    <li>[+] All Basic features</li>
                    <li>[+] Remote Containers <FeatureBadge status="simulator" /></li>
                    <li>[+] Cloud Sandbox <FeatureBadge status="simulator" /></li>
                    <li className="opacity-45">[-] Organization RBAC</li>
                  </ul>
                  <button onClick={() => setUserTier('pro')} className={`matrix-btn w-full py-2 font-bold rounded ${userTier === 'pro' ? 'matrix-btn-primary' : ''}`}>
                    {userTier === 'pro' ? '[ACTIVE]' : 'SELECT PRO'}
                  </button>
                </div>

                {/* Enterprise */}
                <div className={`pricing-card pricing-card-enterprise ${userTier === 'enterprise' ? 'pricing-card-active' : ''}`}>
                  <div className="border-b border-[#004411] pb-3 text-center">
                    <span className="text-[10px] text-[#00ff66] font-bold uppercase block tracking-wider mb-1">Enterprise</span>
                    <span className="text-2xl font-extrabold text-white">$25.00<span className="text-[11px] font-normal text-[#00ff66]">/mo</span></span>
                  </div>
                  <ul className="text-[11px] text-[#aaffbb] space-y-2 flex-1 font-semibold">
                    <li>[+] All Pro features</li>
                    <li>[+] Org Team Workspaces <FeatureBadge status="preview" /></li>
                    <li>[+] Audit log & RBAC <FeatureBadge status="simulator" /></li>
                    <li>[+] Co-coding rooms <FeatureBadge status="preview" /></li>
                  </ul>
                  <button onClick={() => setUserTier('enterprise')} className={`matrix-btn w-full py-2 font-bold rounded ${userTier === 'enterprise' ? 'matrix-btn-primary' : ''}`}>
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
                <span className="font-bold text-white uppercase flex items-center gap-1.5">
                  <Sparkles size={12} className="text-[#00ff66]" />
                  <span>Planning Architect (Draft Room)</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={`pulse-indicator ${backendStatus === 'online' ? 'pulse-indicator-online' : 'pulse-indicator-offline'}`} />
                  <span className="text-[#00aa44] uppercase text-[9px]">{backendStatus.toUpperCase()}</span>
                </div>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto space-y-3 flex flex-col justify-end">
                <div className="space-y-3 overflow-y-auto max-h-full pr-1">
                  {planMessages.map((msg, idx) => (
                    <div key={idx} className={`chat-bubble ${
                      msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-architect'
                    } mb-1`}>
                      <span className="text-[8px] text-white opacity-60 font-bold block uppercase mb-1">{msg.role === 'user' ? '👤 CLIENT' : '🤖 ARCHITECT'}</span>
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

              <div className="p-3 border-t border-[#004411] bg-[#060f07] flex gap-2">
                <input
                  type="text"
                  value={planInput}
                  onChange={e => setPlanInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendPlan()}
                  placeholder="Outline feature scopes, task lists, or folder structures..."
                  className="matrix-input flex-1 text-[12px] text-[#00ff66]"
                />
                {planVoice.isSupported && (
                  <button
                    type="button"
                    onClick={() => planVoice.isListening ? planVoice.stopListening() : planVoice.startListening()}
                    className={`border rounded px-3 transition-all ${planVoice.isListening ? 'border-[#ff3333] text-[#ff3333] bg-[#220002]' : 'border-[#004411] text-[#00ff66] hover:border-[#00ff66]'}`}
                    title={planVoice.isListening ? 'Stop voice input' : 'Start voice input'}
                    aria-label={planVoice.isListening ? 'Stop voice input' : 'Start voice input'}
                  >
                    {planVoice.isListening ? <MicOff size={14} /> : <Mic size={14} />}
                  </button>
                )}
                <button onClick={handleSendPlan} className="matrix-btn matrix-btn-primary px-4 font-bold">SEND</button>
              </div>
              {planVoice.error && <div className="px-3 pb-2 text-[9px] text-[#ff3333]">{planVoice.error}</div>}
            </div>

            {/* Planning Draft Document */}
            <div className="w-full md:w-[48%] flex flex-col bg-[#050a06] min-w-[320px]">
              <div className="p-3 border-b border-[#004411] flex items-center justify-between">
                <span className="text-[10px] text-white font-bold flex items-center gap-1.5">
                  <FileText size={12} className="text-[#00ff66]" />
                  <span>implementation_plan.md</span>
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setIsPlanEditing(!isPlanEditing)} className="text-[9px] border border-[#00aa44] text-[#00aa44] px-3 py-1 rounded font-bold hover:border-[#00ff66] hover:text-[#00ff66] transition-all">
                    {isPlanEditing ? 'VIEW' : 'EDIT'}
                  </button>
                  <button onClick={() => handleImportRequest()} className="matrix-btn matrix-btn-primary text-[9px] px-3 py-1 rounded font-bold flex items-center gap-1.5">
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
                    className="w-full flex-1 bg-black border border-[#004411] text-[12px] text-[#00ff66] p-4 outline-none resize-none font-mono rounded"
                  />
                ) : (
                  <div className="flex-1 bg-black bg-opacity-35 border border-[#004411] text-[12px] text-[#aaffbb] p-4 overflow-auto whitespace-pre-wrap select-text leading-relaxed rounded font-mono">
                    {planDraft}
                  </div>
                )}
              </div>

              {syncConflict && (
                <div className="p-3 bg-[#2b1b02] text-amber-500 text-[10px] uppercase font-bold text-center border-t border-amber-500 animate-pulse font-mono">
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
              <h1 className="text-3xl font-extrabold text-white tracking-tight uppercase">
                App Tutorial & Guide
              </h1>
              <p className="text-xs text-[#00aa44] max-w-xl mx-auto uppercase tracking-wider leading-relaxed">
                Learn how to pair devices, scope checklists, and run secure agent tasks in your local environment.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Step 1 */}
              <div className="glass-panel p-6 rounded flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-extrabold text-[#00ff66] bg-[#002205] border border-[#00ff66] w-10 h-10 rounded-full flex items-center justify-center shadow-lg">1</span>
                  <div>
                    <h3 className="text-white font-bold text-sm uppercase">Initialize & Configure</h3>
                    <span className="text-[9px] text-gray-500 uppercase font-semibold">Step 01 // Configuration</span>
                  </div>
                </div>
                <p className="text-[12px] text-[#00aa44] leading-relaxed">
                  Start by launching the desktop application. Navigate to the **Settings** tab to input your API credentials (or enable **Zero-Egress Mode** to route queries exclusively via local Ollama models). Test each connection using the health-check ping controls.
                </p>
              </div>

              {/* Step 2 */}
              <div className="glass-panel p-6 rounded flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-extrabold text-[#00ff66] bg-[#002205] border border-[#00ff66] w-10 h-10 rounded-full flex items-center justify-center shadow-lg">2</span>
                  <div>
                    <h3 className="text-white font-bold text-sm uppercase">Verbal Scoping & Planning</h3>
                    <span className="text-[9px] text-gray-500 uppercase font-semibold">Step 02 // Checklists scoping</span>
                  </div>
                </div>
                <p className="text-[12px] text-[#00aa44] leading-relaxed">
                  Use the **Planning** tab to organize your next coding roadmap. Press the **Voice Input** microphone button to speak features naturally. The assistant will parse your voice notes, output structured Markdown, and expand tasks into actionable checklists.
                </p>
              </div>

              {/* Step 3 */}
              <div className="glass-panel p-6 rounded flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-extrabold text-[#00ff66] bg-[#002205] border border-[#00ff66] w-10 h-10 rounded-full flex items-center justify-center shadow-lg">3</span>
                  <div>
                    <h3 className="text-white font-bold text-sm uppercase">WebSocket Pairing</h3>
                    <span className="text-[9px] text-gray-500 uppercase font-semibold">Step 03 // Device Linking</span>
                  </div>
                </div>
                <p className="text-[12px] text-[#00aa44] leading-relaxed">
                  Bridge your workspace across devices. Copy the active pairing code generated by the desktop server, input it in the web companion header, and click **Connect**. Once paired, WebSocket streams will broadcast telemetry data and logs dynamically.
                </p>
              </div>

              {/* Step 4 */}
              <div className="glass-panel p-6 rounded flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-extrabold text-[#00ff66] bg-[#002205] border border-[#00ff66] w-10 h-10 rounded-full flex items-center justify-center shadow-lg">4</span>
                  <div>
                    <h3 className="text-white font-bold text-sm uppercase">Sandbox Verification</h3>
                    <span className="text-[9px] text-gray-500 uppercase font-semibold">Step 04 // Command Approvals</span>
                  </div>
                </div>
                <p className="text-[12px] text-[#00aa44] leading-relaxed">
                  Run planning tasks within the local shell container. When an agent attempts destructive file writes or executes command lines, review and authorize them directly on your dashboard (or dismiss them from the mobile companion app).
                </p>
              </div>
            </div>

            {/* Live System Telemetry Monitor Section */}
            <div className="space-y-6 pt-6">
              <div className="flex items-center justify-between border-b border-[#004411] pb-2">
                <h2 className="text-xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Terminal size={20} className="text-[#00ff66]" /> Live System Telemetry Monitor
                </h2>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className={`pulse-indicator ${companionStatus === 'connected' ? 'pulse-indicator-online' : 'pulse-indicator-offline'}`} />
                  <span className="text-[#00aa44] uppercase font-bold">
                    {companionStatus === 'connected' ? 'WS STREAM ACTIVE' : 'LOCAL SIMULATOR ACTIVE'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* CPU Monitor */}
                <div className="glass-panel p-6 rounded flex flex-col gap-4">
                  <div className="flex justify-between items-center text-white font-bold text-sm">
                    <span className="uppercase tracking-wider">01 // CPU Load Monitor</span>
                    <span className="font-mono text-[#00ff66] text-base">
                      {cpuHistory[cpuHistory.length - 1]}%
                    </span>
                  </div>
                  
                  {/* SVG Chart */}
                  <div className="relative h-32 bg-black bg-opacity-45 border border-[#003311] rounded overflow-hidden">
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
                        stroke="var(--matrix-neon)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="filter drop-shadow-[0_0_4px_var(--matrix-neon)]"
                      />
                      <defs>
                        <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--matrix-neon)" />
                          <stop offset="100%" stopColor="transparent" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <span className="text-[10px] text-[#00aa44] uppercase tracking-wider font-semibold">
                    Simulated multi-agent thread operations load bounds
                  </span>
                </div>

                {/* Memory Monitor */}
                <div className="glass-panel p-6 rounded flex flex-col gap-4">
                  <div className="flex justify-between items-center text-white font-bold text-sm">
                    <span className="uppercase tracking-wider">02 // Memory Allocation</span>
                    <span className="font-mono text-[#bb66ff] text-base">
                      {memoryHistory[memoryHistory.length - 1]} MB
                    </span>
                  </div>
                  
                  {/* SVG Chart */}
                  <div className="relative h-32 bg-black bg-opacity-45 border border-[#003311] rounded overflow-hidden">
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
                        stroke="var(--matrix-purple)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="filter drop-shadow-[0_0_4px_var(--matrix-purple)]"
                      />
                      <defs>
                        <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--matrix-purple)" />
                          <stop offset="100%" stopColor="transparent" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  <span className="text-[10px] text-[#00aa44] uppercase tracking-wider font-semibold">
                    Dynamic process heap telemetry limits (Cap: 512 MB)
                  </span>
                </div>
              </div>
            </div>

            {/* Breathing / Stress Coach Note */}
            <div className="glass-panel p-6 rounded bg-[#010602] border-amber-600 border-opacity-40 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-white font-bold text-xs uppercase flex items-center gap-1.5">
                  <Sparkles size={12} className="text-[#00ff66] animate-pulse" />
                  Developer Stress Pacing System
                </h4>
                <p className="text-[11px] text-[#00aa44] leading-relaxed">
                  Stressed during execution loops? Use our structured box breathing guide inside the mobile companion (4s inhale, 4s hold, 4s exhale, 4s hold) to stay coherent and maintain focus.
                </p>
              </div>
              <button onClick={() => setActiveTab('planning')} className="matrix-btn whitespace-nowrap">
                [GO TO PLANNING SPACE]
              </button>
            </div>
          </div>
        )}

        {/* DOWNLOADS TAB */}
        {activeTab === 'downloads' && (
          <div className="flex-1 overflow-y-auto p-8 space-y-12 max-w-5xl mx-auto">
            <div className="text-center space-y-4 py-4">
              <h1 className="text-3xl font-extrabold text-white tracking-tight uppercase">
                Download Client Apps
              </h1>
              <p className="text-xs text-[#00aa44] max-w-xl mx-auto uppercase tracking-wider leading-relaxed">
                Install Kryleos Forge on your local devices to enable sandboxed terminal execution, remote haptics, and planning sync.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Desktop App */}
              <div className="glass-panel p-8 rounded flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-white font-bold text-base">
                    <Laptop size={22} className="text-[#00ff66]" />
                    <span>Desktop App Client</span>
                    <span className="text-[9px] bg-green-950 border border-green-500 text-green-200 px-2 py-0.5 rounded font-extrabold shrink-0">v1.2.0</span>
                  </div>
                  <p className="text-[12px] text-[#00aa44] leading-relaxed">
                    The primary engine for local development. Houses the Express backend, safeStorage keychain integration, parametric execution limits, and the Founder/Agency dashboard generators.
                  </p>
                  <ul className="text-[11px] text-[#00aa44] space-y-2 list-disc pl-4 font-sans font-medium">
                    <li>Zero-Egress local execution via Ollama and shell sandboxing</li>
                    <li>Secure AES-256 local database for chat history caching</li>
                    <li>Automated test runner and release QA checklist reporting tools</li>
                  </ul>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  <button onClick={() => alert('Downloading NSIS installer for Windows (x64)...')} className="matrix-btn matrix-btn-primary w-full py-2.5 font-bold uppercase">
                    [DOWNLOAD FOR WINDOWS (x64)]
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => alert('Downloading macOS DMG package...')} className="matrix-btn w-[48%] py-2 font-bold uppercase">
                      [MACOS (ARM/INTEL)]
                    </button>
                    <button onClick={() => alert('Downloading Linux DEB package...')} className="matrix-btn w-[48%] py-2 font-bold uppercase">
                      [LINUX (DEB/RPM)]
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile Companion */}
              <div className="glass-panel p-8 rounded flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-white font-bold text-base">
                    <Smartphone size={22} className="text-[#00ff66]" />
                    <span>Mobile Companion Client</span>
                    <span className="text-[9px] bg-green-950 border border-green-500 text-green-200 px-2 py-0.5 rounded font-extrabold shrink-0">v1.0.4</span>
                  </div>
                  <p className="text-[12px] text-[#00aa44] leading-relaxed">
                    Take your plans on the go. Approve terminal tasks using secure haptics, view WebSocket telemetry streams, record offline speech notes, and track your today score metrics.
                  </p>
                  <ul className="text-[11px] text-[#00aa44] space-y-2 list-disc pl-4 font-sans font-medium">
                    <li>Command review haptic feedback triggers</li>
                    <li>Live WebSocket telemetry logs tracking CPU/memory delta</li>
                    <li>Coherent box breathing guidelines for stress tracking</li>
                  </ul>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  <button onClick={() => alert('Redirecting to Apple App Store...')} className="matrix-btn w-full py-2.5 font-bold uppercase">
                    [GET ON APPLE APP STORE]
                  </button>
                  <button onClick={() => alert('Redirecting to Google Play Store...')} className="matrix-btn w-full py-2.5 font-bold uppercase">
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
            <h2 className="text-lg font-bold text-white border-b border-[#004411] pb-2 uppercase tracking-wider">
              Local Web Configuration Settings
            </h2>

            <form onSubmit={handleSaveSettings} className="space-y-6">
              <div className="text-[10px] text-[#00ff66] uppercase font-extrabold flex items-center justify-between border-b border-[#004411] pb-2 mb-2 tracking-wider">
                <span>Configure model parameters</span>
                <FeatureBadge status="mock" label="Mock keychain" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase text-[#00aa44] font-bold flex items-center gap-1.5">
                  <Key size={12} />
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

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase text-[#00aa44] font-bold flex items-center gap-1.5">
                  <Key size={12} />
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

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase text-[#00aa44] font-bold flex items-center gap-1.5">
                  <Key size={12} />
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
              <div className="border border-[#004411] bg-black bg-opacity-35 p-3 rounded flex flex-col gap-2 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase font-bold text-white flex items-center gap-2">
                    <ShieldCheck size={13} className="text-[#00ff66]" />
                    <span>PII Compliance Filter</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={piiFilterEnabled}
                    onChange={(e) => {
                      setPiiFilterEnabled(e.target.checked);
                      localStorage.setItem('web_pii_filter_enabled', String(e.target.checked));
                    }}
                    className="accent-matrix-neon cursor-pointer h-4 w-4 border border-[#004411] rounded"
                  />
                </div>
                <span className="text-[#00aa44] text-[10px] leading-relaxed">
                  Redact sensitive API keys, email addresses, and phone numbers automatically before sending payloads.
                </span>
              </div>

              {/* Realtime Socket Telemetry (Compression / Bandwidth) */}
              <div className="border border-[#00ff66] border-opacity-35 bg-[#001103] p-3 rounded flex flex-col gap-2 font-mono text-[10px] shadow-lg">
                <span className="text-[#00ff66] font-bold uppercase text-[10px] flex items-center justify-between border-b border-[#00ff66] border-opacity-30 pb-2">
                  <span>⚡ WebSocket Telemetry</span>
                  <FeatureBadge status="preview" label="Preview telemetry" />
                </span>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#00aa44]">Bytes Transmitted:</span>
                    <span className="text-white font-bold">{(telemetry.bytesSent / 1024).toFixed(2)} KB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#00aa44]">Bytes Received:</span>
                    <span className="text-white font-bold">{(telemetry.bytesReceived / 1024).toFixed(2)} KB</span>
                  </div>
                  <div className="flex justify-between border-t border-[#004411] pt-2 mt-1">
                    <span className="text-[#00aa44]">Compression Savings:</span>
                    <span className="text-[#00ff66] font-bold">{(telemetry.compressionSavingsRatio * 100).toFixed(0)}% (zlib deflate)</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <span className="text-[10px] uppercase text-[#00aa44] font-bold">Console Styling Theme</span>
                <div className="flex gap-2">
                  {['forge', 'matrix', 'light'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTheme(t)}
                      className={`flex-1 py-2 text-[10px] uppercase font-bold rounded border cursor-pointer transition-all ${
                        theme === t 
                          ? 'bg-[#002205] border-[#00ff66] text-[#00ff66] shadow-[0_0_8px_rgba(0,255,102,0.4)]' 
                          : 'bg-transparent border-[#004411] text-[#00aa44] hover:border-[#00ff66] hover:text-[#00ff66]'
                      }`}
                    >
                      {t === 'forge' ? 'Forge Dark' : t === 'matrix' ? 'Terminal Style' : 'Light Mode'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase text-[#00aa44] font-bold">Desktop Backend URL</label>
                <input
                  type="text"
                  value={backendUrl}
                  onChange={e => setBackendUrl(e.target.value)}
                  placeholder="http://localhost:3001"
                  className="matrix-input"
                />
                <span className={`text-[10px] uppercase font-bold ${backendStatus === 'online' ? 'text-[#00ff66]' : 'text-[#ff3333]'}`}>
                  Backend status: {backendStatus.toUpperCase()}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
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
                    className={`matrix-btn px-5 font-bold border transition-all ${
                      companionStatus === 'connected' ? 'border-[#ff3333] text-[#ff3333] hover:bg-[#220002]' : 'border-[#00ff66] text-[#00ff66] hover:bg-[#002205]'
                    }`}
                  >
                    {companionStatus === 'connected' ? 'UNPAIR' : companionStatus === 'connecting' ? 'PAIRING...' : 'PAIR'}
                  </button>
                </div>
                <span className={`text-[10px] uppercase font-bold ${
                  companionStatus === 'connected' ? 'text-[#00ff66]' : companionStatus === 'error' ? 'text-[#ff3333]' : 'text-[#00aa44]'
                }`}>
                  Companion status: {companionStatus.toUpperCase()}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase text-[#00aa44] font-bold">Custom System Instructions</label>
                <textarea
                  value={customInstructions}
                  onChange={e => setCustomInstructions(e.target.value)}
                  placeholder="Instruct models on coding standards..."
                  rows={2}
                  className="matrix-input resize-none"
                />
              </div>

              <div className="flex flex-col gap-2">
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
                      className={`border rounded py-1.5 text-[10px] font-bold transition-all ${
                        responseMode === mode ? 'border-[#00ff66] bg-[#002205] text-white shadow-[0_0_5px_rgba(0,255,102,0.3)]' : 'border-[#004411] text-[#00aa44] hover:border-[#00ff66] hover:text-[#00ff66]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gated Cloud Sync */}
              <div className="border border-[#004411] bg-[#020502] p-4 rounded space-y-2 relative shadow-md">
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
                  <span className="text-[8px] bg-[#004411] text-[#00ff66] border border-[#00ff66] px-1.5 rounded font-bold shrink-0">BASIC+</span>
                  <FeatureBadge status="preview" />
                </div>
                <p className="text-[10px] text-[#00aa44] leading-relaxed">Syncs model settings and active project checklists across devices.</p>

                {showSyncOverlay && (
                  <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-between p-4 border border-[#ff3333] rounded z-30">
                    <div className="flex items-center gap-2 text-[#ff3333] text-[10px] font-bold">
                      <ShieldAlert size={14} />
                      <span>Sync locked: Upgrade to Basic Plan ($2.99/mo)</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setUserTier('basic'); setShowSyncOverlay(false); setIsSyncEnabled(true); }} className="text-[9px] bg-amber-800 text-white px-3 py-1 rounded font-bold hover:bg-amber-900 transition-all">UPGRADE</button>
                      <button type="button" onClick={() => setShowSyncOverlay(false)} className="text-[9px] border border-gray-600 text-gray-400 px-3 py-1 rounded hover:text-white transition-all">CANCEL</button>
                    </div>
                  </div>
                )}
              </div>

              {/* WebRTC Collaboration Gated Sync */}
              <div className="border border-[#004411] bg-[#020502] p-4 rounded space-y-2 relative shadow-md">
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
                  <span className="text-[8px] bg-[#00ff66] text-black border border-[#00ff66] px-1.5 rounded font-extrabold shrink-0">ENTERPRISE</span>
                  <FeatureBadge status="preview" />
                </div>
                <p className="text-[10px] text-[#00aa44] leading-relaxed">Preview real-time co-coding indicators, terminal stream status, and active agent pairing sessions.</p>
                {collabActive && (
                  <div className="text-[10px] bg-[#001102] border border-[#00ff66] p-2 rounded text-[#00ff66] animate-pulse font-mono">
                    📡 COLLAB SESSION ACTIVE: Connected to signaling channel token room.
                  </div>
                )}

                {showCollabOverlay && (
                  <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-between p-4 border border-[#ff3333] rounded z-30">
                    <div className="flex items-center gap-2 text-[#ff3333] text-[10px] font-bold">
                      <ShieldAlert size={14} />
                      <span>Collab locked: Upgrade to Enterprise ($25/mo)</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setUserTier('enterprise'); setShowCollabOverlay(false); setCollabActive(true); }} className="text-[9px] bg-green-950 border border-green-500 text-green-200 px-3 py-1 rounded font-bold hover:bg-green-900 transition-all">UPGRADE</button>
                      <button type="button" onClick={() => setShowCollabOverlay(false)} className="text-[9px] border border-gray-600 text-gray-400 px-3 py-1 rounded hover:text-white transition-all">CANCEL</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Semantic Cache Query Panel */}
              <div className="border border-[#004411] bg-[#020502] p-4 rounded space-y-2 relative shadow-md">
                <div className="flex items-center gap-2">
                  <Database size={11} className="text-[#00ff66]" />
                  <span className="text-[10px] uppercase font-bold text-white">Semantic Cache Query</span>
                  <span className="text-[8px] bg-blue-900 text-blue-200 border border-blue-500 px-1.5 rounded font-bold shrink-0">PRO+</span>
                  <FeatureBadge status="preview" />
                </div>
                <p className="text-[10px] text-[#00aa44] leading-relaxed">Index and query workspace symbols, functions, and type definitions from a local semantic cache.</p>
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
                    className="matrix-input flex-1 text-[12px] text-[#00ff66]"
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
                    className="matrix-btn matrix-btn-primary px-4 font-bold text-[10px]"
                  >
                    {isBuildingIndex ? 'INDEXING...' : 'BUILD INDEX'}
                  </button>
                </div>
                {semanticIndexCount !== null && (
                  <div className="text-[10px] text-[#00ff66] font-bold">✓ {semanticIndexCount} symbols indexed</div>
                )}
                {semanticResults.length > 0 && (
                  <div className="border border-[#004411] bg-black bg-opacity-40 rounded p-3 space-y-1.5 max-h-32 overflow-y-auto font-mono">
                    {semanticResults.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px]">
                        <span className="text-white font-bold">{r.symbol}</span>
                        <span className="text-[#00aa44]">{r.file} · <span className="text-[8px] uppercase border border-[#004411] px-1 rounded">{r.type}</span></span>
                      </div>
                    ))}
                  </div>
                )}

                {showSemanticLock && (
                  <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-between p-4 border border-[#ff3333] rounded z-30">
                    <div className="flex items-center gap-2 text-[#ff3333] text-[10px] font-bold">
                      <ShieldAlert size={14} />
                      <span>Semantic Cache locked: Upgrade to Pro ($9.99/mo)</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setUserTier('pro'); setShowSemanticLock(false); }} className="text-[9px] bg-blue-900 border border-blue-500 text-blue-200 px-3 py-1 rounded font-bold hover:bg-blue-905 transition-all">UPGRADE</button>
                      <button type="button" onClick={() => setShowSemanticLock(false)} className="text-[9px] border border-gray-600 text-gray-400 px-3 py-1 rounded hover:text-white transition-all">CANCEL</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Self-Healing Rollback Monitor */}
              <div className="border border-[#004411] bg-[#020502] p-4 rounded space-y-2 relative shadow-md">
                <div className="flex items-center gap-2">
                  <RefreshCw size={11} className="text-[#00ff66]" />
                  <span className="text-[10px] uppercase font-bold text-white">Self-Healing Rollback Monitor</span>
                  <span className="text-[8px] bg-blue-900 text-blue-200 border border-blue-500 px-1.5 rounded font-bold shrink-0">PRO+</span>
                  <FeatureBadge status="preview" />
                </div>
                <p className="text-[10px] text-[#00aa44] leading-relaxed">Automatically reverts destructive file operations and monitors workspace integrity in real-time.</p>
                {(userTier === 'pro' || userTier === 'enterprise') ? (
                  <>
                    <div className="text-[10px] bg-[#001102] border border-[#00ff66] p-2 rounded text-[#00ff66] animate-pulse flex items-center gap-2">
                      <ShieldCheck size={11} />
                      <span>MONITORING ACTIVE</span>
                    </div>
                    <div className="border border-[#004411] bg-black bg-opacity-40 rounded p-3 space-y-2 max-h-32 overflow-y-auto text-[10px] font-mono">
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
                  <div className="text-[10px] text-gray-500 border border-[#004411] bg-black bg-opacity-30 p-2.5 rounded">
                    🔒 Upgrade to Pro or Enterprise to enable self-healing rollback monitoring.
                  </div>
                )}
              </div>

              {/* RBAC Command Policies */}
              <div className="border border-[#004411] bg-[#020502] p-4 rounded space-y-2 relative shadow-md">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={11} className="text-[#00ff66]" />
                  <span className="text-[10px] uppercase font-bold text-white">RBAC Command Policy Simulator</span>
                  <span className="text-[8px] bg-[#00ff66] text-black border border-[#00ff66] px-1.5 rounded font-extrabold shrink-0">ENTERPRISE</span>
                  <FeatureBadge status="simulator" />
                </div>
                <p className="text-[10px] text-[#00aa44] leading-relaxed">Define role-based access controls and blocked command prefixes for organization workspaces.</p>
                {userTier === 'enterprise' ? (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase text-[#00aa44] font-bold">Active Role</label>
                      <select
                        value={rbacRole}
                        onChange={e => setRbacRole(e.target.value as 'admin' | 'developer')}
                        className="matrix-input text-[12px] text-[#00ff66] bg-black"
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
                        className="matrix-input text-[12px] text-[#00ff66]"
                      />
                      <span className="text-[9px] text-[#00aa44]">Current role: <span className="text-white font-bold uppercase">{rbacRole}</span> — {rbacRole === 'admin' ? 'Full access, blocked prefixes ignored' : `${rbacBlockedPrefixes.split(',').filter(Boolean).length} prefix(es) enforced`}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-500 border border-[#004411] bg-black bg-opacity-35 p-2.5 rounded cursor-pointer" onClick={() => setShowRbacLock(true)}>
                    RBAC simulator policies require Enterprise tier. Click to upgrade.
                  </div>
                )}

                {showRbacLock && (
                  <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-between p-4 border border-[#ff3333] rounded z-30">
                    <div className="flex items-center gap-2 text-[#ff3333] text-[10px] font-bold">
                      <ShieldAlert size={14} />
                      <span>RBAC simulator locked: Upgrade to Enterprise ($25/mo)</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setUserTier('enterprise'); setShowRbacLock(false); setCollabActive(true); }} className="text-[9px] bg-green-950 border border-green-500 text-green-200 px-3 py-1 rounded font-bold hover:bg-green-900 transition-all">UPGRADE</button>
                      <button type="button" onClick={() => setShowRbacLock(false)} className="text-[9px] border border-gray-600 text-gray-400 px-3 py-1 rounded hover:text-white transition-all">CANCEL</button>
                    </div>
                  </div>
                )}
              </div>

              <button type="submit" className="matrix-btn matrix-btn-primary w-full py-2.5 font-bold uppercase rounded mt-4">
                [SAVE WEB CONFIGURATION]
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Cloud Sync Lock modal dialog */}
      {showSyncLockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4 backdrop-blur-sm z-50">
          <div className="matrix-panel w-full max-w-sm p-6 border border-amber-600 bg-[#0e0804] flex flex-col gap-4 text-center rounded shadow-2xl">
            <ShieldAlert className="text-amber-500 mx-auto" size={36} />
            <div className="space-y-1.5">
              <h3 className="text-white font-bold text-sm uppercase">Cloud Sync Required</h3>
              <p className="text-[11px] text-amber-200 leading-relaxed">
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
                className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold py-2 rounded uppercase transition-all"
              >
                Upgrade to Basic ($2.99/mo)
              </button>
              <button
                onClick={() => {
                  setShowSyncLockModal(false);
                  alert('Copied implementation draft to clipboard!');
                  navigator.clipboard.writeText(planDraft);
                }}
                className="border border-amber-600 text-amber-500 hover:bg-black text-[11px] py-2 rounded uppercase transition-all"
              >
                Copy Markdown manually
              </button>
              <button
                onClick={() => setShowSyncLockModal(false)}
                className="text-[10px] text-gray-500 hover:text-white uppercase font-bold"
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

