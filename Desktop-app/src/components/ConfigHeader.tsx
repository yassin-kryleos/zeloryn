import React, { useState, useEffect } from 'react';
import { Settings, Key, FolderOpen, Eye, EyeOff, Search, HelpCircle, RefreshCw, Shield, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, Check, BookOpen, Globe, Smartphone, Trash2 } from 'lucide-react';
import type { ResponseMode } from '../backend/agents';
import { FeatureBadge } from './FeatureBadge';
import { TIER_PRICES, BUYABLE_TIER_IDS } from '../pricing.generated';

interface PairedDeviceSummary {
  deviceId: string;
  label: string;
  pairedAt: string;
  lastSeenAt: string;
}

interface OllamaModelOption {
  name: string;
  model?: string;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
  };
  capabilities?: string[];
}

function getThinkingLevel(model: string): string {
  const m = (model || '').toLowerCase();
  if (m.includes('opus') || m === 'gpt-5.5') return 'Thinking: Godlike';
  if (m === 'gpt-5.4' || m.includes('pro')) return 'Thinking: Ultra';
  if (m.includes('sonnet') || m === 'gpt-4o') return 'Thinking: High';
  if (m.includes('flash') || m.includes('mini') || m.includes('haiku')) return 'Thinking: Fast';
  if (m.includes('reasoner')) return 'Thinking: Ultra (Reasoner)';
  return 'Thinking: Standard';
}

interface ConfigHeaderProps {
  apiKey: string;
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  openrouterApiKey: string;
  ollamaUrl: string;
  useSearch: boolean;
  model: string;
  workspaceRoot: string;
  isConnected: boolean;
  theme: string;
  customInstructions: string;
  responseMode: ResponseMode;
  isGoogleLinked: boolean;
  isSyncingGoogle: boolean;
  onUpdateGoogleStatus: () => void;
  githubToken: string;
  githubRepoUrl: string;
  onOpenGuide: () => void;
  user: { email: string; token: string; isPremium: boolean; tier?: string; billingProvider?: 'stripe' | 'razorpay' | 'license' } | null;
  syncStatus: string;
  lastSyncedAt: string;
  onRegister: (email: string, pass: string) => Promise<void>;
  onLogin: (email: string, pass: string) => Promise<void>;
  onLogout: () => void;
  onSubscribe: (tier: string) => Promise<void>;
  onActivateLicense: (licenseKey: string) => Promise<boolean>;
  onOpenBillingPortal?: () => Promise<void>;
  onForceSync: () => Promise<void>;
  onUpdateConfig: (data: { 
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
  }) => void;
  piiFilterEnabled?: boolean;
  onTogglePiiFilter?: (val: boolean) => void;
  telemetry?: { bytesSent: number; bytesReceived: number; compressionSavingsRatio: number } | null;
  workspacePaths?: string[];
  onUpdateWorkspacePaths?: (paths: string[]) => void;
  collabActive?: boolean;
  onStartCollabSession?: () => void;
  onNotify?: (message: string, kind?: 'success' | 'error' | 'warning' | 'info') => void;
  zeroEgressMode?: boolean;
  privacyMode?: boolean;
  thinkingCapability?: 'low' | 'medium' | 'high' | 'ultra';
}

export const ConfigHeader: React.FC<ConfigHeaderProps> = ({
  apiKey,
  geminiApiKey,
  openaiApiKey,
  anthropicApiKey,
  openrouterApiKey,
  ollamaUrl,
  useSearch,
  model,
  workspaceRoot,
  isConnected,
  theme,
  customInstructions,
  responseMode,
  thinkingCapability = 'medium',
  isGoogleLinked,
  isSyncingGoogle,
  onUpdateGoogleStatus,
  githubToken,
  githubRepoUrl,
  onOpenGuide,
  user,
  syncStatus,
  lastSyncedAt,
  onRegister,
  onLogin,
  onLogout,
  onSubscribe,
  onActivateLicense,
  onOpenBillingPortal,
  onForceSync,
  onUpdateConfig,
  piiFilterEnabled = false,
  onTogglePiiFilter,
  telemetry = null,
  workspacePaths = [],
  onUpdateWorkspacePaths,
  collabActive = false,
  onStartCollabSession,
  onNotify,
  zeroEgressMode = false,
  privacyMode = false
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [userRole, setUserRole] = useState<'admin' | 'developer'>('admin');
  const [keychainSecured, setKeychainSecured] = useState<boolean>(false);

  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && electronAPI.isEncryptionAvailable) {
      electronAPI.isEncryptionAvailable().then(setKeychainSecured).catch(() => setKeychainSecured(false));
    } else {
      setKeychainSecured(false);
    }
  }, []);
  const [blockedPrefixes, setBlockedPrefixes] = useState<string>(
    'npm publish, docker push, terraform, aws'
  );
  const [semanticStatus, setSemanticStatus] = useState<string>('Index ready');
  const [semanticCount, setSemanticCount] = useState<number | null>(null);
  const [isBuildingIndex, setIsBuildingIndex] = useState<boolean>(false);

  const handleUpdateCommandPolicy = async (role: 'admin' | 'developer', prefixesStr: string) => {
    try {
      const prefixes = prefixesStr.split(',').map(s => s.trim()).filter(Boolean);
      await fetch('http://localhost:3001/api/workspace/command-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userRole: role,
          blockedPrefixes: prefixes
        })
      });
    } catch (err) {
      console.error('Failed to update command policy', err);
    }
  };

  const handleBuildSemanticIndex = async () => {
    setIsBuildingIndex(true);
    setSemanticStatus('Building index...');
    try {
      const res = await fetch('http://localhost:3001/api/workspace/semantic-cache/rebuild', {
        method: 'POST'
      });
      const data = await res.json() as any;
      if (res.ok && data.success) {
        setSemanticCount(data.count);
        setSemanticStatus(`Index updated! Found ${data.count} symbols.`);
      } else {
        setSemanticStatus(`Index failed: ${data.error || 'Access Denied'}`);
      }
    } catch (err: any) {
      setSemanticStatus(`Index failed: ${err.message}`);
    }
    setIsBuildingIndex(false);
  };
  const [emailInput, setEmailInput] = useState<string>('');
  const [passInput, setPassInput] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState<boolean>(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState<boolean>(false);
  const [showOpenrouterKey, setShowOpenrouterKey] = useState<boolean>(false);
  const [showGithubToken, setShowGithubToken] = useState<boolean>(false);

  const [inputKey, setInputKey] = useState<string>(apiKey);
  const [inputGeminiKey, setInputGeminiKey] = useState<string>(geminiApiKey);
  const [inputOpenaiKey, setInputOpenaiKey] = useState<string>(openaiApiKey);
  const [inputAnthropicKey, setInputAnthropicKey] = useState<string>(anthropicApiKey);
  const [inputOpenrouterKey, setInputOpenrouterKey] = useState<string>(openrouterApiKey);
  const [inputOllamaUrl, setInputOllamaUrl] = useState<string>(ollamaUrl);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelOption[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<string>('Ollama not checked');
  const [isLoadingOllamaModels, setIsLoadingOllamaModels] = useState<boolean>(false);
  const [inputGithubToken, setInputGithubToken] = useState<string>(githubToken);
  const [inputGithubRepoUrl, setInputGithubRepoUrl] = useState<string>(githubRepoUrl);

  const [inputUseSearch, setInputUseSearch] = useState<boolean>(useSearch);
  const [inputWorkspace, setInputWorkspace] = useState<string>(workspaceRoot);
  const [showConfigDrawer, setShowConfigDrawer] = useState<boolean>(false);
  const [inputCustomInstructions, setInputCustomInstructions] = useState<string>(customInstructions);
  const [inputResponseMode, setInputResponseMode] = useState<ResponseMode>(responseMode);
  const [inputTheme, setInputTheme] = useState<string>(theme);
  const [activeTab, setActiveTab] = useState<'api_keys' | 'workspace' | 'github_sync' | 'account_theme' | 'permissions' | 'agents' | 'artifacts' | 'subscription'>('api_keys');

  React.useEffect(() => {
    setInputTheme(theme);
  }, [theme]);

  const handleBrowseWorkspace = async () => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI) {
      try {
        const selectedPath = await electronAPI.selectDirectory();
        if (selectedPath) {
          setInputWorkspace(selectedPath);
        }
      } catch (err: any) {
        onNotify?.(`Failed to browse directory: ${err.message}`, 'error');
      }
    }
  };

  const [isLocalSyncing, setIsLocalSyncing] = useState<boolean>(false);
  const [zeroEgressInput, setZeroEgressInput] = useState<boolean>(zeroEgressMode);
  const [privacyInput, setPrivacyInput] = useState<boolean>(privacyMode);
  const [companionCount, setCompanionCount] = useState<number>(0);
  const [activePairingCode, setActivePairingCode] = useState<string>('');
  const [activePairingSecret, setActivePairingSecret] = useState<string>('');
  const [pairedDevices, setPairedDevices] = useState<PairedDeviceSummary[]>([]);
  const [isCompanionModalOpen, setIsCompanionModalOpen] = useState<boolean>(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState<string>('');

  const [isRedeemingLicense, setIsRedeemingLicense] = useState<boolean>(false);

  // Activates an offline Ed25519-signed license key via /api/license/activate.
  // The server verifies the signature and expiry against our embedded public
  // key and applies the encoded tier to the authenticated account.
  const handleRedeemLicense = async () => {
    const key = licenseKeyInput.trim();
    if (!key) return;
    setIsRedeemingLicense(true);
    try {
      const ok = await onActivateLicense(key);
      if (ok) {
        setLicenseKeyInput('');
      }
    } finally {
      setIsRedeemingLicense(false);
    }
  };

  const fetchPairedDevices = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/companion/devices');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPairedDevices(data.devices || []);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch paired devices:', err);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    try {
      const res = await fetch(`http://localhost:3001/api/companion/devices/${deviceId}`, { method: 'DELETE' });
      if (res.ok) {
        setPairedDevices(prev => prev.filter(d => d.deviceId !== deviceId));
        onNotify?.('Device revoked.', 'success');
      } else {
        onNotify?.('Failed to revoke device.', 'error');
      }
    } catch (e) {
      onNotify?.('Failed to revoke device.', 'error');
    }
  };

  useEffect(() => {
    const fetchCompanionStatus = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/companion/status');
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setCompanionCount(data.connectedCount);
            setActivePairingCode(data.code || '');
            setActivePairingSecret(data.pairingSecret || '');
          }
        }
      } catch (err) {
        console.warn('Failed to fetch companion status:', err);
      }
    };
    fetchCompanionStatus();
    fetchPairedDevices();
    // 20s is plenty for a presence indicator; 5s flooded the network log.
    const interval = setInterval(() => {
      fetchCompanionStatus();
      fetchPairedDevices();
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  const [deepseekStatus, setDeepseekStatus] = useState<'idle' | 'online' | 'error'>('idle');
  const [geminiStatus, setGeminiStatus] = useState<'idle' | 'online' | 'error'>('idle');
  const [openaiStatus, setOpenaiStatus] = useState<'idle' | 'online' | 'error'>('idle');
  const [anthropicStatus, setAnthropicStatus] = useState<'idle' | 'online' | 'error'>('idle');
  const [openrouterStatus, setOpenrouterStatus] = useState<'idle' | 'online' | 'error'>('idle');
  const [testingKeys, setTestingKeys] = useState<Record<string, boolean>>({});
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [wizardOllamaStatus, setWizardOllamaStatus] = useState<string>('');
  const [wizardOllamaModels, setWizardOllamaModels] = useState<any[]>([]);
  const [detectingOllama, setDetectingOllama] = useState<boolean>(false);

  React.useEffect(() => {
    setZeroEgressInput(zeroEgressMode);
  }, [zeroEgressMode]);

  React.useEffect(() => {
    setPrivacyInput(privacyMode);
  }, [privacyMode]);

  const providerFailureMessage = (provider: string, raw: string) => {
    const error = raw || 'Connection failed';
    if (provider === 'ollama') {
      if (/model.*not found|pull|404/i.test(error)) return `Ollama is running, but the model is missing. Run: ollama pull qwen2.5-coder`;
      if (/timeout|loading|download/i.test(error)) return 'Ollama is still loading or downloading the model. Wait for the pull to finish, then PING again.';
      return `Ollama was not found at ${inputOllamaUrl}. Start Ollama, confirm the URL, then click DETECT.`;
    }
    if (/401|403|unauthor|invalid.*key|expired/i.test(error)) {
      return `${provider.toUpperCase()} rejected the key. Replace the invalid or expired key, then PING again.`;
    }
    return `${provider.toUpperCase()} connection failed: ${error}. Check the key and network, then retry.`;
  };

  const testKey = async (provider: string, apiKeyVal: string) => {
    setTestingKeys(prev => ({ ...prev, [provider]: true }));
    try {
      const res = await fetch('http://localhost:3001/api/providers/health-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          provider, 
          apiKey: apiKeyVal, 
          baseUrl: provider === 'ollama' ? inputOllamaUrl : undefined 
        })
      });
      const data = await res.json();
      const isOnline = res.ok && data.success;
      if (provider === 'deepseek') setDeepseekStatus(isOnline ? 'online' : 'error');
      else if (provider === 'gemini') setGeminiStatus(isOnline ? 'online' : 'error');
      else if (provider === 'openai') setOpenaiStatus(isOnline ? 'online' : 'error');
      else if (provider === 'anthropic') setAnthropicStatus(isOnline ? 'online' : 'error');
      else if (provider === 'openrouter') setOpenrouterStatus(isOnline ? 'online' : 'error');
      
      if (isOnline) {
        onNotify?.(`${provider.toUpperCase()} connection successful!`, 'success');
      } else {
        onNotify?.(providerFailureMessage(provider, data.error), 'error');
      }
    } catch (err: any) {
      if (provider === 'deepseek') setDeepseekStatus('error');
      else if (provider === 'gemini') setGeminiStatus('error');
      else if (provider === 'openai') setOpenaiStatus('error');
      else if (provider === 'anthropic') setAnthropicStatus('error');
      else if (provider === 'openrouter') setOpenrouterStatus('error');
      onNotify?.(providerFailureMessage(provider, err.message), 'error');
    } finally {
      setTestingKeys(prev => ({ ...prev, [provider]: false }));
    }
  };

  const detectOllamaLocal = async () => {
    setDetectingOllama(true);
    setWizardOllamaStatus('Scanning localhost:11434...');
    try {
      const res = await fetch(`http://localhost:3001/api/providers/detect?baseUrl=${encodeURIComponent(inputOllamaUrl)}`);
      const data = await res.json();
      if (res.ok && data.success && data.ollamaAvailable) {
        setWizardOllamaModels(data.models || []);
        setWizardOllamaStatus(`Online! Found ${data.models.length} local model(s).`);
        onNotify?.('Ollama local models detected successfully.', 'success');
      } else {
        setWizardOllamaModels([]);
        setWizardOllamaStatus(`Ollama not found at ${inputOllamaUrl}. Start Ollama, confirm the URL, then DETECT again.`);
      }
    } catch (err: any) {
      setWizardOllamaModels([]);
      setWizardOllamaStatus(`Scan failed: ${err.message}`);
    } finally {
      setDetectingOllama(false);
    }
  };

  const wipeLocalData = async () => {
    const confirmed = window.confirm('Clear stored credentials and Kryleos app data? Workspace files and repository .kryleos folders will remain.');
    if (!confirmed) return;
    try {
      const res = await fetch('http://localhost:3001/api/local-data', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
      localStorage.clear();
      onNotify?.(`${data.note} Restart Forge to finish clearing the current UI session.`, 'success');
    } catch (err: any) {
      onNotify?.(`Could not clear local data: ${err.message}`, 'error');
    }
  };

  const handleLinkGoogle = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/google/auth-url');
      const data = await response.json() as any;
      if (data.url) {
        window.open(data.url, '_blank');
        onNotify?.('Google link flow opened in your browser.', 'info');
        let count = 0;
        const interval = setInterval(async () => {
          count++;
          const res = await fetch('http://localhost:3001/api/google/status');
          const status = await res.json() as any;
          if (status.linked) {
            onUpdateGoogleStatus();
            clearInterval(interval);
          }
          if (count > 20) clearInterval(interval);
        }, 3000);
      }
    } catch (err: any) {
      onNotify?.(`Failed to start link flow: ${err.message}`, 'error');
    }
  };

  const handleSyncGoogle = async () => {
    try {
      setIsLocalSyncing(true);
      const res = await fetch('http://localhost:3001/api/google/sync', { method: 'POST' });
      const data = await res.json() as any;
      setIsLocalSyncing(false);
      onNotify?.(data.message || data.error || 'Sync status resolved.', data.error ? 'error' : 'success');
    } catch (err: any) {
      setIsLocalSyncing(false);
      onNotify?.(`Sync error: ${err.message}`, 'error');
    }
  };

  React.useEffect(() => { setInputKey(apiKey); }, [apiKey]);
  React.useEffect(() => { setInputGeminiKey(geminiApiKey); }, [geminiApiKey]);
  React.useEffect(() => { setInputOpenaiKey(openaiApiKey); }, [openaiApiKey]);
  React.useEffect(() => { setInputAnthropicKey(anthropicApiKey); }, [anthropicApiKey]);
  React.useEffect(() => { setInputOpenrouterKey(openrouterApiKey); }, [openrouterApiKey]);
  React.useEffect(() => { setInputOllamaUrl(ollamaUrl); }, [ollamaUrl]);
  React.useEffect(() => { setInputWorkspace(workspaceRoot); }, [workspaceRoot]);
  React.useEffect(() => { setInputUseSearch(useSearch); }, [useSearch]);
  React.useEffect(() => { setInputCustomInstructions(customInstructions); }, [customInstructions]);
  React.useEffect(() => { setInputResponseMode(responseMode); }, [responseMode]);
  React.useEffect(() => { setInputGithubToken(githubToken); }, [githubToken]);
  React.useEffect(() => { setInputGithubRepoUrl(githubRepoUrl); }, [githubRepoUrl]);

  const refreshOllamaModels = React.useCallback(async (baseUrl: string) => {
    setIsLoadingOllamaModels(true);
    try {
      const url = new URL('http://localhost:3001/api/ollama/models');
      if (baseUrl.trim()) url.searchParams.set('baseUrl', baseUrl.trim());
      const res = await fetch(url.toString());
      const data = await res.json() as { success?: boolean; models?: OllamaModelOption[]; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || 'Ollama is not reachable');
      const completionModels = (data.models || []).filter(item => (item.capabilities || []).includes('completion'));
      setOllamaModels(completionModels);
      setOllamaStatus(completionModels.length > 0 ? `${completionModels.length} local model(s) detected` : 'Ollama is online, but no chat models were found');
    } catch (err: any) {
      setOllamaModels([]);
      setOllamaStatus(`Ollama unavailable: ${err.message}`);
    } finally {
      setIsLoadingOllamaModels(false);
    }
  }, []);

  React.useEffect(() => {
    refreshOllamaModels(ollamaUrl);
  }, [ollamaUrl, refreshOllamaModels]);

  const ollamaOptions = ollamaModels.length > 0
    ? ollamaModels.map(item => ({
      value: `ollama:${item.name}`,
      label: `${item.name}${item.details?.parameter_size ? ` (${item.details.parameter_size})` : ''}`
    }))
    : [
      { value: 'llama3', label: 'Ollama Llama 3 (fallback)' },
      { value: 'qwen2.5-coder', label: 'Ollama Qwen 2.5 Coder (fallback)' }
    ];

  const selectedDynamicOllamaMissing = model.startsWith('ollama:')
    && !ollamaOptions.some(option => option.value === model);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig({
      apiKey: inputKey,
      geminiApiKey: inputGeminiKey,
      openaiApiKey: inputOpenaiKey,
      anthropicApiKey: inputAnthropicKey,
      openrouterApiKey: inputOpenrouterKey,
      ollamaUrl: inputOllamaUrl,
      useSearch: inputUseSearch,
      workspaceRoot: inputWorkspace,
      theme: inputTheme,
      customInstructions: inputCustomInstructions,
      responseMode: inputResponseMode,
      githubToken: inputGithubToken,
      githubRepoUrl: inputGithubRepoUrl,
      zeroEgressMode: zeroEgressInput,
      privacyMode: privacyInput
    });
    if (inputGithubRepoUrl) {
      fetch('http://localhost:3001/api/git/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputGithubRepoUrl, token: inputGithubToken })
      }).catch(err => console.error('Failed to configure git remote', err));
    }
    setShowConfigDrawer(false);
  };

  return (
    <div className="flex items-center gap-3 font-mono text-xs select-none flex-wrap justify-end">
      
      {/* Model Selector Dropdown */}
      <div className="flex items-center border border-forge-dark rounded p-0.5">
        <select
          aria-label="AI model"
          value={model}
          onChange={(e) => onUpdateConfig({ model: e.target.value })}
          className="bg-transparent border-0 text-[11px] text-forge-text font-mono font-bold outline-none px-1 py-0.5 cursor-pointer"
        >
          <optgroup label="DeepSeek (V3 / R1)">
            <option value="deepseek-chat">DeepSeek Chat V3</option>
            <option value="deepseek-reasoner">DeepSeek Reasoner R1</option>
          </optgroup>
          <optgroup label="Google Gemini">
            <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
            <option value="gemini-3.1-pro">Gemini 3.1 Pro</option>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
          </optgroup>
          <optgroup label="OpenAI GPT">
            <option value="gpt-5.5">GPT 5.5</option>
            <option value="gpt-5.5-mini">GPT 5.5 Mini</option>
            <option value="gpt-5.4">GPT 5.4</option>
            <option value="gpt-4o">GPT-4o (Premium)</option>
            <option value="gpt-4o-mini">GPT-4o Mini</option>
          </optgroup>
          <optgroup label="Anthropic Claude">
            <option value="claude-4-8-opus">Claude 4.8 Opus</option>
            <option value="claude-4-6-sonnet">Claude 4.6 Sonnet</option>
            <option value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</option>
            <option value="claude-3-5-haiku-latest">Claude 3.5 Haiku</option>
          </optgroup>
          <optgroup label="OpenRouter">
            <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B</option>
            <option value="qwen/qwen-2.5-coder-32b-instruct">Qwen 2.5 Coder 32B</option>
          </optgroup>
          <optgroup label="Local (Ollama)">
            {selectedDynamicOllamaMissing && (
              <option value={model}>{model.replace('ollama:', '')} (selected)</option>
            )}
            {ollamaOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Thinking Capability Dropdown */}
      <div className="flex items-center border border-forge-dark rounded p-0.5">
        <select
          value={thinkingCapability}
          onChange={(e) => onUpdateConfig({ thinkingCapability: e.target.value as any })}
          className="bg-transparent border-0 text-[11px] text-forge-text font-mono font-bold outline-none px-1 py-0.5 cursor-pointer"
          title="App Thinking Capability"
        >
          <option value="low">Think: Low</option>
          <option value="medium">Think: Medium</option>
          <option value="high">Think: High</option>
          <option value="ultra">Think: Ultra</option>
        </select>
      </div>

      {/* Thinking Level Badge */}
      <div className="flex items-center border border-forge-neon/50 text-forge-neon bg-black/40 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono select-none" title="AI Model Baseline Capability">
        {getThinkingLevel(model)}
      </div>

      {/* Local Only Mode Badge */}
      {(zeroEgressMode || privacyMode || model.startsWith('ollama:') || model === 'llama3' || model === 'qwen2.5-coder') && (
        <div className="flex items-center border border-forge-neon text-forge-neon bg-black/40 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono select-none animate-pulse">
          [LOCAL ONLY]
        </div>
      )}

      {/* Connection Indicator */}
      <div className="flex items-center gap-1.5 px-1">
        <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-forge-neon animate-pulse' : 'bg-forge-red animate-ping'}`} />
        <span className={`text-[11px] font-mono ${isConnected ? 'text-forge-text font-bold' : 'neon-red font-bold'}`}>
          {isConnected ? 'Connected' : 'Offline'}
        </span>
      </div>

      {/* Companion Pairing Indicator */}
      <div className="flex items-center gap-1.5 px-1 border-l border-forge-dark pl-2">
        <button
          onClick={() => setIsCompanionModalOpen(true)}
          className="flex items-center gap-1 text-[11px] font-mono text-forge-neon hover:text-white bg-transparent border-0 cursor-pointer"
          title="Pair and manage Web/Mobile companion devices"
          type="button"
        >
          <Globe size={11} className={companionCount > 0 ? "animate-pulse text-forge-neon font-bold" : "text-forge-dim"} />
          <span>Companion: {companionCount} connected</span>
        </button>
      </div>

      {/* Help Guide walkthrough toggle */}
      <button
        onClick={onOpenGuide}
        className="forge-secondary-button flex items-center gap-1 hover:text-white"
        type="button"
      >
        <HelpCircle size={10} />
        <span>GUIDE</span>
      </button>

      {/* Configurations Drawer Toggle Button */}
      <button
        onClick={() => setShowConfigDrawer(!showConfigDrawer)}
        className="forge-secondary-button flex items-center gap-1"
      >
        <Settings size={10} className={showConfigDrawer ? 'animate-spin' : ''} />
        <span>CONFIG</span>
      </button>

      {/* Configuration Settings Modal overlay */}
      {showConfigDrawer && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSave}
            className="forge-panel w-full max-w-md p-4 bg-forge-very-dark border border-forge-neon flex flex-col gap-2.5 max-h-[80vh]"
          >
            <div className="flex items-center justify-between border-b border-forge-dim pb-1.5 mb-1 shrink-0">
              <span className="text-xs font-bold font-header text-forge-neon uppercase tracking-wider">
                Kryleos Forge Configuration
              </span>
              <button
                type="button"
                onClick={() => setShowConfigDrawer(false)}
                className="text-forge-neon hover:text-white"
              >
                [X]
              </button>
            </div>

            {/* Interactive Tab Selectors (Sidebar menu grid layout) */}
            <div className="grid grid-cols-4 gap-1.5 border-b border-forge-dark pb-2 mb-1.5 shrink-0 select-none text-[9px] font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('api_keys')}
                className={`py-1 rounded border text-center transition-all cursor-pointer ${activeTab === 'api_keys' ? 'bg-forge-very-dark text-forge-neon border-forge-neon' : 'bg-transparent text-forge-dim border-forge-dark'}`}
              >
                API Keys
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('workspace')}
                className={`py-1 rounded border text-center transition-all cursor-pointer ${activeTab === 'workspace' ? 'bg-forge-very-dark text-forge-neon border-forge-neon' : 'bg-transparent text-forge-dim border-forge-dark'}`}
              >
                Directory
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('github_sync')}
                className={`py-1 rounded border text-center transition-all cursor-pointer ${activeTab === 'github_sync' ? 'bg-forge-very-dark text-forge-neon border-forge-neon' : 'bg-transparent text-forge-dim border-forge-dark'}`}
              >
                Syncs
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('account_theme')}
                className={`py-1 rounded border text-center transition-all cursor-pointer ${activeTab === 'account_theme' ? 'bg-forge-very-dark text-forge-neon border-forge-neon' : 'bg-transparent text-forge-dim border-forge-dark'}`}
              >
                Account
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('permissions')}
                className={`py-1 rounded border text-center transition-all cursor-pointer ${activeTab === 'permissions' ? 'bg-forge-very-dark text-forge-neon border-forge-neon' : 'bg-transparent text-forge-dim border-forge-dark'}`}
              >
                Security
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('agents')}
                className={`py-1 rounded border text-center transition-all cursor-pointer ${activeTab === 'agents' ? 'bg-forge-very-dark text-forge-neon border-forge-neon' : 'bg-transparent text-forge-dim border-forge-dark'}`}
              >
                Specialists
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('artifacts')}
                className={`py-1 rounded border text-center transition-all cursor-pointer ${activeTab === 'artifacts' ? 'bg-forge-very-dark text-forge-neon border-forge-neon' : 'bg-transparent text-forge-dim border-forge-dark'}`}
              >
                Artifacts
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('subscription')}
                className={`py-1 rounded border text-center transition-all cursor-pointer ${activeTab === 'subscription' ? 'bg-forge-very-dark text-forge-neon border-forge-neon' : 'bg-transparent text-forge-dim border-forge-dark'}`}
              >
                Billing
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1.5 flex flex-col gap-3 py-1">
              
              {activeTab === 'api_keys' && (
                <div className="flex flex-col gap-3">
                  <div className="text-[9px] text-forge-dim uppercase font-bold flex items-center justify-between border-b border-forge-dark pb-1 mb-1 font-mono">
                    <span>Enter LLM endpoint parameters</span>
                    <span className="text-forge-neon font-bold text-[8px] bg-forge-very-dark border border-forge-neon px-1 rounded animate-pulse">
                      ✓ {keychainSecured ? 'OS KEYCHAIN SECURED' : 'ENCRYPTED LOCAL STORE'}
                    </span>
                  </div>

                  {/* Zero Egress Mode Toggle */}
                  <div className="flex items-center justify-between gap-3 border border-forge-neon border-opacity-35 bg-black bg-opacity-40 p-2.5 rounded mb-1">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold uppercase text-forge-neon flex items-center gap-1 font-mono">
                        <ShieldAlert size={12} /> Zero Egress Mode
                      </span>
                      <span className="text-[9px] text-forge-dim leading-tight">
                        Block all outbound calls to hosted APIs. Enforces 100% local operation via Ollama.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={zeroEgressInput}
                      onChange={(e) => setZeroEgressInput(e.target.checked)}
                      className="accent-forge-neon cursor-pointer h-4 w-4 shrink-0"
                    />
                  </div>

                  {/* Privacy Mode Toggle */}
                  <div className="flex items-center justify-between gap-3 border border-forge-neon border-opacity-35 bg-black bg-opacity-40 p-2.5 rounded mb-1">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold uppercase text-forge-neon flex items-center gap-1 font-mono">
                        <Shield size={12} /> Privacy Mode
                      </span>
                      <span className="text-[9px] text-forge-dim leading-tight">
                        Disables setting sync, blocks hosted model calls (unless overridden), and enforces local execution.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={privacyInput}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setPrivacyInput(val);
                        if (val) {
                          setZeroEgressInput(true);
                        }
                      }}
                      className="accent-forge-neon cursor-pointer h-4 w-4 shrink-0"
                    />
                  </div>

                  {/* Setup Wizard Link */}
                  <div className="flex justify-end mb-1">
                    <button
                      type="button"
                      onClick={() => {
                        setWizardStep(1);
                        setIsWizardOpen(true);
                      }}
                      className="forge-btn text-[9px] px-2.5 py-1 font-bold font-mono text-forge-neon flex items-center gap-1.5"
                    >
                      <HelpCircle size={10} />
                      <span>LAUNCH PROVIDER WIZARD</span>
                    </button>
                  </div>

                  {/* DeepSeek key */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase text-forge-dim flex items-center justify-between font-bold w-full">
                      <span className="flex items-center gap-1.5 font-mono">
                        <Key size={11} />
                        <span>DeepSeek API Key</span>
                      </span>
                      <div className="flex items-center gap-1.5 text-[9px] font-mono">
                        {deepseekStatus === 'online' && (
                          <span className="text-forge-neon flex items-center gap-0.5"><CheckCircle2 size={10} /> Online</span>
                        )}
                        {deepseekStatus === 'error' && (
                          <span className="text-forge-red flex items-center gap-0.5"><XCircle size={10} /> Error</span>
                        )}
                      </div>
                    </label>
                    <div className="flex gap-1.5 items-center">
                      <div className="relative flex items-center flex-1">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={inputKey}
                          onChange={(e) => setInputKey(e.target.value)}
                          placeholder="sk-..."
                          className="forge-input w-full pr-10 text-[11px] text-forge-neon bg-black border-forge-dark"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-3 text-forge-dim hover:text-forge-neon"
                        >
                          {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => testKey('deepseek', inputKey)}
                        disabled={testingKeys['deepseek'] || !inputKey}
                        className="forge-btn text-[9px] px-2.5 py-1.5 font-bold font-mono shrink-0 disabled:opacity-40"
                      >
                        {testingKeys['deepseek'] ? 'TESTING...' : 'TEST'}
                      </button>
                    </div>
                  </div>

                  {/* Gemini key */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase text-forge-dim flex items-center justify-between font-bold w-full">
                      <span className="flex items-center gap-1.5 font-mono">
                        <Key size={11} />
                        <span>Google Gemini API Key</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-[9px] font-mono">
                          {geminiStatus === 'online' && (
                            <span className="text-forge-neon flex items-center gap-0.5"><CheckCircle2 size={10} /> Online</span>
                          )}
                          {geminiStatus === 'error' && (
                            <span className="text-forge-red flex items-center gap-0.5"><XCircle size={10} /> Error</span>
                          )}
                        </div>
                        <a
                          href="https://aistudio.google.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-forge-neon hover:text-white underline text-[9px] font-normal font-mono"
                        >
                          [Get Free Key]
                        </a>
                      </div>
                    </label>
                    <div className="flex gap-1.5 items-center">
                      <div className="relative flex items-center flex-1">
                        <input
                          type={showGeminiKey ? 'text' : 'password'}
                          value={inputGeminiKey}
                          onChange={(e) => setInputGeminiKey(e.target.value)}
                          placeholder="AIzaSy..."
                          className="forge-input w-full pr-10 text-[11px] text-forge-neon bg-black border-forge-dark"
                        />
                        <button
                          type="button"
                          onClick={() => setShowGeminiKey(!showGeminiKey)}
                          className="absolute right-3 text-forge-dim hover:text-forge-neon"
                        >
                          {showGeminiKey ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => testKey('gemini', inputGeminiKey)}
                        disabled={testingKeys['gemini'] || !inputGeminiKey}
                        className="forge-btn text-[9px] px-2.5 py-1.5 font-bold font-mono shrink-0 disabled:opacity-40"
                      >
                        {testingKeys['gemini'] ? 'TESTING...' : 'TEST'}
                      </button>
                    </div>
                  </div>

                  {/* OpenAI key */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase text-forge-dim flex items-center justify-between font-bold w-full">
                      <span className="flex items-center gap-1.5 font-mono">
                        <Key size={11} />
                        <span>OpenAI API Key</span>
                      </span>
                      <div className="flex items-center gap-1.5 text-[9px] font-mono">
                        {openaiStatus === 'online' && (
                          <span className="text-forge-neon flex items-center gap-0.5"><CheckCircle2 size={10} /> Online</span>
                        )}
                        {openaiStatus === 'error' && (
                          <span className="text-forge-red flex items-center gap-0.5"><XCircle size={10} /> Error</span>
                        )}
                      </div>
                    </label>
                    <div className="flex gap-1.5 items-center">
                      <div className="relative flex items-center flex-1">
                        <input
                          type={showOpenaiKey ? 'text' : 'password'}
                          value={inputOpenaiKey}
                          onChange={(e) => setInputOpenaiKey(e.target.value)}
                          placeholder="sk-proj-..."
                          className="forge-input w-full pr-10 text-[11px] text-forge-neon bg-black border-forge-dark"
                        />
                        <button
                          type="button"
                          onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                          className="absolute right-3 text-forge-dim hover:text-forge-neon"
                        >
                          {showOpenaiKey ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => testKey('openai', inputOpenaiKey)}
                        disabled={testingKeys['openai'] || !inputOpenaiKey}
                        className="forge-btn text-[9px] px-2.5 py-1.5 font-bold font-mono shrink-0 disabled:opacity-40"
                      >
                        {testingKeys['openai'] ? 'TESTING...' : 'TEST'}
                      </button>
                    </div>
                  </div>

                  {/* Anthropic key */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase text-forge-dim flex items-center justify-between font-bold w-full">
                      <span className="flex items-center gap-1.5 font-mono">
                        <Key size={11} />
                        <span>Anthropic API Key</span>
                      </span>
                      <div className="flex items-center gap-1.5 text-[9px] font-mono">
                        {anthropicStatus === 'online' && (
                          <span className="text-forge-neon flex items-center gap-0.5"><CheckCircle2 size={10} /> Online</span>
                        )}
                        {anthropicStatus === 'error' && (
                          <span className="text-forge-red flex items-center gap-0.5"><XCircle size={10} /> Error</span>
                        )}
                      </div>
                    </label>
                    <div className="flex gap-1.5 items-center">
                      <div className="relative flex items-center flex-1">
                        <input
                          type={showAnthropicKey ? 'text' : 'password'}
                          value={inputAnthropicKey}
                          onChange={(e) => setInputAnthropicKey(e.target.value)}
                          placeholder="sk-ant-..."
                          className="forge-input w-full pr-10 text-[11px] text-forge-neon bg-black border-forge-dark"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                          className="absolute right-3 text-forge-dim hover:text-forge-neon"
                        >
                          {showAnthropicKey ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => testKey('anthropic', inputAnthropicKey)}
                        disabled={testingKeys['anthropic'] || !inputAnthropicKey}
                        className="forge-btn text-[9px] px-2.5 py-1.5 font-bold font-mono shrink-0 disabled:opacity-40"
                      >
                        {testingKeys['anthropic'] ? 'TESTING...' : 'TEST'}
                      </button>
                    </div>
                  </div>

                  {/* OpenRouter key */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase text-forge-dim flex items-center justify-between font-bold w-full">
                      <span className="flex items-center gap-1.5 font-mono">
                        <Key size={11} />
                        <span>OpenRouter API Key</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-[9px] font-mono">
                          {openrouterStatus === 'online' && (
                            <span className="text-forge-neon flex items-center gap-0.5"><CheckCircle2 size={10} /> Online</span>
                          )}
                          {openrouterStatus === 'error' && (
                            <span className="text-forge-red flex items-center gap-0.5"><XCircle size={10} /> Error</span>
                          )}
                        </div>
                        <a
                          href="https://openrouter.ai/keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-forge-neon hover:text-white underline text-[9px] font-normal font-mono"
                        >
                          [Get Free/Paid Key]
                        </a>
                      </div>
                    </label>
                    <div className="flex gap-1.5 items-center">
                      <div className="relative flex items-center flex-1">
                        <input
                          type={showOpenrouterKey ? 'text' : 'password'}
                          value={inputOpenrouterKey}
                          onChange={(e) => setInputOpenrouterKey(e.target.value)}
                          placeholder="sk-or-..."
                          className="forge-input w-full pr-10 text-[11px] text-forge-neon bg-black border-forge-dark"
                        />
                        <button
                          type="button"
                          onClick={() => setShowOpenrouterKey(!showOpenrouterKey)}
                          className="absolute right-3 text-forge-dim hover:text-forge-neon"
                        >
                          {showOpenrouterKey ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => testKey('openrouter', inputOpenrouterKey)}
                        disabled={testingKeys['openrouter'] || !inputOpenrouterKey}
                        className="forge-btn text-[9px] px-2.5 py-1.5 font-bold font-mono shrink-0 disabled:opacity-40"
                      >
                        {testingKeys['openrouter'] ? 'TESTING...' : 'TEST'}
                      </button>
                    </div>
                  </div>

                  {/* Ollama URL */}
                  <div className="flex flex-col gap-1 font-mono">
                    <label className="text-[10px] uppercase text-forge-dim flex items-center gap-1.5 font-bold">
                      <FolderOpen size={11} />
                      <span>Ollama Endpoint URL</span>
                    </label>
                    <input
                      type="text"
                      value={inputOllamaUrl}
                      onChange={(e) => setInputOllamaUrl(e.target.value)}
                      placeholder="http://localhost:11434"
                      className="forge-input text-[11px] text-forge-neon bg-black border-forge-dark"
                    />
                    <div className="flex items-center justify-between gap-2 text-[9px] text-forge-dim">
                      <span>{ollamaStatus}</span>
                      <button
                        type="button"
                        onClick={() => refreshOllamaModels(inputOllamaUrl)}
                        disabled={isLoadingOllamaModels}
                        className="forge-btn text-[8px] px-2 py-0.5 font-bold flex items-center gap-1 disabled:opacity-50"
                      >
                        <RefreshCw size={9} className={isLoadingOllamaModels ? 'animate-spin' : ''} />
                        <span>DETECT MODELS</span>
                      </button>
                    </div>
                  </div>

                  {/* Task recommendation tips */}
                  <div className="border border-forge-dark bg-black bg-opacity-30 p-2 rounded text-[9px] font-mono text-forge-dim flex flex-col gap-1 mt-1">
                    <span className="text-white uppercase font-bold text-[9.5px]">💡 MODEL TIPS & RECOMMENDATIONS:</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <span className="text-forge-neon font-bold">Build Loops:</span> Claude 3.5 Sonnet / Gemini Pro (Reasoning-heavy)
                      </div>
                      <div>
                        <span className="text-forge-neon font-bold">Fast Edits:</span> DeepSeek Chat / GPT-4o-Mini (Cost-effective)
                      </div>
                      <div>
                        <span className="text-forge-neon font-bold">Local Offline:</span> Ollama Llama 3 / Qwen 2.5 Coder
                      </div>
                      <div>
                        <span className="text-forge-neon font-bold">Drift Checking:</span> Claude 3.5 Sonnet (Strongest analysis)
                      </div>
                    </div>
                  </div>

                  {/* Search Grounding toggle */}
                  <div className="flex items-center gap-2 py-0.5 border border-forge-dark bg-black bg-opacity-30 rounded px-2">
                    <input
                      type="checkbox"
                      id="searchGroundingCheckbox"
                      checked={inputUseSearch}
                      onChange={(e) => setInputUseSearch(e.target.checked)}
                      className="accent-forge-neon h-3.5 w-3.5 border border-forge-dark cursor-pointer rounded"
                    />
                    <label htmlFor="searchGroundingCheckbox" className="text-[10px] uppercase text-forge-text cursor-pointer flex items-center gap-1.5 select-none font-bold">
                      <Search size={11} className="text-forge-neon" />
                      <span>Enable Google Search Grounding (Gemini)</span>
                    </label>
                  </div>
                </div>
              )}

              {activeTab === 'workspace' && (
                <div className="flex flex-col gap-3">
            {/* Workspace directory configuration */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase text-forge-dim flex items-center gap-1.5 font-bold">
                <FolderOpen size={11} />
                <span>Sandbox Workspace Directory</span>
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={inputWorkspace}
                  onChange={(e) => setInputWorkspace(e.target.value)}
                  placeholder="e.g. C:\Users\YourName\Workspace"
                  className="forge-input text-[11px] text-forge-neon bg-black border-forge-dark flex-1"
                  required
                />
                {(window as any).electronAPI && (
                  <button
                    type="button"
                    onClick={handleBrowseWorkspace}
                    className="forge-btn text-[9px] px-2 font-bold font-mono"
                    title="Browse workspace directory"
                  >
                    BROWSE
                  </button>
                )}
              </div>
            </div>

            {/* Custom Instructions configuration */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase text-forge-dim flex items-center gap-1.5 font-bold">
                <span>Custom System Instructions</span>
              </label>
              <textarea
                value={inputCustomInstructions}
                onChange={(e) => setInputCustomInstructions(e.target.value)}
                placeholder="e.g. Always write robust typescript. Prefer functional components. Follow design patterns strictly..."
                rows={3}
                className="forge-input text-[11px] text-forge-neon bg-black border-forge-dark w-full resize-y font-mono"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase text-forge-dim flex items-center gap-1.5 font-bold">
                <span>Response Mode</span>
              </label>
              <div className="grid grid-cols-4 gap-1">
                {([
                  ['balanced', 'Balanced'],
                  ['concise', 'Concise'],
                  ['critical', 'Critical'],
                  ['brutal_audit', 'Audit']
                ] as Array<[ResponseMode, string]>).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setInputResponseMode(mode)}
                    className={`text-[9px] border rounded px-1.5 py-1 font-mono font-bold transition-colors ${
                      inputResponseMode === mode
                        ? 'bg-forge-very-dark border-forge-neon text-forge-neon'
                        : 'bg-transparent border-forge-dark text-forge-dim hover:text-forge-text'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-[9px] text-forge-dim">
                Concise trims unnecessary detail. Critical and Audit call out mistakes and weak assumptions directly.
              </span>
            </div>
                </div>
              )}

              {activeTab === 'github_sync' && (
                <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1 border border-forge-dark bg-black bg-opacity-30 p-2 rounded">
              <label className="text-[10px] uppercase text-forge-dim flex items-center gap-1.5 font-bold mb-1">
                <span>GitHub Remote & Tokens</span>
              </label>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-forge-dim uppercase font-bold">Repo URL (or user/repo)</span>
                  <input
                    type="text"
                    value={inputGithubRepoUrl}
                    onChange={(e) => setInputGithubRepoUrl(e.target.value)}
                    placeholder="https://github.com/username/repository.git"
                    className="forge-input text-[10px] text-forge-neon bg-black border-forge-dark w-full font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-forge-dim uppercase font-bold">Personal Access Token (PAT)</span>
                  <div className="relative flex items-center">
                    <input
                      type={showGithubToken ? 'text' : 'password'}
                      value={inputGithubToken}
                      onChange={(e) => setInputGithubToken(e.target.value)}
                      placeholder="github_pat_..."
                      className="forge-input text-[10px] text-forge-neon bg-black border-forge-dark w-full pr-10 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGithubToken(!showGithubToken)}
                      className="absolute right-3 text-forge-dim hover:text-forge-neon"
                    >
                      {showGithubToken ? <EyeOff size={11} /> : <Eye size={11} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Google Apps Integration */}
            <div className="flex flex-col gap-1 border border-forge-dark bg-black bg-opacity-30 p-2 rounded">
              <label className="text-[10px] uppercase text-forge-dim flex items-center gap-1.5 font-bold mb-1">
                <span>Google Cloud & App Sync</span>
              </label>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] text-forge-text font-mono">
                  <span>Linked Account Status:</span>
                  <span className={isGoogleLinked ? 'text-forge-neon font-bold' : 'text-forge-red font-bold animate-pulse'}>
                    {isGoogleLinked ? 'CONNECTED' : 'NOT LINKED'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleLinkGoogle}
                    className="forge-btn text-[9px] px-2 py-1 flex-1 font-bold font-mono"
                  >
                    {isGoogleLinked ? 'RE-LINK GOOGLE' : 'LINK GOOGLE APPS'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncGoogle}
                    disabled={!isGoogleLinked || isLocalSyncing || isSyncingGoogle}
                    className="forge-btn text-[9px] px-2 py-1 flex-1 font-bold font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLocalSyncing ? 'SYNCING...' : 'SYNC ALL APPS'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

          {activeTab === 'permissions' && (
            <div className="flex flex-col gap-3 font-mono text-[10px]">
              <span className="text-[10px] text-forge-neon font-bold uppercase tracking-wider mb-1">
                Configure Global Resource Permissions
              </span>

              {/* PII Compliance Gating */}
              <div className="border border-forge-dark bg-black bg-opacity-30 p-2.5 rounded flex flex-col gap-1.5">
                <span className="text-[10px] uppercase font-bold text-white flex items-center justify-between">
                  <span>PII Compliance Filter</span>
                  <input
                    type="checkbox"
                    checked={piiFilterEnabled}
                    onChange={(e) => onTogglePiiFilter?.(e.target.checked)}
                    className="accent-forge-neon cursor-pointer h-3.5 w-3.5"
                  />
                </span>
                <span className="text-forge-dim text-[9px]">Redact sensitive API keys, emails, and phone numbers before querying model nodes.</span>
              </div>

              {/* File Permissions */}
              <div className="border border-forge-dark bg-black bg-opacity-30 p-2.5 rounded flex flex-col gap-1.5">
                <span className="text-[10px] uppercase font-bold text-white flex items-center justify-between">
                  <span>File Access Rules</span>
                  <span className="text-[8px] bg-forge-very-dark text-forge-neon border border-forge-dark px-1 py-0.5 rounded font-normal">ENABLED</span>
                </span>
                <span className="text-forge-dim text-[9px]">Configure allowed and denied paths for file reads and writes.</span>
                <div className="grid grid-cols-2 gap-1 text-[9px] mt-1.5 pt-1.5 border-t border-forge-very-dark">
                  <span className="text-forge-text">✓ Read allowed: WORKSPACE_DIR</span>
                  <span className="text-forge-text">✓ Write allowed: WORKSPACE_DIR</span>
                </div>
              </div>

              {/* Network Permissions */}
              <div className="border border-forge-dark bg-black bg-opacity-30 p-2.5 rounded flex flex-col gap-1.5">
                <span className="text-[10px] uppercase font-bold text-white flex items-center justify-between">
                  <span>Network Access Rules</span>
                  <span className="text-[8px] bg-forge-very-dark text-forge-neon border border-forge-dark px-1 py-0.5 rounded font-normal">RESTRICTED</span>
                </span>
                <span className="text-forge-dim text-[9px]">Configure allowed and denied URLs for reading API structures.</span>
                <div className="text-[9px] mt-1.5 pt-1.5 border-t border-forge-very-dark flex items-center justify-between">
                  <span className="text-forge-text">✓ Domain whitelist: *.googleapis.com, *.github.com</span>
                </div>
              </div>

              {/* Terminal Permissions */}
              <div className="border border-forge-dark bg-black bg-opacity-30 p-2.5 rounded flex flex-col gap-1.5">
                <span className="text-[10px] uppercase font-bold text-white">Terminal Commands (Security Gating)</span>
                <span className="text-forge-dim text-[9px]">Enforce confirmation checks before running shell commands.</span>
                <div className="flex flex-col gap-1 text-[9px] mt-1.5 pt-1.5 border-t border-forge-very-dark">
                  <div className="flex justify-between">
                    <span className="text-forge-text">Confirm execution inside Sandbox:</span>
                    <span className="text-forge-neon font-bold">ALWAYS</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-forge-text">Confirm execution outside Sandbox (Local):</span>
                    <span className="text-forge-neon font-bold">ALWAYS</span>
                  </div>
                </div>
              </div>

              {/* RBAC Command Policies */}
              <div className="border border-forge-dark bg-black bg-opacity-30 p-2.5 rounded flex flex-col gap-1.5">
                <span className="text-[10px] uppercase font-bold text-white flex items-center justify-between">
                  <span>RBAC & Command Policies</span>
                  <span className="text-[8px] bg-forge-very-dark border border-forge-neon text-forge-neon px-1 py-0.5 rounded font-bold">ENTERPRISE</span>
                </span>
                <div className="flex flex-col gap-2 mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-forge-dim">Workspace Role:</span>
                    <select
                      aria-label="Workspace role"
                      value={userRole}
                      onChange={(e) => {
                        const nextRole = e.target.value as 'admin' | 'developer';
                        setUserRole(nextRole);
                        handleUpdateCommandPolicy(nextRole, blockedPrefixes);
                      }}
                      className="bg-black border border-forge-dark text-forge-neon rounded p-0.5 text-[9px] outline-none"
                    >
                      <option value="admin">Administrator</option>
                      <option value="developer">Developer (Restricted)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-forge-dim">Blocked Command Prefixes (comma separated):</span>
                    <input
                      type="text"
                      value={blockedPrefixes}
                      onChange={(e) => {
                        setBlockedPrefixes(e.target.value);
                        handleUpdateCommandPolicy(userRole, e.target.value);
                      }}
                      className="forge-input text-[9px] bg-black border border-forge-dark px-1.5 py-0.5 text-forge-neon w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Semantic Code Indexer */}
              <div className="border border-forge-dark bg-black bg-opacity-30 p-2.5 rounded flex flex-col gap-1.5">
                <span className="text-[10px] uppercase font-bold text-white flex items-center justify-between">
                  <span>Semantic Cache Indexer</span>
                  <span className="text-[8px] bg-forge-very-dark border border-forge-neon text-forge-neon px-1 py-0.5 rounded font-bold">PRO / ENTERPRISE</span>
                </span>
                <span className="text-forge-dim text-[9px]">Build local symbol cache to query function/class signatures instantly.</span>
                <div className="flex flex-col gap-1.5 mt-1">
                  <button
                    type="button"
                    onClick={handleBuildSemanticIndex}
                    disabled={isBuildingIndex}
                    className="forge-btn text-[9px] py-1 font-bold disabled:opacity-50"
                  >
                    {isBuildingIndex ? 'INDEXING...' : 'BUILD SEMANTIC INDEX'}
                  </button>
                  <span className="text-[9px] text-forge-neon font-mono italic text-center">{semanticStatus}</span>
                </div>
              </div>

              {/* MCP Tools */}
              <div className="border border-forge-dark bg-black bg-opacity-30 p-2.5 rounded flex flex-col gap-1.5">
                <span className="text-[10px] uppercase font-bold text-white flex items-center justify-between">
                  <span>Model Context Protocol (MCP) Tools</span>
                  <span className="text-[8px] bg-forge-very-dark text-forge-dim border border-forge-dark px-1 py-0.5 rounded font-normal">0 ACTIVE</span>
                </span>
                <span className="text-forge-dim text-[9px]">Configure external tools via Model Context Protocol servers.</span>
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="flex flex-col gap-3 font-mono text-[10px]">
              <span className="text-[10px] text-forge-neon font-bold uppercase tracking-wider mb-1">
                Multi-Agent Specialists Directory
              </span>
              <span className="text-forge-dim text-[9px]">
                These specialist personas are registered within the workspace system prompts.
              </span>

              <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                <div className="border border-forge-dark bg-black bg-opacity-40 p-2 rounded">
                  <div className="flex justify-between font-bold text-cyan-400">
                    <span>Builder (developer)</span>
                    <span className="text-[8px] border border-cyan-800 px-1 rounded">BUILT-IN</span>
                  </div>
                  <p className="text-[9px] text-forge-dim mt-1">Specialized in writing robust, clean, and fully-implemented code blocks.</p>
                </div>
                <div className="border border-forge-dark bg-black bg-opacity-40 p-2 rounded">
                  <div className="flex justify-between font-bold text-purple-400">
                    <span>Analyst (researcher)</span>
                    <span className="text-[8px] border border-purple-800 px-1 rounded">BUILT-IN</span>
                  </div>
                  <p className="text-[9px] text-forge-dim mt-1">Queries lists, files, and parses directories for structural matches.</p>
                </div>
                <div className="border border-forge-dark bg-black bg-opacity-40 p-2 rounded">
                  <div className="flex justify-between font-bold text-amber-400">
                    <span>Reviewer (debugger)</span>
                    <span className="text-[8px] border border-amber-800 px-1 rounded">BUILT-IN</span>
                  </div>
                  <p className="text-[9px] text-forge-dim mt-1">Enforces code compilation checks and verifies diagnostic command logs.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'artifacts' && (
            <div className="flex flex-col gap-3 font-mono text-[10px]">
              <span className="text-[10px] text-forge-neon font-bold uppercase tracking-wider mb-1">
                Active Codebase Artifact Templates
              </span>
              <span className="text-forge-dim text-[9px]">
                Manage markdown files produced to detail implementation workflows.
              </span>

              <div className="flex flex-col gap-2.5">
                <div className="border border-forge-dark bg-black bg-opacity-35 p-2 rounded flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="font-bold text-white text-[9.5px]">📋 implementation_plan.md</span>
                    <span className="text-forge-dim text-[8px] mt-0.5">Defines proposed modifications and verification procedures.</span>
                  </div>
                  <span className="text-[8px] text-forge-neon bg-forge-very-dark border border-forge-neon px-1.5 py-0.5 rounded font-bold shrink-0">ACTIVE</span>
                </div>

                <div className="border border-forge-dark bg-black bg-opacity-35 p-2 rounded flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="font-bold text-white text-[9.5px]">📋 task.md</span>
                    <span className="text-forge-dim text-[8px] mt-0.5">Living checklist monitoring active development milestones.</span>
                  </div>
                  <span className="text-[8px] text-forge-neon bg-forge-very-dark border border-forge-neon px-1.5 py-0.5 rounded font-bold shrink-0">ACTIVE</span>
                </div>

                <div className="border border-forge-dark bg-black bg-opacity-35 p-2 rounded flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="font-bold text-white text-[9.5px]">📋 walkthrough.md</span>
                    <span className="text-forge-dim text-[8px] mt-0.5">Walkthrough summarizing structural improvements and validation metrics.</span>
                  </div>
                  <span className="text-[8px] text-forge-neon bg-forge-very-dark border border-forge-neon px-1.5 py-0.5 rounded font-bold shrink-0">ACTIVE</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'account_theme' && (
            <div className="flex flex-col gap-3">
            
            {/* Realtime Socket Telemetry (Compression / Bandwidth) */}
            {telemetry && (
              <div className="border border-forge-neon border-opacity-30 bg-forge-very-dark p-2.5 rounded flex flex-col gap-1.5 font-mono text-[9px] mb-1">
                <span className="text-forge-neon font-bold uppercase text-[9.5px] flex items-center justify-between border-b border-forge-neon border-opacity-30 pb-1">
                  <span>⚡ WebSocket Telemetry</span>
                  <span className="text-[8px] bg-black border border-forge-neon px-1 rounded animate-pulse">COMPRESSION ACTIVE</span>
                </span>
                <div className="flex justify-between">
                  <span className="text-forge-dim">Bytes Transmitted:</span>
                  <span className="text-white font-bold">{(telemetry.bytesSent / 1024).toFixed(2)} KB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-forge-dim">Bytes Received:</span>
                  <span className="text-white font-bold">{(telemetry.bytesReceived / 1024).toFixed(2)} KB</span>
                </div>
                <div className="flex justify-between border-t border-forge-dark pt-1 mt-0.5">
                  <span className="text-forge-dim">Compression Savings:</span>
                  <span className="text-forge-neon font-bold">{(telemetry.compressionSavingsRatio * 100).toFixed(0)}% (zlib deflate)</span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 border border-forge-dark bg-black bg-opacity-30 p-2 rounded">
              <label className="text-[10px] uppercase text-forge-neon font-bold flex items-center justify-between">
                <span>Kryleos Sync Account</span>
                  <span className="text-[8px] text-forge-dim flex items-center gap-1">
                    Multi-platform Sync
                    <FeatureBadge id="cloudSync" compact />
                  </span>
              </label>

              {!user ? (
                <div className="flex flex-col gap-2 font-mono">
                  <div className="flex gap-1.5 justify-center border-b border-forge-very-dark pb-1 text-[9px]">
                    <button
                      type="button"
                      onClick={() => setAuthMode('login')}
                      className={`px-2 py-0.5 rounded cursor-pointer ${authMode === 'login' ? 'bg-forge-very-dark border border-forge-neon text-forge-neon' : 'text-forge-dim'}`}
                    >
                      LOGIN
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('register')}
                      className={`px-2 py-0.5 rounded cursor-pointer ${authMode === 'register' ? 'bg-forge-very-dark border border-forge-neon text-forge-neon' : 'text-forge-dim'}`}
                    >
                      REGISTER
                    </button>
                  </div>
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="forge-input text-[9px] bg-black border-forge-dark w-full px-2 py-1 text-forge-neon font-mono"
                  />
                  <input
                    type="password"
                    placeholder="password"
                    value={passInput}
                    onChange={(e) => setPassInput(e.target.value)}
                    className="forge-input text-[9px] bg-black border-forge-dark w-full px-2 py-1 text-forge-neon font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (authMode === 'login') onLogin(emailInput, passInput);
                      else onRegister(emailInput, passInput);
                    }}
                    className="forge-btn text-[9px] py-1 font-bold font-mono"
                  >
                    {authMode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
                  </button>

                  {/* OAuth divider */}
                  <div className="flex items-center gap-1.5 my-1 text-[8px] text-forge-dim uppercase font-bold justify-center">
                    <span className="h-px bg-forge-very-dark flex-1"></span>
                    <span>Or continue with</span>
                    <span className="h-px bg-forge-very-dark flex-1"></span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 font-mono">
                    <button
                      type="button"
                      onClick={() => onLogin('google-oauth-user@gmail.com', 'google-oauth-flow-secret')}
                      className="text-[9px] border border-forge-dark hover:border-forge-neon py-1 rounded font-bold flex items-center justify-center gap-1 text-forge-dim hover:text-white bg-black cursor-pointer"
                    >
                      GOOGLE
                    </button>
                    <button
                      type="button"
                      onClick={() => onLogin('apple-id-user@icloud.com', 'apple-oauth-flow-secret')}
                      className="text-[9px] border border-forge-dark hover:border-forge-neon py-1 rounded font-bold flex items-center justify-center gap-1 text-forge-dim hover:text-white bg-black cursor-pointer"
                    >
                      APPLE
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-[10px]">
                  <div className="flex items-center justify-between">
                    <span className="text-forge-text truncate">User: {user.email}</span>
                    <button
                      type="button"
                      onClick={onLogout}
                      className="text-red-400 hover:text-white text-[8px] cursor-pointer"
                    >
                      [LOGOUT]
                    </button>
                  </div>

                  <div className="flex items-center justify-between border-t border-forge-very-dark pt-1.5">
                    <span>Account Plan:</span>
                    <span className={`font-bold ${(user.tier || (user.isPremium ? 'basic' : 'free')) === 'enterprise' ? 'text-forge-neon animate-pulse' : (user.tier || (user.isPremium ? 'basic' : 'free')) === 'pro' ? 'text-blue-400' : (user.tier || (user.isPremium ? 'basic' : 'free')) === 'basic' ? 'text-amber-400' : 'text-forge-dim'}`}>
                      {(user.tier || (user.isPremium ? 'basic' : 'free')).toUpperCase()}
                    </span>
                  </div>

                  {/* Pricing Tier Selection Grid */}
                  <div className="flex flex-col gap-1.5 border-t border-forge-very-dark pt-2 mt-1">
                    <span className="text-[9px] text-forge-dim uppercase font-bold">Select Subscription Plan</span>
                    <div className="flex flex-col gap-1">
                      {(user.tier || 'free') !== 'solo' && (
                        <button
                          type="button"
                          onClick={() => onSubscribe('solo')}
                          className="text-[9px] bg-amber-900 border border-amber-500 hover:bg-amber-800 text-amber-100 font-bold py-1 px-2 rounded flex justify-between cursor-pointer"
                        >
                          <span>SOLO: TRACING & DRIFT</span>
                          <span>${TIER_PRICES.solo}/MO</span>
                        </button>
                      )}
                      {(user.tier || 'free') !== 'solo_plus' && (
                        <button
                          type="button"
                          onClick={() => onSubscribe('solo_plus')}
                          className="text-[9px] bg-blue-900 border border-blue-500 hover:bg-blue-800 text-blue-100 font-bold py-1 px-2 rounded flex justify-between cursor-pointer"
                        >
                          <span>SOLO PLUS: FULL DRIFT & SYNC</span>
                          <span>${TIER_PRICES.solo_plus}/MO</span>
                        </button>
                      )}
                      {(user.tier || 'free') !== 'founder' && (
                        <button
                          type="button"
                          onClick={() => onSubscribe('founder')}
                          className="text-[9px] bg-indigo-900 border border-indigo-500 hover:bg-indigo-800 text-indigo-100 font-bold py-1 px-2 rounded flex justify-between cursor-pointer"
                        >
                          <span>FOUNDER: MULTI-REPO & DEPS</span>
                          <span>${TIER_PRICES.founder}/MO</span>
                        </button>
                      )}
                      {(user.tier || 'free') !== 'agency' && (
                        <div
                          className="text-[9px] bg-emerald-950 border border-emerald-800 text-emerald-300 font-bold py-1 px-2 rounded flex justify-between opacity-70"
                          title="Agency tier is not yet available for purchase"
                        >
                          <span>AGENCY: TEAM & CLIENT HANDOFF</span>
                          <span>PREVIEW</span>
                        </div>
                      )}
                      {user.tier && user.tier !== 'free' && user.billingProvider === 'stripe' && onOpenBillingPortal && (
                        <button
                          type="button"
                          onClick={onOpenBillingPortal}
                          className="text-[9px] bg-forge-dark hover:bg-forge-neon hover:text-black border border-forge-neon text-forge-neon font-bold py-1 px-2 rounded flex justify-center cursor-pointer mt-1 font-mono transition-colors"
                        >
                          MANAGE SUBSCRIPTION (STRIPE PORTAL)
                        </button>
                      )}
                      {user.tier && user.tier !== 'free' && user.billingProvider !== 'license' && (
                        <button
                          type="button"
                          onClick={() => onSubscribe('free')}
                          className="text-[8px] text-forge-dim hover:text-red-400 font-mono transition-colors border border-forge-very-dark py-0.5 rounded cursor-pointer mt-1"
                        >
                          CANCEL SUBSCRIPTION (DEMOTE TO FREE)
                        </button>
                      )}
                    </div>
                  </div>

                  {user.tier && user.tier !== 'free' && (
                    <div className="flex flex-col gap-1.5 border-t border-forge-very-dark pt-2 mt-1">
                      <div className="flex justify-between text-[9px] text-forge-dim">
                        <span>Sync status: <span className="text-forge-text uppercase font-bold">{syncStatus}</span></span>
                        <span>{lastSyncedAt ? `Synced: ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Never synced'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={onForceSync}
                        className="forge-btn text-[9px] py-1 flex items-center justify-center gap-1 font-bold"
                      >
                        <RefreshCw size={10} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
                        <span>FORCE CLOUD SYNC</span>
                      </button>
                    </div>
                  )}

                  {user.tier && user.tier !== 'free' && (
                    <div className="flex flex-col gap-1.5 border-t border-forge-very-dark pt-2.5 mt-2 font-mono">
                      <div className="flex justify-between text-[9px] text-forge-dim">
                        <span>WebRTC Collab:</span>
                        <span className={collabActive ? "text-forge-neon font-bold animate-pulse" : "text-forge-dim"}>
                          {collabActive ? "📡 ACTIVE ROOM" : "OFFLINE"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={onStartCollabSession}
                        className={`forge-btn text-[9px] py-1 flex items-center justify-center gap-1 font-bold ${
                          collabActive ? "border-red-500 text-red-400 bg-forge-very-dark" : "border-forge-neon text-forge-neon"
                        }`}
                      >
                        <span>{collabActive ? "DISCONNECT WEBRTC" : "START COLLAB SESSION"}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Theme configuration */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase text-forge-dim flex items-center gap-1.5 font-bold">
                <span>Console Theme Stylesheet</span>
              </label>
              <div className="flex gap-1 bg-forge-very-dark border border-forge-dark rounded p-0.5">
                {['forge', 'dark', 'light', 'terminal', 'matrix'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setInputTheme(t)}
                    className={`flex-1 py-1 text-[9px] uppercase font-mono rounded transition-all duration-150 cursor-pointer ${
                      inputTheme === t
                        ? 'bg-forge-neon text-forge-very-dark font-bold'
                        : 'bg-transparent text-forge-dim hover:text-forge-neon'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <span className="text-[9px] text-forge-dim">
                Forge (default) is a professional dark theme with green accents. Matrix and Terminal are the classic green-glow retro styles.
              </span>
            </div>
          </div>
        )}

          {activeTab === 'subscription' && (
            <div className="flex flex-col gap-3 font-mono text-[10px]">
              <span className="text-[10px] text-forge-neon font-bold uppercase tracking-wider mb-1">
                <span className="inline-flex items-center gap-2">
                  Kryleos Billing & Subscription Tiers
                  <FeatureBadge id="billing" />
                </span>
              </span>

              {/* Current Status banner */}
              <div className="border border-forge-dark bg-black bg-opacity-35 p-2.5 rounded flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-white uppercase">Current Plan:</span>
                  <span className={`text-[10px] font-extrabold uppercase px-1.5 border rounded ${
                    !user ? 'text-forge-dim border-forge-very-dark' :
                    (user.tier || 'free') === 'enterprise' ? 'text-forge-neon border-forge-neon animate-pulse' :
                    (user.tier || 'free') === 'pro' ? 'text-cyan-400 border-cyan-800' :
                    (user.tier || 'free') === 'basic' ? 'text-amber-400 border-amber-800' : 'text-forge-dim border-forge-dark'
                  }`}>
                    {user ? (user.tier || 'free').toUpperCase() : 'FREE (UNAUTHENTICATED)'}
                  </span>
                </div>
                {!user ? (
                  <p className="text-[9px] text-forge-red italic">Sign in or register in the ACCOUNT tab to configure cloud subscription services.</p>
                ) : (
                  <p className="text-[9px] text-forge-dim">Your session token is active. Checkout uses Stripe globally and Razorpay subscriptions in India.</p>
                )}
              </div>

              {/* Offline license-key activation (Ed25519-signed, verified
                  server-side against an embedded public key). */}
              <div className="border border-forge-dark bg-black bg-opacity-30 p-2.5 rounded flex flex-col gap-1.5 mt-1">
                <span className="font-bold text-forge-text uppercase text-[10px]">License Key</span>
                <p className="text-[9px] text-forge-dim">Bought a plan externally? Paste the signed license key from your email to activate your tier. Expired or invalid keys are rejected.</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={licenseKeyInput}
                    onChange={(e) => setLicenseKeyInput(e.target.value)}
                    placeholder="<payload>.<signature>"
                    className="flex-1 forge-input text-[11px] px-2 py-1 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleRedeemLicense}
                    disabled={!licenseKeyInput.trim() || isRedeemingLicense}
                    className="forge-btn text-[10px] px-3 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isRedeemingLicense ? 'CHECKING...' : 'REDEEM'}
                  </button>
                </div>
              </div>

              {/* Recurring subscription tiers. */}
              <div className="flex flex-col gap-2.5 mt-1">
                {[
                  { id: 'solo', name: 'SOLO', price: `$${TIER_PRICES.solo}/mo`, color: 'text-amber-400', features: ['Execution tracing', 'AI acceptance criteria', 'Basic drift detection', 'PLAN → CREW direct sync'] },
                  { id: 'solo_plus', name: 'SOLO PLUS', price: `$${TIER_PRICES.solo_plus}/mo`, color: 'text-blue-400', features: ['Everything in Solo', 'Full drift (Diverged + confidence)', 'Trace history', 'Cross-device & mobile PLAN sync'] },
                  { id: 'founder', name: 'FOUNDER', price: `$${TIER_PRICES.founder}/mo`, color: 'text-indigo-400', features: ['Everything in Solo Plus', 'Multi-repo plan scope', 'Plan item dependencies', 'Unlimited What’s Left + MD export', 'Agent specialization'] },
                  { id: 'agency', name: 'AGENCY / TEAM', price: 'Preview', color: 'text-emerald-400', features: ['Everything in Founder', 'Shared plan editing', 'Team trace visibility', 'Client handoff packs', 'Branded docs + RBAC preview'] },
                ].map(tier => {
                  const current = (user?.tier || 'free') === tier.id;
                  const buyable = (BUYABLE_TIER_IDS as string[]).includes(tier.id);
                  return (
                    <div key={tier.id} className="border border-forge-dark bg-black bg-opacity-30 p-2.5 rounded flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <span className={`font-bold ${tier.color}`}>{tier.name} ({tier.price})</span>
                        {current && <span className="text-[9px] text-forge-neon font-bold">[YOUR PLAN]</span>}
                      </div>
                      <ul className="text-[9px] text-forge-text space-y-0.5 pl-3 list-disc">
                        {tier.features.map(f => <li key={f}>{f}</li>)}
                      </ul>
                      {!current && buyable && (
                        <button
                          type="button"
                          onClick={() => onSubscribe(tier.id)}
                          className="forge-btn text-[9px] py-1 font-bold mt-1"
                        >
                          UPGRADE TO {tier.name} &rarr;
                        </button>
                      )}
                      {!current && !buyable && (
                        <div className="text-[9px] text-forge-dim italic py-1 mt-1 text-center border border-forge-very-dark rounded">
                          Preview &middot; join waitlist
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Demote option */}
                {user && (user.tier || 'free') !== 'free' && user.billingProvider !== 'license' && (
                  <button
                    type="button"
                    onClick={() => onSubscribe('free')}
                    className="text-[9px] text-forge-dim hover:text-red-400 font-mono transition-colors border border-forge-very-dark py-1 rounded cursor-pointer mt-1"
                  >
                    CANCEL SUBSCRIPTION (RETURN TO FREE TIER)
                  </button>
                )}
            </div>
          </div>
        )}
        </div>

            {/* Save Buttons */}
            <div className="flex justify-between gap-3.5 mt-2 border-t border-forge-dark pt-3 shrink-0">
              <button
                type="button"
                onClick={wipeLocalData}
                className="px-3.5 py-1.5 border border-red-900 text-red-400 hover:text-white rounded text-[10px]"
                title="Workspace files and .kryleos folders are preserved"
              >
                CLEAR CREDENTIALS + LOCAL APP DATA
              </button>
              <div className="flex gap-3.5">
              <button
                type="button"
                onClick={() => setShowConfigDrawer(false)}
                className="px-3.5 py-1.5 border border-forge-dark text-forge-dim hover:text-forge-neon rounded text-[11px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="forge-btn text-[11px] font-bold py-1.5 px-3.5"
              >
                Save Settings
              </button>
              </div>
            </div>

          </form>
        </div>
      )}

      {/* Provider Onboarding Setup Wizard Modal */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-forge-very-dark border-2 border-forge-neon shadow-[0_0_25px_rgba(0,255,136,0.25)] w-full max-w-lg rounded-lg overflow-hidden font-mono flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-black/60 border-b border-forge-neon/30 px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Shield className="text-forge-neon animate-pulse" size={14} />
                <span className="text-white font-extrabold text-[11.5px] uppercase tracking-wider">
                  Provider Onboarding Wizard
                </span>
              </div>
              <button 
                type="button" 
                onClick={() => setIsWizardOpen(false)}
                className="text-forge-dim hover:text-forge-red font-bold text-[10px]"
              >
                [X] CLOSE
              </button>
            </div>

            {/* Step Indicators */}
            <div className="bg-black/30 px-4 py-2 border-b border-forge-dark flex justify-between text-[9px] font-bold shrink-0">
              {[
                { step: 1, label: 'DISCLOSURE' },
                { step: 2, label: 'OLLAMA DETECT' },
                { step: 3, label: 'HOSTED KEYS' },
                { step: 4, label: 'RECOMMENDATION' }
              ].map((s) => (
                <div 
                  key={s.step} 
                  className={`flex items-center gap-1 ${
                    wizardStep === s.step 
                      ? 'text-forge-neon font-extrabold' 
                      : wizardStep > s.step 
                        ? 'text-forge-text' 
                        : 'text-forge-dim'
                  }`}
                >
                  <span className={`h-4.5 w-4.5 rounded-full flex items-center justify-center text-[9px] ${
                    wizardStep === s.step 
                      ? 'bg-forge-neon text-forge-very-dark font-extrabold' 
                      : wizardStep > s.step 
                        ? 'bg-forge-dark text-forge-text' 
                        : 'bg-black/50 border border-forge-dark text-forge-dim'
                  }`}>
                    {s.step}
                  </span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Modal Body / Content */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 text-[11px] text-forge-text">
              
              {/* Step 1: Data Disclosure */}
              {wizardStep === 1 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-forge-neon font-bold text-xs uppercase">
                    <ShieldAlert size={14} />
                    <span>Privacy & Data Disclosures</span>
                  </div>
                  <p className="text-[10px] leading-relaxed text-forge-dim">
                    Kryleos Forge utilizes advanced LLM providers. Depending on your configuration, source code snippets, prompt directions, and compiler/linter error messages may be transmitted to external model servers to synthesize solutions.
                  </p>
                  
                  <div className="border border-forge-neon/20 bg-forge-neon/5 p-2.5 rounded flex flex-col gap-1.5 font-mono text-[9px]">
                    <span className="text-forge-neon font-bold uppercase flex items-center gap-1">
                      <Shield size={10} /> Hosted API Providers (OpenAI, Anthropic, Gemini, DeepSeek)
                    </span>
                    <ul className="list-disc pl-3.5 space-y-1 text-forge-dim">
                      <li>Prompts, diff contexts, and diagnostics are sent to external provider endpoints.</li>
                      <li>Data is typically governed by commercial zero-data-retention APIs (not used for model training).</li>
                    </ul>
                  </div>

                  <div className="border border-cyan-800/40 bg-cyan-950/10 p-2.5 rounded flex flex-col gap-1.5 font-mono text-[9px]">
                    <span className="text-cyan-400 font-bold uppercase flex items-center gap-1">
                      <FolderOpen size={10} /> Local Offline Operations (Ollama)
                    </span>
                    <ul className="list-disc pl-3.5 space-y-1 text-forge-dim">
                      <li>Your prompt text and workspace contexts are processed 100% locally. Zero telemetry egress.</li>
                      <li>Ideal for sensitive corporate repositories, intellectual property compliance, and offline coding.</li>
                    </ul>
                  </div>

                  <div className="flex items-center gap-2.5 p-2 bg-black/40 border border-forge-dark rounded mt-1">
                    <input
                      type="checkbox"
                      id="zeroEgressWizardCheck"
                      checked={zeroEgressInput}
                      onChange={(e) => setZeroEgressInput(e.target.checked)}
                      className="accent-forge-neon cursor-pointer h-4 w-4 shrink-0"
                    />
                    <label htmlFor="zeroEgressWizardCheck" className="cursor-pointer select-none">
                      <span className="block font-bold text-white uppercase text-[9.5px]">Activate Zero Egress Mode immediately</span>
                      <span className="block text-[8.5px] text-forge-dim">Block all non-Ollama hosted API calls server-side for absolute privacy.</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Step 2: Auto-detect Ollama */}
              {wizardStep === 2 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-forge-neon font-bold text-xs uppercase">
                    <RefreshCw size={12} />
                    <span>Auto-detect Ollama Instance</span>
                  </div>
                  <p className="text-[10px] text-forge-dim leading-relaxed">
                    We will run a local network ping to query the Ollama agent at your specified endpoint URL (<span className="text-forge-neon">{inputOllamaUrl}</span>). Ensure the local Ollama background server is running.
                  </p>

                  <div className="flex flex-col gap-2 border border-forge-dark bg-black/40 p-3 rounded">
                    <div className="flex items-center gap-2">
                      <span className="text-forge-dim uppercase font-bold text-[9px]">Ollama URL:</span>
                      <input
                        type="text"
                        value={inputOllamaUrl}
                        onChange={(e) => setInputOllamaUrl(e.target.value)}
                        placeholder="http://localhost:11434"
                        className="forge-input text-[10.5px] text-forge-neon bg-black border-forge-dark flex-1 px-2 py-1"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={detectOllamaLocal}
                      disabled={detectingOllama}
                      className="forge-btn text-[9px] font-bold py-1.5 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw size={10} className={detectingOllama ? 'animate-spin' : ''} />
                      <span>{detectingOllama ? 'SCANNING LOCALPORT...' : 'PING & SCAN OLLAMA'}</span>
                    </button>
                  </div>

                  <div className="border border-forge-dark bg-black/20 p-2.5 rounded text-[9px] flex flex-col gap-1.5 min-h-[70px]">
                    <span className="text-white uppercase font-bold">Detection Status:</span>
                    <p className={`italic ${wizardOllamaStatus.includes('Online') ? 'text-forge-neon' : 'text-forge-dim'}`}>
                      {wizardOllamaStatus || 'Ping not yet initiated. Trigger Scan above.'}
                    </p>

                    {wizardOllamaModels.length > 0 && (
                      <div className="mt-1 flex flex-col gap-1 border-t border-forge-very-dark pt-1.5">
                        <span className="text-forge-dim uppercase font-bold text-[8.5px]">Detected Models:</span>
                        <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto">
                          {wizardOllamaModels.map((m: any) => (
                            <span 
                              key={m.name} 
                              className="text-[8px] bg-forge-very-dark border border-forge-neon text-forge-neon px-1.5 py-0.5 rounded font-mono"
                            >
                              {m.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Hosted Keys */}
              {wizardStep === 3 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-forge-neon font-bold text-xs uppercase">
                    <Key size={12} />
                    <span>Setup External Hosted API Keys</span>
                  </div>
                  <p className="text-[10px] text-forge-dim leading-relaxed">
                    Optionally input API credentials for hosted AI capabilities. Click PING to check key validity.
                    {zeroEgressInput && (
                      <span className="block text-forge-red font-bold mt-1">
                        ⚠️ NOTE: Zero Egress Mode is active. External models will be saved but blocked from execution.
                      </span>
                    )}
                  </p>

                  <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                    {/* OpenAI key row */}
                    <div className="flex flex-col gap-1 border border-forge-dark p-2 rounded bg-black/30">
                      <div className="flex justify-between items-center text-[9px] uppercase font-bold text-white">
                        <span>OpenAI API Key</span>
                        {openaiStatus === 'online' && <span className="text-forge-neon">[ONLINE]</span>}
                        {openaiStatus === 'error' && <span className="text-forge-red">[FAILED]</span>}
                      </div>
                      <div className="flex gap-1.5 mt-0.5">
                        <input
                          type="password"
                          value={inputOpenaiKey}
                          onChange={(e) => setInputOpenaiKey(e.target.value)}
                          placeholder="sk-proj-..."
                          className="forge-input text-[9.5px] flex-1 bg-black text-forge-neon"
                        />
                        <button
                          type="button"
                          onClick={() => testKey('openai', inputOpenaiKey)}
                          disabled={testingKeys['openai'] || !inputOpenaiKey}
                          className="forge-btn text-[8.5px] px-2.5 font-mono disabled:opacity-40"
                        >
                          PING
                        </button>
                      </div>
                    </div>

                    {/* Anthropic key row */}
                    <div className="flex flex-col gap-1 border border-forge-dark p-2 rounded bg-black/30">
                      <div className="flex justify-between items-center text-[9px] uppercase font-bold text-white">
                        <span>Anthropic API Key</span>
                        {anthropicStatus === 'online' && <span className="text-forge-neon">[ONLINE]</span>}
                        {anthropicStatus === 'error' && <span className="text-forge-red">[FAILED]</span>}
                      </div>
                      <div className="flex gap-1.5 mt-0.5">
                        <input
                          type="password"
                          value={inputAnthropicKey}
                          onChange={(e) => setInputAnthropicKey(e.target.value)}
                          placeholder="sk-ant-..."
                          className="forge-input text-[9.5px] flex-1 bg-black text-forge-neon"
                        />
                        <button
                          type="button"
                          onClick={() => testKey('anthropic', inputAnthropicKey)}
                          disabled={testingKeys['anthropic'] || !inputAnthropicKey}
                          className="forge-btn text-[8.5px] px-2.5 font-mono disabled:opacity-40"
                        >
                          PING
                        </button>
                      </div>
                    </div>

                    {/* Gemini key row */}
                    <div className="flex flex-col gap-1 border border-forge-dark p-2 rounded bg-black/30">
                      <div className="flex justify-between items-center text-[9px] uppercase font-bold text-white">
                        <span>Google Gemini API Key</span>
                        {geminiStatus === 'online' && <span className="text-forge-neon">[ONLINE]</span>}
                        {geminiStatus === 'error' && <span className="text-forge-red">[FAILED]</span>}
                      </div>
                      <div className="flex gap-1.5 mt-0.5">
                        <input
                          type="password"
                          value={inputGeminiKey}
                          onChange={(e) => setInputGeminiKey(e.target.value)}
                          placeholder="AIzaSy..."
                          className="forge-input text-[9.5px] flex-1 bg-black text-forge-neon"
                        />
                        <button
                          type="button"
                          onClick={() => testKey('gemini', inputGeminiKey)}
                          disabled={testingKeys['gemini'] || !inputGeminiKey}
                          className="forge-btn text-[8.5px] px-2.5 font-mono disabled:opacity-40"
                        >
                          PING
                        </button>
                      </div>
                    </div>

                    {/* DeepSeek key row */}
                    <div className="flex flex-col gap-1 border border-forge-dark p-2 rounded bg-black/30">
                      <div className="flex justify-between items-center text-[9px] uppercase font-bold text-white">
                        <span>DeepSeek API Key</span>
                        {deepseekStatus === 'online' && <span className="text-forge-neon">[ONLINE]</span>}
                        {deepseekStatus === 'error' && <span className="text-forge-red">[FAILED]</span>}
                      </div>
                      <div className="flex gap-1.5 mt-0.5">
                        <input
                          type="password"
                          value={inputKey}
                          onChange={(e) => setInputKey(e.target.value)}
                          placeholder="sk-..."
                          className="forge-input text-[9.5px] flex-1 bg-black text-forge-neon"
                        />
                        <button
                          type="button"
                          onClick={() => testKey('deepseek', inputKey)}
                          disabled={testingKeys['deepseek'] || !inputKey}
                          className="forge-btn text-[8.5px] px-2.5 font-mono disabled:opacity-40"
                        >
                          PING
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Mode Recommendation */}
              {wizardStep === 4 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-forge-neon font-bold text-xs uppercase">
                    <BookOpen size={12} />
                    <span>Quality Mode Recommendations</span>
                  </div>
                  <p className="text-[10px] text-forge-dim leading-relaxed">
                    Based on your workspace settings and credentials, here is our recommended model routing:
                  </p>

                  <div className="flex flex-col gap-2 mt-1 font-mono text-[9px]">
                    <div className="border border-forge-dark p-2 rounded bg-black/20 flex flex-col gap-0.5">
                      <span className="text-white font-bold">High-Reasoning Loop (bootstrap, drift, review):</span>
                      <span className="text-forge-neon">Claude 3.5 Sonnet / Gemini 2.5 Pro / DeepSeek V3</span>
                      <span className="text-forge-dim">Avoid local 7B models for these actions due to low complex-reasoning ceilings.</span>
                    </div>

                    <div className="border border-forge-dark p-2 rounded bg-black/20 flex flex-col gap-0.5">
                      <span className="text-white font-bold">Standard Chat & Coding Iterations:</span>
                      <span className="text-forge-neon">DeepSeek Chat / GPT-4o-Mini / Llama 3 (8B)</span>
                      <span className="text-forge-dim">Fast, lightweight, and highly cost-efficient configurations.</span>
                    </div>

                    <div className="border border-forge-dark p-2 rounded bg-black/20 flex flex-col gap-0.5">
                      <span className="text-white font-bold">Local-Only Privacy Setup:</span>
                      <span className="text-cyan-400">qwen2.5-coder:7b / llama3 (local via Ollama)</span>
                      <span className="text-forge-dim">Locks down workspace data. Enforce Zero Egress in the toggle above.</span>
                    </div>
                  </div>

                  <div className="mt-1.5 text-[9.5px] border-t border-forge-very-dark pt-2 text-center text-forge-neon font-bold">
                    [✔ Wizard Setup Complete! Click Finish to apply Settings]
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer Controls */}
            <div className="bg-black/60 border-t border-forge-dark px-4 py-3 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (wizardStep > 1) setWizardStep(wizardStep - 1);
                }}
                disabled={wizardStep === 1}
                className="forge-btn text-[9px] py-1 px-3 disabled:opacity-40 disabled:pointer-events-none"
              >
                BACK
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsWizardOpen(false)}
                  className="px-3 py-1 border border-forge-dark hover:border-forge-red text-forge-dim hover:text-forge-red rounded text-[9px]"
                >
                  CANCEL
                </button>
                {wizardStep < 4 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep(wizardStep + 1)}
                    className="forge-btn text-[9px] py-1 px-3 font-bold"
                  >
                    NEXT
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsWizardOpen(false);
                      onUpdateConfig({
                        apiKey: inputKey,
                        geminiApiKey: inputGeminiKey,
                        openaiApiKey: inputOpenaiKey,
                        anthropicApiKey: inputAnthropicKey,
                        openrouterApiKey: inputOpenrouterKey,
                        ollamaUrl: inputOllamaUrl,
                        zeroEgressMode: zeroEgressInput,
                        privacyMode: privacyInput
                      });
                      onNotify?.('Provider configuration updated successfully.', 'success');
                    }}
                    className="forge-btn text-[9px] py-1 px-3 font-bold border-forge-neon text-forge-neon"
                  >
                    SAVE & FINISH
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* --- COMPANION PAIRING MODAL --- */}
      {isCompanionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono select-none">
          <div className="w-full max-w-sm border border-forge-neon rounded bg-forge-panel-bg p-5 flex flex-col">
            <div className="flex justify-between items-center border-b border-forge-dark pb-2 mb-4">
              <span className="text-xs font-bold text-forge-neon uppercase tracking-wider flex items-center gap-1.5">
                <Smartphone size={14} /> Companion Pairing
              </span>
              <button
                type="button"
                onClick={() => setIsCompanionModalOpen(false)}
                className="text-forge-dim hover:text-white"
              >
                <XCircle size={16} />
              </button>
            </div>

            <div className="flex flex-col items-center gap-4 my-2 text-center">
              <div className="text-[10px] text-forge-dim leading-relaxed">
                Pair your Web or Mobile companion device by entering this 6-digit code on the companion interface:
              </div>

              <div className="bg-forge-very-dark border border-forge-neon bg-opacity-65 text-2xl font-bold tracking-widest text-forge-neon px-6 py-2.5 rounded font-mono select-text shadow-[0_0_15px_rgba(0,255,102,0.15)] animate-pulse">
                {activePairingCode || '------'}
              </div>

              {activePairingSecret && (
                <div className="w-full flex flex-col gap-1 text-left">
                  <span className="text-[9px] text-forge-dim uppercase tracking-wider">Pairing secret (QR handshake)</span>
                  <div className="bg-forge-very-dark border border-forge-dark text-[9px] text-forge-neon px-2 py-1.5 rounded font-mono select-text break-all">
                    {activePairingSecret}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch('http://localhost:3001/api/companion/pairing-code');
                    if (res.ok) {
                      const data = await res.json();
                      if (data.success) {
                        setActivePairingCode(data.code);
                        onNotify?.('New pairing code generated.', 'success');
                      }
                    }
                  } catch (e) {
                    onNotify?.('Failed to generate pairing code.', 'error');
                  }
                }}
                className="forge-btn text-[9px] px-2.5 py-1 flex items-center gap-1"
              >
                <RefreshCw size={10} /> REGENERATE CODE
              </button>
            </div>

            <div className="border-t border-forge-dark pt-3 mt-4 flex flex-col gap-1.5 text-[9px] font-mono text-forge-dim">
              <div className="flex justify-between">
                <span>Active pairing code:</span>
                <span className="text-forge-neon">{activePairingCode ? 'Active' : 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span>Live connections:</span>
                <span className="text-forge-neon font-bold">{companionCount} connected</span>
              </div>
            </div>

            <div className="border-t border-forge-dark pt-3 mt-3 flex flex-col gap-1.5">
              <span className="text-[9px] text-forge-dim uppercase tracking-wider">Paired devices ({pairedDevices.length})</span>
              {pairedDevices.length === 0 ? (
                <span className="text-[9px] text-forge-dim italic">No devices paired yet.</span>
              ) : (
                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                  {pairedDevices.map(device => (
                    <div key={device.deviceId} className="flex justify-between items-center gap-2 bg-forge-very-dark border border-forge-dark rounded px-2 py-1">
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-[9px] text-white truncate">{device.label}</span>
                        <span className="text-[8px] text-forge-dim">Last seen: {new Date(device.lastSeenAt).toLocaleString()}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRevokeDevice(device.deviceId)}
                        className="text-forge-dim hover:text-red-400 shrink-0"
                        title="Revoke device"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-forge-dark pt-3 mt-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsCompanionModalOpen(false)}
                className="forge-btn text-[10px] py-1 px-4 font-bold border-forge-neon text-forge-neon"
              >
                DONE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
