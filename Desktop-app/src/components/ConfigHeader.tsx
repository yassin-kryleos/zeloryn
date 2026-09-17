import React, { useState, useEffect } from 'react';
import { Settings, Key, FolderOpen, Eye, EyeOff, Search, HelpCircle, RefreshCw, Shield, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, Check, BookOpen, Globe, Smartphone, Trash2, Heart, Cpu, Zap, ChevronDown } from 'lucide-react';
import type { ResponseMode } from '../backend/agents';
import { FeatureBadge } from './FeatureBadge';
import { APP_VERSION } from '../version';
import { checkForAppUpdates } from '../shared/updateChecker';
import {
  getDefaultCatalog,
  syncRemoteCatalog,
  autoAssignRoles,
  ROLE_SLOT_DESCRIPTIONS,
  type ModelDefinition,
  type RoleModelMap,
  type RoleSlot,
  type ModelProvider,
  type ActiveKeySet
} from '../shared/modelCatalog';

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
  if (m.includes('opus') || m.includes('gpt-6')) return 'Thinking: Godlike';
  if (m.includes('reasoner') || m.includes('r1')) return 'Thinking: Ultra (Reasoner)';
  if (m.includes('sonnet') || m.includes('gpt-5.6') || m.includes('glm-5.2') || m.includes('pro')) return 'Thinking: High';
  if (m.includes('flash') || m.includes('mini') || m.includes('haiku')) return 'Thinking: Fast';
  return 'Thinking: Standard';
}

interface ConfigHeaderProps {
  apiKey: string;
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  openrouterApiKey: string;
  ollamaUrl: string;
  customApiKey?: string;
  customBaseUrl?: string;
  customProviderName?: string;
  customModels?: string[];
  anthropicBaseUrl?: string;
  openaiBaseUrl?: string;
  geminiBaseUrl?: string;
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
  onUpdateConfig: (data: { 
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
    githubToken?: string;
    githubRepoUrl?: string;
    zeroEgressMode?: boolean;
    privacyMode?: boolean;
    modelRoles?: RoleModelMap;
    customPricing?: Record<string, { input: number; output: number }>;
    syncedCatalog?: ModelDefinition[];
  }) => void;
  fastModel?: string;
  modelRoles?: RoleModelMap;
  customPricing?: Record<string, { input: number; output: number }>;
  syncedCatalog?: ModelDefinition[];
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
  customApiKey = '',
  customBaseUrl = '',
  customProviderName = 'Custom Provider',
  customModels = [],
  anthropicBaseUrl = '',
  openaiBaseUrl = '',
  geminiBaseUrl = '',
  useSearch,
  model,
  fastModel = '',
  modelRoles = { chat: '', reasoning: '', coding: '', review: '', research: '', fast: '' },
  customPricing = {},
  syncedCatalog = [],
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
  const [showKey, setShowKey] = useState<boolean>(false);
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState<boolean>(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState<boolean>(false);
  const [showOpenrouterKey, setShowOpenrouterKey] = useState<boolean>(false);
  const [showGithubToken, setShowGithubToken] = useState<boolean>(false);
  const [showCustomKey, setShowCustomKey] = useState<boolean>(false);

  const [inputKey, setInputKey] = useState<string>(apiKey);
  const [inputGeminiKey, setInputGeminiKey] = useState<string>(geminiApiKey);
  const [inputOpenaiKey, setInputOpenaiKey] = useState<string>(openaiApiKey);
  const [inputAnthropicKey, setInputAnthropicKey] = useState<string>(anthropicApiKey);
  const [inputOpenrouterKey, setInputOpenrouterKey] = useState<string>(openrouterApiKey);
  const [inputOllamaUrl, setInputOllamaUrl] = useState<string>(ollamaUrl);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelOption[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<string>('Ollama not checked');
  const [isLoadingOllamaModels, setIsLoadingOllamaModels] = useState<boolean>(false);
  const [inputCustomKey, setInputCustomKey] = useState<string>(customApiKey);
  const [inputCustomBaseUrl, setInputCustomBaseUrl] = useState<string>(customBaseUrl);
  const [inputCustomProviderName, setInputCustomProviderName] = useState<string>(customProviderName);
  const [inputCustomModels, setInputCustomModels] = useState<string>(customModels ? customModels.join(', ') : '');
  const [detectedCustomModels, setDetectedCustomModels] = useState<string[]>([]);
  const [isLoadingCustomModels, setIsLoadingCustomModels] = useState<boolean>(false);
  const [customStatus, setCustomStatus] = useState<string>('Custom endpoint not checked');

  const [inputAnthropicBaseUrl, setInputAnthropicBaseUrl] = useState<string>(anthropicBaseUrl);
  const [inputOpenaiBaseUrl, setInputOpenaiBaseUrl] = useState<string>(openaiBaseUrl);
  const [inputGeminiBaseUrl, setInputGeminiBaseUrl] = useState<string>(geminiBaseUrl);
  const [showAdvancedBaseUrls, setShowAdvancedBaseUrls] = useState<boolean>(false);
  const [inputGithubToken, setInputGithubToken] = useState<string>(githubToken);
  const [inputGithubRepoUrl, setInputGithubRepoUrl] = useState<string>(githubRepoUrl);

  const [inputUseSearch, setInputUseSearch] = useState<boolean>(useSearch);
  const [inputWorkspace, setInputWorkspace] = useState<string>(workspaceRoot);
  const [showConfigDrawer, setShowConfigDrawer] = useState<boolean>(false);
  const [showEngineStatusPopover, setShowEngineStatusPopover] = useState<boolean>(false);
  const [inputCustomInstructions, setInputCustomInstructions] = useState<string>(customInstructions);
  const [inputResponseMode, setInputResponseMode] = useState<ResponseMode>(responseMode);
  const [inputTheme, setInputTheme] = useState<string>(theme);
  const [activeTab, setActiveTab] = useState<'api_keys' | 'models' | 'workspace' | 'github_sync' | 'account_theme' | 'permissions' | 'agents' | 'artifacts' | 'about'>('api_keys');

  useEffect(() => {
    const handleOpen = (e?: any) => {
      setShowConfigDrawer(true);
      if (e?.detail?.tab) {
        setActiveTab(e.detail.tab);
      }
    };
    window.addEventListener('open-config-drawer', handleOpen);
    return () => window.removeEventListener('open-config-drawer', handleOpen);
  }, []);

  // Model catalog and custom model registration state
  const [showAddCustomModelModal, setShowAddCustomModelModal] = useState<boolean>(false);
  const [newCustomModelId, setNewCustomModelId] = useState<string>('');
  const [newCustomModelProvider, setNewCustomModelProvider] = useState<ModelProvider>('custom');
  const [newCustomModelContext, setNewCustomModelContext] = useState<number>(128000);
  const [newCustomModelInputCost, setNewCustomModelInputCost] = useState<number>(1.0);
  const [newCustomModelOutputCost, setNewCustomModelOutputCost] = useState<number>(3.0);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState<boolean>(false);

  // Update checking state
  const [isCheckingUpdates, setIsCheckingUpdates] = useState<boolean>(false);
  const [updateAvailableVersion, setUpdateAvailableVersion] = useState<string | null>(null);
  const [updateStatusText, setUpdateStatusText] = useState<string | null>(null);

  const handleManualCheckUpdates = async () => {
    setIsCheckingUpdates(true);
    setUpdateStatusText('Checking GitHub releases...');
    try {
      const res = await checkForAppUpdates({ force: true });
      if (res.hasUpdate) {
        setUpdateAvailableVersion(res.latestVersion);
        setUpdateStatusText(`Update available: v${res.latestVersion}`);
        onNotify?.(`Update available: Zeloryn v${res.latestVersion} is available!`, 'info');
      } else if (res.success) {
        setUpdateAvailableVersion(null);
        setUpdateStatusText(`Zeloryn is up to date (v${APP_VERSION}).`);
        onNotify?.(`Zeloryn is up to date (v${APP_VERSION}).`, 'success');
      } else {
        setUpdateStatusText(res.error || 'Could not reach GitHub releases');
        onNotify?.(`Could not check updates: ${res.error || 'Network error'}`, 'warning');
      }
    } catch (err: any) {
      setUpdateStatusText(`Failed: ${err.message}`);
      onNotify?.(`Update check failed: ${err.message}`, 'error');
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  React.useEffect(() => {
    setInputTheme(theme);
  }, [theme]);

  React.useEffect(() => { if (apiKey) setInputKey(apiKey); }, [apiKey]);
  React.useEffect(() => { if (geminiApiKey) setInputGeminiKey(geminiApiKey); }, [geminiApiKey]);
  React.useEffect(() => { if (openaiApiKey) setInputOpenaiKey(openaiApiKey); }, [openaiApiKey]);
  React.useEffect(() => { if (anthropicApiKey) setInputAnthropicKey(anthropicApiKey); }, [anthropicApiKey]);
  React.useEffect(() => { if (openrouterApiKey) setInputOpenrouterKey(openrouterApiKey); }, [openrouterApiKey]);
  React.useEffect(() => { if (ollamaUrl) setInputOllamaUrl(ollamaUrl); }, [ollamaUrl]);
  React.useEffect(() => { if (customApiKey) setInputCustomKey(customApiKey); }, [customApiKey]);
  React.useEffect(() => { if (customBaseUrl) setInputCustomBaseUrl(customBaseUrl); }, [customBaseUrl]);
  React.useEffect(() => { if (customProviderName) setInputCustomProviderName(customProviderName); }, [customProviderName]);
  React.useEffect(() => {
    if (customModels && customModels.length > 0) setInputCustomModels(customModels.join(', '));
  }, [customModels]);
  React.useEffect(() => { if (anthropicBaseUrl) setInputAnthropicBaseUrl(anthropicBaseUrl); }, [anthropicBaseUrl]);
  React.useEffect(() => { if (openaiBaseUrl) setInputOpenaiBaseUrl(openaiBaseUrl); }, [openaiBaseUrl]);
  React.useEffect(() => { if (geminiBaseUrl) setInputGeminiBaseUrl(geminiBaseUrl); }, [geminiBaseUrl]);

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

  const testKey = async (provider: string, apiKeyVal: string, overrideBaseUrl?: string) => {
    setTestingKeys(prev => ({ ...prev, [provider]: true }));
    try {
      let bUrl = overrideBaseUrl;
      if (provider === 'ollama') bUrl = inputOllamaUrl;
      else if (provider === 'anthropic' && inputAnthropicBaseUrl) bUrl = inputAnthropicBaseUrl;
      else if (provider === 'openai' && inputOpenaiBaseUrl) bUrl = inputOpenaiBaseUrl;
      else if (provider === 'gemini' && inputGeminiBaseUrl) bUrl = inputGeminiBaseUrl;
      else if (provider === 'custom') bUrl = inputCustomBaseUrl;

      const res = await fetch('http://localhost:3001/api/providers/health-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          provider, 
          apiKey: apiKeyVal, 
          baseUrl: bUrl,
          providerName: provider === 'custom' ? inputCustomProviderName : undefined
        })
      });
      const data = await res.json();
      const isOnline = res.ok && data.success;
      if (provider === 'deepseek') setDeepseekStatus(isOnline ? 'online' : 'error');
      else if (provider === 'gemini') setGeminiStatus(isOnline ? 'online' : 'error');
      else if (provider === 'openai') setOpenaiStatus(isOnline ? 'online' : 'error');
      else if (provider === 'anthropic') setAnthropicStatus(isOnline ? 'online' : 'error');
      else if (provider === 'openrouter') setOpenrouterStatus(isOnline ? 'online' : 'error');
      else if (provider === 'custom') setCustomStatus(isOnline ? 'online' : 'error');
      
      if (isOnline) {
        onNotify?.(`${(provider === 'custom' ? inputCustomProviderName : provider).toUpperCase()} connection successful!`, 'success');
      } else {
        onNotify?.(providerFailureMessage(provider, data.error), 'error');
      }
    } catch (err: any) {
      if (provider === 'deepseek') setDeepseekStatus('error');
      else if (provider === 'gemini') setGeminiStatus('error');
      else if (provider === 'openai') setOpenaiStatus('error');
      else if (provider === 'anthropic') setAnthropicStatus('error');
      else if (provider === 'openrouter') setOpenrouterStatus('error');
      else if (provider === 'custom') setCustomStatus('error');
      onNotify?.(providerFailureMessage(provider, err.message), 'error');
    } finally {
      setTestingKeys(prev => ({ ...prev, [provider]: false }));
    }
  };

  const detectCustomModels = async () => {
    if (!inputCustomBaseUrl) {
      onNotify?.('Please enter a Base URL for the Custom Provider first.', 'warning');
      return;
    }
    setIsLoadingCustomModels(true);
    setCustomStatus('Querying /v1/models...');
    try {
      const res = await fetch('http://localhost:3001/api/providers/custom/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: inputCustomBaseUrl,
          apiKey: inputCustomKey
        })
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.models) && data.models.length > 0) {
        setDetectedCustomModels(data.models);
        const existing = inputCustomModels.split(',').map(s => s.trim()).filter(Boolean);
        const merged = Array.from(new Set([...existing, ...data.models]));
        setInputCustomModels(merged.join(', '));
        setCustomStatus(`Online! Found ${data.models.length} models.`);
        onNotify?.(`Detected ${data.models.length} custom models from endpoint!`, 'success');
      } else {
        setCustomStatus(data.error ? `Detection error: ${data.error}` : 'No models returned from /v1/models');
        onNotify?.(data.error || 'No models returned from /v1/models endpoint.', 'warning');
      }
    } catch (err: any) {
      setCustomStatus(`Failed: ${err.message}`);
      onNotify?.(`Failed to probe custom models: ${err.message}`, 'error');
    } finally {
      setIsLoadingCustomModels(false);
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
      if (baseUrl && baseUrl.trim()) url.searchParams.set('baseUrl', baseUrl.trim());
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
    if (ollamaUrl) {
      refreshOllamaModels(ollamaUrl);
    }
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

  const selectedDynamicOllamaMissing = (model || '').startsWith('ollama:')
    && !ollamaOptions.some(option => option.value === model);

  const effectiveCustomModels = React.useMemo(() => {
    const list: string[] = [];
    if (customModels && Array.isArray(customModels)) {
      list.push(...customModels);
    }
    if (inputCustomModels) {
      const parsed = inputCustomModels.split(',').map(s => s.trim()).filter(Boolean);
      list.push(...parsed);
    }
    if (detectedCustomModels.length > 0) {
      list.push(...detectedCustomModels);
    }
    return Array.from(new Set(list));
  }, [customModels, inputCustomModels, detectedCustomModels]);

  const activeCatalog: ModelDefinition[] = React.useMemo(() => {
    const base = (syncedCatalog && syncedCatalog.length > 0) ? syncedCatalog : getDefaultCatalog();
    const existingIds = new Set(base.map(m => m.id));
    const merged = [...base];
    for (const cm of effectiveCustomModels) {
      if (!existingIds.has(cm)) {
        merged.push({
          id: cm,
          name: cm,
          provider: 'custom',
          contextWindow: 128000,
          strengths: ['chat', 'coding'],
          supportsTools: true,
          pricing: { input: 1.0, output: 2.0 },
          isCustom: true
        });
        existingIds.add(cm);
      }
    }
    return merged;
  }, [syncedCatalog, effectiveCustomModels]);

  const hasRoleOverrides = Object.values(modelRoles || {}).some(v => v && v !== 'inherit' && v !== '');

  const handleAutoAssign = () => {
    const activeKeys: ActiveKeySet = {
      anthropic: !!anthropicApiKey,
      gemini: !!geminiApiKey,
      openai: !!openaiApiKey,
      ollama: ollamaOptions.length > 0 || !!ollamaUrl,
      custom: !!customApiKey || !!customBaseUrl
    };
    const roster = autoAssignRoles(activeCatalog, activeKeys, model);
    onUpdateConfig({
      model: roster.masterDefault,
      modelRoles: roster.roles
    });
    onNotify?.(`Optimal AI roster assigned based on active keys! (${roster.masterDefault})`, 'success');
  };

  const handleSyncCatalog = async () => {
    if (zeroEgressMode) {
      onNotify?.('Zero Egress Mode active: External catalog sync blocked.', 'warning');
      return;
    }
    setIsSyncingCatalog(true);
    try {
      const result = await syncRemoteCatalog();
      if (result.models.length > 0) {
        onUpdateConfig({ syncedCatalog: result.models });
        onNotify?.(`Model catalog synced! (${result.models.length} models)`, 'success');
      } else {
        onNotify?.(result.error || 'Using local bundled catalog.', 'info');
      }
    } catch (err: any) {
      onNotify?.(`Catalog sync error: ${err?.message}`, 'error');
    } finally {
      setIsSyncingCatalog(false);
    }
  };

  const handleAddCustomModel = () => {
    if (!newCustomModelId || !newCustomModelId.trim()) return;
    const cleanId = newCustomModelId.trim();
    const updatedCustomModels = Array.from(new Set([...effectiveCustomModels, cleanId]));
    const updatedPricing = {
      ...customPricing,
      [cleanId]: { input: newCustomModelInputCost, output: newCustomModelOutputCost }
    };
    onUpdateConfig({
      customModels: updatedCustomModels,
      customPricing: updatedPricing
    });
    setNewCustomModelId('');
    setShowAddCustomModelModal(false);
    onNotify?.(`Registered custom model: ${cleanId}`, 'success');
  };

  const knownStaticModels = [
    'deepseek-v4', 'deepseek-reasoner-v4', 'deepseek-chat', 'deepseek-reasoner',
    'gemini-3.8-flash', 'gemini-3.5-pro', 'gemini-3.5-flash', 'gemini-3.1-pro', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash',
    'gpt-6', 'gpt-5.6', 'gpt-5.5', 'gpt-5.5-mini', 'gpt-4o', 'gpt-4o-mini', 'o3-mini', 'o1',
    'claude-5-sonnet', 'claude-5-opus', 'claude-4.5-sonnet', 'claude-4.5-haiku', 'claude-3-7-sonnet-latest', 'claude-3-5-sonnet-latest',
    'glm-5.2', 'glm-5', 'glm-4-flash',
    'meta-llama/llama-3.3-70b-instruct', 'qwen/qwen-2.5-coder-32b-instruct'
  ];
  const isCustomOrUnknownSelected = Boolean(
    model &&
    !knownStaticModels.includes(model) &&
    !effectiveCustomModels.includes(model) &&
    !model.startsWith('ollama:') &&
    model !== 'llama3' &&
    model !== 'qwen2.5-coder'
  );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const customModelsList = (inputCustomModels || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    onUpdateConfig({
      apiKey: inputKey,
      geminiApiKey: inputGeminiKey,
      openaiApiKey: inputOpenaiKey,
      anthropicApiKey: inputAnthropicKey,
      openrouterApiKey: inputOpenrouterKey,
      ollamaUrl: inputOllamaUrl,
      customApiKey: inputCustomKey,
      customBaseUrl: inputCustomBaseUrl,
      customProviderName: inputCustomProviderName,
      customModels: customModelsList,
      anthropicBaseUrl: inputAnthropicBaseUrl,
      openaiBaseUrl: inputOpenaiBaseUrl,
      geminiBaseUrl: inputGeminiBaseUrl,
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

  const hasCommercialKeys = !!geminiApiKey || !!anthropicApiKey || !!openaiApiKey || !!apiKey || !!openrouterApiKey || !!customApiKey || !!customBaseUrl;
  const showGemini = !hasCommercialKeys || !!geminiApiKey;
  const showAnthropic = !hasCommercialKeys || !!anthropicApiKey;
  const showOpenai = !hasCommercialKeys || !!openaiApiKey;
  const showDeepseek = !hasCommercialKeys || !!apiKey;
  const showCustom = !hasCommercialKeys || !!customApiKey || !!customBaseUrl;
  const showOpenrouter = !hasCommercialKeys || !!openrouterApiKey;
  const showOllama = !hasCommercialKeys || ollamaOptions.length > 0 || !!ollamaUrl;

  return (
    <div className="flex items-center gap-2 font-mono text-xs select-none flex-nowrap justify-end shrink-0">
      
      {/* Model Selector Dropdown */}
      <div className="flex items-center gap-1 border border-forge-dark rounded px-1 py-0.5 bg-black/40 hover:border-forge-neon/40 transition-colors">
        <Cpu size={10} className="text-forge-neon shrink-0" />
        <select
          aria-label="AI model"
          value={model}
          onChange={(e) => {
            if (e.target.value === '__open_config__') {
              setActiveTab('models');
              setShowConfigDrawer(true);
            } else {
              onUpdateConfig({ model: e.target.value });
            }
          }}
          className="bg-transparent border-0 text-[11px] text-forge-text font-mono font-bold outline-none px-1 py-0.5 cursor-pointer"
        >
          {showGemini && (
            <optgroup label="Google Gemini">
              <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
              <option value="gemini-3.5-pro">Gemini 3.5 Pro</option>
              <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
              <option value="gemini-3.1-pro">Gemini 3.1 Pro</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            </optgroup>
          )}
          {showAnthropic && (
            <optgroup label="Anthropic Claude">
              <option value="claude-5-sonnet">Claude 5 Sonnet</option>
              <option value="claude-5-opus">Claude 5 Opus</option>
              <option value="claude-4.5-sonnet">Claude 4.5 Sonnet</option>
              <option value="claude-4.5-haiku">Claude 4.5 Haiku</option>
              <option value="claude-3-7-sonnet-latest">Claude 3.7 Sonnet</option>
              <option value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</option>
            </optgroup>
          )}
          {showOpenai && (
            <optgroup label="OpenAI GPT">
              <option value="gpt-6">GPT-6</option>
              <option value="gpt-5.6">GPT-5.6</option>
              <option value="gpt-5.5">GPT-5.5</option>
              <option value="gpt-5.5-mini">GPT-5.5 Mini</option>
              <option value="o3-mini">o3-mini (Reasoning)</option>
              <option value="o1">o1 (Full Reasoning)</option>
              <option value="gpt-4o">GPT-4o</option>
            </optgroup>
          )}
          {showDeepseek && (
            <optgroup label="DeepSeek">
              <option value="deepseek-v4">DeepSeek V4</option>
              <option value="deepseek-reasoner-v4">DeepSeek Reasoner V4</option>
              <option value="deepseek-chat">DeepSeek Chat V3</option>
              <option value="deepseek-reasoner">DeepSeek Reasoner R1</option>
            </optgroup>
          )}
          {showCustom && (
            <optgroup label="Custom / ZLM / GLM">
              <option value="glm-5.2">GLM-5.2 Flagship</option>
              <option value="glm-5">GLM-5</option>
              <option value="glm-4-flash">GLM-4 Flash</option>
              {effectiveCustomModels.map(m => (
                <option key={`custom-${m}`} value={m}>{m}</option>
              ))}
            </optgroup>
          )}
          {showOpenrouter && (
            <optgroup label="OpenRouter">
              <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B</option>
              <option value="qwen/qwen-2.5-coder-32b-instruct">Qwen 2.5 Coder 32B</option>
            </optgroup>
          )}
          {showOllama && (
            <optgroup label="Local (Ollama)">
              {selectedDynamicOllamaMissing && (
                <option value={model}>{model.replace('ollama:', '')} (selected)</option>
              )}
              {ollamaOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </optgroup>
          )}
          {isCustomOrUnknownSelected && (
            <optgroup label="Custom / Active Model">
              <option value={model}>{model} (active)</option>
            </optgroup>
          )}
          <optgroup label="Configuration">
            <option value="__open_config__">⚙ Manage Models & Endpoints...</option>
          </optgroup>
        </select>
      </div>

      {hasRoleOverrides && (
        <button
          type="button"
          onClick={() => {
            setShowConfigDrawer(true);
            setActiveTab('models');
          }}
          className="px-1.5 py-0.5 bg-forge-neon/15 border border-forge-neon/40 text-forge-neon text-[9px] font-mono rounded cursor-pointer hover:bg-forge-neon/25 transition-all"
          title="Specialized model roles active across agents (Chat, Reasoning, Coding, etc.)"
        >
          ROLES ACTIVE
        </button>
      )}

      {/* Fast Model Selector Dropdown (Phase 9b: Cost-aware routing) */}
      <div className="flex items-center gap-1 border border-forge-dark rounded px-1 py-0.5 bg-black/40 hover:border-forge-cyan/40 transition-colors" title="Fast Model override for triage, Scope Guard review, and diff checks">
        <Zap size={10} className="text-forge-cyan shrink-0" />
        <select
          aria-label="Fast AI model"
          value={fastModel}
          onChange={(e) => onUpdateConfig({ fastModel: e.target.value })}
          className="bg-transparent border-0 text-[11px] text-forge-cyan font-mono font-bold outline-none px-1 py-0.5 cursor-pointer"
        >
          <option value="">Fast Model: (Default / Same)</option>
          {showGemini && (
            <optgroup label="Google Gemini">
              <option value="gemini-3.8-flash">Fast: Gemini 3.8 Flash</option>
              <option value="gemini-3.5-flash">Fast: Gemini 3.5 Flash</option>
              <option value="gemini-2.5-flash">Fast: Gemini 2.5 Flash</option>
            </optgroup>
          )}
          {showAnthropic && (
            <optgroup label="Anthropic Claude">
              <option value="claude-4.5-haiku">Fast: Claude 4.5 Haiku</option>
              <option value="claude-3-5-haiku-latest">Fast: Claude 3.5 Haiku</option>
            </optgroup>
          )}
          {showOpenai && (
            <optgroup label="OpenAI GPT">
              <option value="gpt-5.5-mini">Fast: GPT-5.5 Mini</option>
              <option value="gpt-4o-mini">Fast: GPT-4o Mini</option>
              <option value="o3-mini">Fast: o3-mini</option>
            </optgroup>
          )}
          {showCustom && (
            <optgroup label="Custom / ZLM / GLM">
              <option value="glm-4-flash">Fast: GLM-4 Flash</option>
              {effectiveCustomModels.map(m => (
                <option key={`fast-custom-${m}`} value={m}>Fast: {m}</option>
              ))}
            </optgroup>
          )}
          {showDeepseek && (
            <optgroup label="DeepSeek">
              <option value="deepseek-chat">Fast: DeepSeek Chat V3</option>
            </optgroup>
          )}
          {showOllama && (
            <optgroup label="Local (Ollama)">
              {ollamaOptions.map(option => (
                <option key={`fast-${option.value}`} value={option.value}>Fast: {option.label}</option>
              ))}
            </optgroup>
          )}
          {fastModel && !['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'claude-4.5-haiku', 'claude-3-5-haiku-latest', 'gpt-5.5-mini', 'gpt-4o-mini', 'o3-mini', 'glm-4-flash', 'deepseek-chat'].includes(fastModel) && (
            <option value={fastModel}>Fast: {fastModel}</option>
          )}
        </select>
      </div>

      {/* Consolidated Engine Status Pill with Popover */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowEngineStatusPopover(!showEngineStatusPopover)}
          className="flex items-center gap-1.5 border border-forge-dark bg-black/40 hover:border-forge-neon/40 px-2 py-1 rounded text-[10.5px] font-mono cursor-pointer transition-all"
          title="Engine status, reasoning capability & connected devices"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-forge-red'}`} />
          <span className={`font-bold ${isConnected ? 'text-forge-text' : 'text-red-400'}`}>
            {isConnected ? (zeroEgressMode || privacyMode || model.startsWith('ollama:') || model === 'llama3' || model === 'qwen2.5-coder' ? 'Local' : 'Connected') : 'Offline'}
          </span>
          <span className="text-[8.5px] bg-forge-dark text-forge-text px-1 rounded uppercase font-bold">
            {thinkingCapability}
          </span>
          {companionCount > 0 && (
            <span className="text-[8.5px] text-cyan-400 font-bold">+{companionCount}</span>
          )}
          <ChevronDown size={10} className="text-forge-dim" />
        </button>

        {showEngineStatusPopover && (
          <div className="absolute right-0 top-full mt-1.5 w-64 bg-forge-panel-bg border border-forge-neon shadow-2xl rounded-md p-3 z-50 flex flex-col gap-2.5 font-mono text-[10px] backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-forge-dark pb-1.5">
              <span className="font-bold text-forge-neon uppercase text-[10px]">Engine Status</span>
              <button
                type="button"
                onClick={() => setShowEngineStatusPopover(false)}
                className="text-forge-dim hover:text-white text-[10px] bg-transparent border-0 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Connection Info */}
            <div className="flex items-center justify-between">
              <span className="text-forge-dim">Backend:</span>
              <span className={`font-bold ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                {isConnected ? '127.0.0.1:3001 (Online)' : 'Disconnected'}
              </span>
            </div>

            {/* Environment / Egress */}
            <div className="flex items-center justify-between">
              <span className="text-forge-dim">Environment:</span>
              <span className="font-bold text-forge-text">
                {zeroEgressMode ? 'Zero-Egress (Local)' : privacyMode ? 'Privacy Mode' : 'Cloud / Hybrid'}
              </span>
            </div>

            {/* Baseline Heuristic */}
            <div className="flex items-center justify-between">
              <span className="text-forge-dim">Model Baseline:</span>
              <span className="text-forge-neon font-bold">{getThinkingLevel(model)}</span>
            </div>

            {/* Thinking Capability Selector */}
            <div className="flex flex-col gap-1 pt-1 border-t border-forge-dark">
              <span className="text-forge-dim">Thinking Capability:</span>
              <div className="flex gap-1 bg-black/40 border border-forge-dark rounded p-0.5">
                {(['low', 'medium', 'high', 'ultra'] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => onUpdateConfig({ thinkingCapability: level })}
                    className={`flex-1 py-0.5 text-[9px] uppercase font-bold rounded cursor-pointer ${
                      thinkingCapability === level
                        ? 'bg-forge-neon text-forge-very-dark'
                        : 'text-forge-dim hover:text-white bg-transparent'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Companion Devices */}
            <div className="pt-1 border-t border-forge-dark flex items-center justify-between">
              <span className="text-forge-dim">Companion:</span>
              <button
                type="button"
                onClick={() => {
                  setShowEngineStatusPopover(false);
                  setIsCompanionModalOpen(true);
                }}
                className="text-forge-neon hover:underline text-[9.5px] cursor-pointer bg-transparent border-0"
              >
                {companionCount} connected · Manage
              </button>
            </div>

            {/* Guide link */}
            <div className="pt-1 border-t border-forge-dark">
              <button
                type="button"
                onClick={() => {
                  setShowEngineStatusPopover(false);
                  onOpenGuide();
                }}
                className="w-full text-center py-1 rounded bg-black/40 border border-forge-dark hover:border-forge-neon text-forge-text hover:text-forge-neon text-[9.5px] cursor-pointer"
              >
                Open Walkthrough Guide
              </button>
            </div>
          </div>
        )}
      </div>

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
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm font-mono select-none">
          <form
            onSubmit={handleSave}
            className="forge-panel w-full max-w-3xl h-[650px] max-h-[90vh] bg-forge-very-dark border border-forge-neon flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-forge-dark px-4 py-2.5 shrink-0 bg-forge-very-dark">
              <span className="text-xs font-bold font-header text-forge-neon uppercase tracking-wider flex items-center gap-2">
                <Settings size={13} className="text-forge-neon" />
                <span>Zeloryn Configuration</span>
              </span>
              <button
                type="button"
                onClick={() => setShowConfigDrawer(false)}
                className="text-forge-neon hover:text-white font-mono text-xs px-1.5 py-0.5 rounded hover:bg-forge-dark/50"
              >
                [X]
              </button>
            </div>

            {/* Split layout: Sidebar navigation + Content panel */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Navigation Sidebar */}
              <div className="w-44 shrink-0 border-r border-forge-dark bg-black/25 p-2 flex flex-col gap-1 overflow-y-auto select-none text-[10px] font-mono">
                <div className="text-[8.5px] font-bold uppercase tracking-wider text-forge-dim px-2 py-1">
                  Preferences
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('api_keys')}
                  className={`w-full px-2.5 py-1.5 rounded text-left transition-all cursor-pointer flex items-center gap-2 ${
                    activeTab === 'api_keys'
                      ? 'bg-forge-very-dark text-forge-neon border border-forge-neon/60 font-bold shadow-sm'
                      : 'text-forge-dim hover:text-forge-text hover:bg-forge-dark/30 border border-transparent'
                  }`}
                >
                  <Key size={12} aria-hidden="true" className="shrink-0 text-amber-400" />
                  <span className="truncate">API Keys</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('models')}
                  className={`w-full px-2.5 py-1.5 rounded text-left transition-all cursor-pointer flex items-center justify-between gap-1 ${
                    activeTab === 'models'
                      ? 'bg-forge-very-dark text-forge-neon border border-forge-neon/60 font-bold shadow-sm'
                      : 'text-forge-dim hover:text-forge-text hover:bg-forge-dark/30 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Cpu size={12} aria-hidden="true" className="shrink-0 text-cyan-400" />
                    <span className="truncate">Models & Roles</span>
                  </div>
                  {hasRoleOverrides && (
                    <span className="w-1.5 h-1.5 rounded-full bg-forge-neon shrink-0" title="Roles active" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('workspace')}
                  className={`w-full px-2.5 py-1.5 rounded text-left transition-all cursor-pointer flex items-center gap-2 ${
                    activeTab === 'workspace'
                      ? 'bg-forge-very-dark text-forge-neon border border-forge-neon/60 font-bold shadow-sm'
                      : 'text-forge-dim hover:text-forge-text hover:bg-forge-dark/30 border border-transparent'
                  }`}
                >
                  <FolderOpen size={12} aria-hidden="true" className="shrink-0 text-blue-400" />
                  <span className="truncate">Directory</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('github_sync')}
                  className={`w-full px-2.5 py-1.5 rounded text-left transition-all cursor-pointer flex items-center gap-2 ${
                    activeTab === 'github_sync'
                      ? 'bg-forge-very-dark text-forge-neon border border-forge-neon/60 font-bold shadow-sm'
                      : 'text-forge-dim hover:text-forge-text hover:bg-forge-dark/30 border border-transparent'
                  }`}
                >
                  <RefreshCw size={12} aria-hidden="true" className="shrink-0 text-purple-400" />
                  <span className="truncate">Syncs</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('permissions')}
                  className={`w-full px-2.5 py-1.5 rounded text-left transition-all cursor-pointer flex items-center gap-2 ${
                    activeTab === 'permissions'
                      ? 'bg-forge-very-dark text-forge-neon border border-forge-neon/60 font-bold shadow-sm'
                      : 'text-forge-dim hover:text-forge-text hover:bg-forge-dark/30 border border-transparent'
                  }`}
                >
                  <Shield size={12} aria-hidden="true" className="shrink-0 text-emerald-400" />
                  <span className="truncate">Security</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('agents')}
                  className={`w-full px-2.5 py-1.5 rounded text-left transition-all cursor-pointer flex items-center gap-2 ${
                    activeTab === 'agents'
                      ? 'bg-forge-very-dark text-forge-neon border border-forge-neon/60 font-bold shadow-sm'
                      : 'text-forge-dim hover:text-forge-text hover:bg-forge-dark/30 border border-transparent'
                  }`}
                >
                  <Globe size={12} aria-hidden="true" className="shrink-0 text-pink-400" />
                  <span className="truncate">Specialists</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('artifacts')}
                  className={`w-full px-2.5 py-1.5 rounded text-left transition-all cursor-pointer flex items-center gap-2 ${
                    activeTab === 'artifacts'
                      ? 'bg-forge-very-dark text-forge-neon border border-forge-neon/60 font-bold shadow-sm'
                      : 'text-forge-dim hover:text-forge-text hover:bg-forge-dark/30 border border-transparent'
                  }`}
                >
                  <BookOpen size={12} aria-hidden="true" className="shrink-0 text-orange-400" />
                  <span className="truncate">Artifacts</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('account_theme')}
                  className={`w-full px-2.5 py-1.5 rounded text-left transition-all cursor-pointer flex items-center gap-2 ${
                    activeTab === 'account_theme'
                      ? 'bg-forge-very-dark text-forge-neon border border-forge-neon/60 font-bold shadow-sm'
                      : 'text-forge-dim hover:text-forge-text hover:bg-forge-dark/30 border border-transparent'
                  }`}
                >
                  <Zap size={12} aria-hidden="true" className="shrink-0 text-forge-neon" />
                  <span className="truncate">Theme</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('about')}
                  className={`w-full px-2.5 py-1.5 rounded text-left transition-all cursor-pointer flex items-center gap-2 ${
                    activeTab === 'about'
                      ? 'bg-forge-very-dark text-forge-neon border border-forge-neon/60 font-bold shadow-sm'
                      : 'text-forge-dim hover:text-forge-text hover:bg-forge-dark/30 border border-transparent'
                  }`}
                >
                  <HelpCircle size={12} aria-hidden="true" className="shrink-0 text-teal-400" />
                  <span className="truncate">About</span>
                </button>

                <div className="mt-auto pt-2 border-t border-forge-dark/60">
                  <div className="text-[8px] font-bold text-forge-dim px-2 py-0.5">
                    Zeloryn v{APP_VERSION}
                  </div>
                  <div className="text-[7.5px] text-forge-neon px-2">
                    Copyleft GPL-3.0
                  </div>
                </div>
              </div>

              {/* Right Content Panel */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 font-mono">
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

                  {/* Custom / OpenAI-Compatible Provider (ZLM / GLM / vLLM / Local) */}
                  <div className="flex flex-col gap-1.5 border border-forge-dark bg-black bg-opacity-40 p-2.5 rounded">
                    <label className="text-[10px] uppercase text-forge-dim flex items-center justify-between font-bold w-full font-mono">
                      <span className="flex items-center gap-1.5 text-forge-neon">
                        <Globe size={11} />
                        <span>Custom / OpenAI-Compatible (ZLM / GLM / vLLM)</span>
                      </span>
                      <div className="flex items-center gap-1.5 text-[9px] font-mono">
                        {customStatus.includes('Online') || customStatus === 'online' ? (
                          <span className="text-forge-neon flex items-center gap-0.5"><CheckCircle2 size={10} /> Online</span>
                        ) : customStatus === 'error' ? (
                          <span className="text-forge-red flex items-center gap-0.5"><XCircle size={10} /> Error</span>
                        ) : (
                          <span className="text-forge-dim text-[8.5px]">{customStatus}</span>
                        )}
                      </div>
                    </label>

                    <div className="grid grid-cols-2 gap-2 font-mono">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[8.5px] text-forge-dim uppercase">Provider Label</span>
                        <input
                          type="text"
                          value={inputCustomProviderName}
                          onChange={(e) => setInputCustomProviderName(e.target.value)}
                          placeholder="e.g. Zhipu GLM / vLLM"
                          className="forge-input text-[10px] text-forge-text bg-black border-forge-dark px-1.5 py-1"
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[8.5px] text-forge-dim uppercase">Base URL (OpenAI-Compatible)</span>
                        <input
                          type="text"
                          value={inputCustomBaseUrl}
                          onChange={(e) => setInputCustomBaseUrl(e.target.value)}
                          placeholder="https://open.bigmodel.cn/api/paas/v4 or http://localhost:8000/v1"
                          className="forge-input text-[10px] text-forge-neon bg-black border-forge-dark px-1.5 py-1"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-0.5 font-mono">
                      <span className="text-[8.5px] text-forge-dim uppercase">API Key (Optional for local servers)</span>
                      <div className="flex gap-1.5 items-center">
                        <div className="relative flex items-center flex-1">
                          <input
                            type={showCustomKey ? 'text' : 'password'}
                            value={inputCustomKey}
                            onChange={(e) => setInputCustomKey(e.target.value)}
                            placeholder="sk-... or api key if required"
                            className="forge-input w-full pr-8 text-[10px] text-forge-neon bg-black border-forge-dark py-1"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCustomKey(!showCustomKey)}
                            className="absolute right-2 text-forge-dim hover:text-forge-neon"
                          >
                            {showCustomKey ? <EyeOff size={11} /> : <Eye size={11} />}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => testKey('custom', inputCustomKey)}
                          disabled={testingKeys['custom'] || !inputCustomBaseUrl}
                          className="forge-btn text-[9px] px-2.5 py-1 font-bold font-mono shrink-0 disabled:opacity-40"
                        >
                          {testingKeys['custom'] ? 'TESTING...' : 'TEST'}
                        </button>
                        <button
                          type="button"
                          onClick={detectCustomModels}
                          disabled={isLoadingCustomModels || !inputCustomBaseUrl}
                          className="forge-btn text-[9px] px-2.5 py-1 font-bold font-mono shrink-0 disabled:opacity-40 flex items-center gap-1"
                          title="Auto-discover models from /v1/models"
                        >
                          <RefreshCw size={9} className={isLoadingCustomModels ? 'animate-spin' : ''} />
                          <span>DETECT MODELS</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-0.5 font-mono">
                      <span className="text-[8.5px] text-forge-dim uppercase">Configured Models (comma-separated IDs)</span>
                      <input
                        type="text"
                        value={inputCustomModels}
                        onChange={(e) => setInputCustomModels(e.target.value)}
                        placeholder="e.g. glm-4-plus, glm-4-flash, custom-model-1"
                        className="forge-input text-[10px] text-forge-cyan bg-black border-forge-dark px-1.5 py-1"
                      />
                      <span className="text-[8px] text-forge-dim">
                        Models configured here will appear in the top-bar Model selector under {inputCustomProviderName || 'Custom Provider'}.
                      </span>
                    </div>
                  </div>

                  {/* Advanced Base URL Overrides (for Free-Claude, One-API, and custom proxies) */}
                  <div className="flex flex-col gap-1 border border-forge-dark bg-black bg-opacity-30 p-2 rounded">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedBaseUrls(!showAdvancedBaseUrls)}
                      className="text-[9.5px] uppercase font-bold text-forge-dim hover:text-forge-neon flex items-center justify-between font-mono w-full text-left"
                    >
                      <span className="flex items-center gap-1.5">
                        <Settings size={10} />
                        <span>Advanced: Proxy Base URL Overrides (Free-Claude, Reverse Proxies)</span>
                      </span>
                      <span className="text-[9px] text-forge-neon">
                        {showAdvancedBaseUrls ? '▲ HIDE' : '▼ SHOW'}
                      </span>
                    </button>
                    {showAdvancedBaseUrls && (
                      <div className="flex flex-col gap-2 pt-1 font-mono">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[8.5px] text-forge-dim uppercase">Anthropic Base URL (e.g. Free-Claude http://localhost:8000)</span>
                          <input
                            type="text"
                            value={inputAnthropicBaseUrl}
                            onChange={(e) => setInputAnthropicBaseUrl(e.target.value)}
                            placeholder="https://api.anthropic.com or http://localhost:8000"
                            className="forge-input text-[10px] text-forge-text bg-black border-forge-dark px-1.5 py-0.5"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[8.5px] text-forge-dim uppercase">OpenAI Base URL (e.g. proxy gateway)</span>
                          <input
                            type="text"
                            value={inputOpenaiBaseUrl}
                            onChange={(e) => setInputOpenaiBaseUrl(e.target.value)}
                            placeholder="https://api.openai.com"
                            className="forge-input text-[10px] text-forge-text bg-black border-forge-dark px-1.5 py-0.5"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[8.5px] text-forge-dim uppercase">Google Gemini Base URL</span>
                          <input
                            type="text"
                            value={inputGeminiBaseUrl}
                            onChange={(e) => setInputGeminiBaseUrl(e.target.value)}
                            placeholder="https://generativelanguage.googleapis.com"
                            className="forge-input text-[10px] text-forge-text bg-black border-forge-dark px-1.5 py-0.5"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Task recommendation tips */}
                  <div className="border border-forge-dark bg-black bg-opacity-30 p-2 rounded text-[9px] font-mono text-forge-dim flex flex-col gap-1 mt-1">
                    <span className="text-white uppercase font-bold text-[9.5px]">MODEL TIPS & RECOMMENDATIONS:</span>
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

              {activeTab === 'models' && (
                <div className="flex flex-col gap-3">
                  {/* Top Action Header */}
                  <div className="bg-forge-darker p-2.5 rounded border border-forge-dark flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-mono font-bold text-forge-neon flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-forge-neon" />
                        <span>AI MODEL ROSTER & ROLE SPECIALIZATION</span>
                      </div>
                      <div className="text-[9px] text-forge-dim font-mono mt-0.5">
                        Assign specialized models to specific tasks, or auto-assign optimal slots across your connected providers.
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      <button
                        type="button"
                        onClick={handleAutoAssign}
                        className="px-2.5 py-1 bg-forge-neon text-black font-mono font-bold text-[10px] rounded hover:bg-forge-neon/80 transition-all cursor-pointer flex items-center gap-1"
                        title="Auto-detect active API keys and assign the optimal model to each role"
                      >
                        <span>Auto-Assign Roles</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSyncCatalog}
                        disabled={isSyncingCatalog}
                        className="px-2 py-1 bg-forge-dark text-forge-cyan font-mono text-[10px] rounded hover:bg-forge-very-dark border border-forge-cyan/40 transition-all cursor-pointer flex items-center gap-1 disabled:opacity-50"
                        title="Fetch latest Q3 2026 model definitions and pricing from GitHub"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSyncingCatalog ? 'animate-spin' : ''}`} />
                        <span>Sync Catalog</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddCustomModelModal(!showAddCustomModelModal)}
                        className="px-2 py-1 bg-forge-dark text-forge-text font-mono text-[10px] rounded hover:bg-forge-very-dark border border-forge-dark transition-all cursor-pointer"
                      >
                        {showAddCustomModelModal ? 'Close' : '+ Add Model'}
                      </button>
                    </div>
                  </div>

                  {/* Add Custom Model Subform */}
                  {showAddCustomModelModal && (
                    <div className="bg-forge-very-dark p-3 rounded border border-forge-neon/50 flex flex-col gap-2 font-mono">
                      <div className="text-[10px] font-bold text-forge-neon">REGISTER UNLISTED / PROPRIETARY MODEL</div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <label className="text-forge-dim block mb-0.5">Model ID / Name</label>
                          <input
                            type="text"
                            placeholder="e.g. glm-5.2, custom:my-llama"
                            value={newCustomModelId}
                            onChange={(e) => setNewCustomModelId(e.target.value)}
                            className="w-full bg-forge-dark border border-forge-dark p-1 rounded text-forge-text text-[10px]"
                          />
                        </div>
                        <div>
                          <label className="text-forge-dim block mb-0.5">Provider Route</label>
                          <select
                            value={newCustomModelProvider}
                            onChange={(e) => setNewCustomModelProvider(e.target.value as any)}
                            className="w-full bg-forge-dark border border-forge-dark p-1 rounded text-forge-text text-[10px]"
                          >
                            <option value="custom">Custom / OpenAI-Compatible</option>
                            <option value="ollama">Ollama (Local)</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="gemini">Google Gemini</option>
                            <option value="openai">OpenAI</option>
                            <option value="deepseek">DeepSeek</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-forge-dim block mb-0.5">Input Price ($ / 1M tokens)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={newCustomModelInputCost}
                            onChange={(e) => setNewCustomModelInputCost(parseFloat(e.target.value) || 0)}
                            className="w-full bg-forge-dark border border-forge-dark p-1 rounded text-forge-text text-[10px]"
                          />
                        </div>
                        <div>
                          <label className="text-forge-dim block mb-0.5">Output Price ($ / 1M tokens)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={newCustomModelOutputCost}
                            onChange={(e) => setNewCustomModelOutputCost(parseFloat(e.target.value) || 0)}
                            className="w-full bg-forge-dark border border-forge-dark p-1 rounded text-forge-text text-[10px]"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 mt-1">
                        <button
                          type="button"
                          onClick={handleAddCustomModel}
                          disabled={!newCustomModelId || !newCustomModelId.trim()}
                          className="px-3 py-1 bg-forge-neon text-black font-mono font-bold text-[10px] rounded hover:bg-forge-neon/80 disabled:opacity-50 cursor-pointer"
                        >
                          Save & Register
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Master Default Model Card */}
                  <div className="bg-forge-darker p-2.5 rounded border border-forge-dark flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-mono font-bold text-forge-text flex items-center gap-1.5">
                        <span>⭐ Master Default Model</span>
                      </label>
                      <span className="text-[9px] text-forge-dim font-mono">Used for all unassigned roles</span>
                    </div>
                    <select
                      value={model}
                      onChange={(e) => onUpdateConfig({ model: e.target.value })}
                      className="w-full bg-forge-very-dark border border-forge-dark p-1 rounded text-[11px] text-forge-text font-mono cursor-pointer"
                    >
                      <optgroup label="Google Gemini">
                        <option value="gemini-3.8-flash">Gemini 3.8 Flash (1M ctx)</option>
                        <option value="gemini-3.5-pro">Gemini 3.5 Pro (2M ctx)</option>
                        <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                        <option value="gemini-3.1-pro">Gemini 3.1 Pro</option>
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                      </optgroup>
                      <optgroup label="Anthropic Claude">
                        <option value="claude-5-sonnet">Claude 5 Sonnet (200k ctx)</option>
                        <option value="claude-5-opus">Claude 5 Opus</option>
                        <option value="claude-4.5-sonnet">Claude 4.5 Sonnet</option>
                        <option value="claude-4.5-haiku">Claude 4.5 Haiku</option>
                        <option value="claude-3-7-sonnet-latest">Claude 3.7 Sonnet</option>
                        <option value="claude-3-5-sonnet-latest">Claude 3.5 Sonnet</option>
                      </optgroup>
                      <optgroup label="OpenAI GPT">
                        <option value="gpt-6">GPT-6 (256k ctx)</option>
                        <option value="gpt-5.6">GPT-5.6</option>
                        <option value="gpt-5.5">GPT-5.5</option>
                        <option value="gpt-5.5-mini">GPT-5.5 Mini</option>
                        <option value="o3-mini">o3-mini (Reasoning)</option>
                        <option value="o1">o1 (Reasoning)</option>
                        <option value="gpt-4o">GPT-4o</option>
                      </optgroup>
                      <optgroup label="DeepSeek">
                        <option value="deepseek-v4">DeepSeek V4 (128k ctx)</option>
                        <option value="deepseek-reasoner-v4">DeepSeek Reasoner V4</option>
                        <option value="deepseek-chat">DeepSeek Chat V3</option>
                        <option value="deepseek-reasoner">DeepSeek Reasoner R1</option>
                      </optgroup>
                      <optgroup label="Custom / ZLM / GLM">
                        <option value="glm-5.2">GLM-5.2 Flagship</option>
                        <option value="glm-5">GLM-5</option>
                        <option value="glm-4-flash">GLM-4 Flash</option>
                        {effectiveCustomModels.map(m => (
                          <option key={`master-custom-${m}`} value={m}>{m}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Local (Ollama)">
                        {ollamaOptions.map(option => (
                          <option key={`master-${option.value}`} value={option.value}>{option.label}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {/* Role Specialization Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(['chat', 'reasoning', 'coding', 'review', 'research', 'fast'] as RoleSlot[]).map((slotKey) => {
                      const slotMeta = ROLE_SLOT_DESCRIPTIONS[slotKey];
                      const assignedModelId = modelRoles[slotKey] || '';
                      const effectiveModelId = assignedModelId || model;
                      const modelDef = activeCatalog.find(m => m.id.toLowerCase() === effectiveModelId.toLowerCase());

                      return (
                        <div key={slotKey} className="bg-forge-darker p-2.5 rounded border border-forge-dark flex flex-col gap-1.5 font-mono">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-forge-cyan flex items-center gap-1">
                              <span>{slotMeta.icon}</span>
                              <span>{slotMeta.label}</span>
                            </span>
                            {assignedModelId ? (
                              <button
                                type="button"
                                onClick={() => onUpdateConfig({ modelRoles: { ...modelRoles, [slotKey]: '' } })}
                                className="text-[8px] text-forge-dim hover:text-forge-neon cursor-pointer underline"
                              >
                                Reset to Default
                              </button>
                            ) : (
                              <span className="text-[8px] text-forge-dim">Inheriting Default</span>
                            )}
                          </div>
                          <div className="text-[9px] text-forge-dim line-clamp-1">
                            {slotMeta.desc}
                          </div>
                          <select
                            value={assignedModelId}
                            onChange={(e) => onUpdateConfig({ modelRoles: { ...modelRoles, [slotKey]: e.target.value } })}
                            className="w-full bg-forge-very-dark border border-forge-dark p-1 rounded text-[10px] text-forge-text font-mono cursor-pointer"
                          >
                            <option value="">(Inherit Master Default: {model})</option>
                            <optgroup label="Google Gemini">
                              <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
                              <option value="gemini-3.5-pro">Gemini 3.5 Pro</option>
                              <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                            </optgroup>
                            <optgroup label="Anthropic Claude">
                              <option value="claude-5-sonnet">Claude 5 Sonnet</option>
                              <option value="claude-5-opus">Claude 5 Opus</option>
                              <option value="claude-4.5-sonnet">Claude 4.5 Sonnet</option>
                              <option value="claude-4.5-haiku">Claude 4.5 Haiku</option>
                            </optgroup>
                            <optgroup label="OpenAI GPT">
                              <option value="gpt-6">GPT-6</option>
                              <option value="gpt-5.6">GPT-5.6</option>
                              <option value="gpt-5.5">GPT-5.5</option>
                              <option value="gpt-5.5-mini">GPT-5.5 Mini</option>
                              <option value="o3-mini">o3-mini (Reasoning)</option>
                            </optgroup>
                            <optgroup label="DeepSeek">
                              <option value="deepseek-v4">DeepSeek V4</option>
                              <option value="deepseek-reasoner-v4">DeepSeek Reasoner V4</option>
                              <option value="deepseek-chat">DeepSeek Chat V3</option>
                            </optgroup>
                            <optgroup label="Custom / ZLM / GLM">
                              <option value="glm-5.2">GLM-5.2 Flagship</option>
                              <option value="glm-5">GLM-5</option>
                              <option value="glm-4-flash">GLM-4 Flash</option>
                              {effectiveCustomModels.map(m => (
                                <option key={`role-${slotKey}-${m}`} value={m}>{m}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Local (Ollama)">
                              {ollamaOptions.map(option => (
                                <option key={`role-${slotKey}-${option.value}`} value={option.value}>{option.label}</option>
                              ))}
                            </optgroup>
                          </select>
                          {modelDef && (
                            <div className="flex items-center justify-between text-[8px] text-forge-dim pt-0.5">
                              <span>
                                ${modelDef.pricing.input.toFixed(2)} / ${modelDef.pricing.output.toFixed(2)} per 1M
                              </span>
                              <div className="flex items-center gap-1">
                                {modelDef.reasoningOnly && (
                                  <span className="px-1 bg-purple-900/40 text-purple-300 border border-purple-700/50 rounded">
                                    XML Tool
                                  </span>
                                )}
                                {slotKey === 'research' && modelDef.contextWindow < 32000 && (
                                  <span className="px-1 bg-amber-900/40 text-amber-300 border border-amber-700/50 rounded">
                                    Small Ctx
                                  </span>
                                )}
                                <span>{(modelDef.contextWindow / 1000).toFixed(0)}k ctx</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
                  <span>WebSocket Telemetry</span>
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

            {onStartCollabSession && (
              <div className="border border-forge-dark bg-black bg-opacity-30 p-2.5 rounded flex flex-col gap-1.5 font-mono text-[9px]">
                <div className="flex justify-between items-center">
                  <span className="text-forge-neon font-bold uppercase text-[9.5px]">📡 WebRTC Workspace Collab</span>
                  <span className={collabActive ? "text-forge-neon font-bold animate-pulse" : "text-forge-dim"}>
                    {collabActive ? "ACTIVE ROOM" : "OFFLINE"}
                  </span>
                </div>
                <p className="text-[8px] text-forge-dim">Direct peer-to-peer workspace session sharing across devices on the same local network.</p>
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

            {/* Theme configuration */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase text-forge-dim flex items-center gap-1.5 font-bold">
                <span>Console Theme Stylesheet</span>
              </label>
              <div className="flex gap-1 bg-forge-very-dark border border-forge-dark rounded p-0.5">
                {['dark', 'light'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setInputTheme(t);
                      document.body.className = `theme-${t}`;
                      try {
                        localStorage.setItem('matrix_theme', t);
                      } catch {
                        // ignore
                      }
                      if (onUpdateConfig) {
                        onUpdateConfig({ theme: t });
                      }
                    }}
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
                Dark (default) and Light workstation palettes based on Zeloryn design identity.
              </span>
            </div>

            {/* App Version & Update Checker */}
            <div className="flex flex-col gap-1.5 border border-forge-dark bg-black/40 p-2.5 rounded font-mono text-[9px] mt-1">
              <div className="flex items-center justify-between">
                <span className="text-forge-neon font-bold uppercase text-[9.5px] flex items-center gap-1.5">
                  <RefreshCw size={11} className={isCheckingUpdates ? 'animate-spin text-forge-neon' : 'text-forge-dim'} />
                  <span>Zeloryn Version: v{APP_VERSION}</span>
                </span>
                <span className={`text-[8px] border px-1.5 py-0.5 rounded font-bold ${
                  updateAvailableVersion
                    ? 'bg-amber-950 text-amber-300 border-amber-500/50 animate-pulse'
                    : 'bg-forge-very-dark text-forge-dim border-forge-dark'
                }`}>
                  {updateAvailableVersion ? `v${updateAvailableVersion} AVAILABLE` : 'STABLE RELEASE'}
                </span>
              </div>
              <span className="text-forge-dim text-[8.5px]">
                {updateStatusText || 'Check GitHub for the latest updates, enhancements, and security fixes.'}
              </span>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={handleManualCheckUpdates}
                  disabled={isCheckingUpdates}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-forge-very-dark hover:bg-forge-dark text-forge-neon border border-forge-neon/40 rounded text-[9px] font-bold cursor-pointer transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={10} className={isCheckingUpdates ? 'animate-spin' : ''} />
                  <span>{isCheckingUpdates ? 'Checking Releases...' : 'Check for Updates'}</span>
                </button>
                {updateAvailableVersion && (
                  <button
                    type="button"
                    onClick={() => {
                      const url = 'https://github.com/yassin-kryleos/zeloryn/releases/latest';
                      if ((window as any).electronAPI?.openExternal) {
                        (window as any).electronAPI.openExternal(url);
                      } else {
                        window.open(url, '_blank');
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded text-[9px] font-bold cursor-pointer transition-colors"
                  >
                    <span>Download v{updateAvailableVersion}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Open Source & Community Section */}
            <div className="flex flex-col gap-1.5 border border-forge-dark bg-black/40 p-2.5 rounded font-mono text-[9px] mt-1">
              <div className="flex items-center justify-between">
                <span className="text-forge-neon font-bold uppercase text-[9.5px] flex items-center gap-1.5">
                  <Globe size={11} className="text-forge-neon" />
                  <span>Free & Open Source</span>
                </span>
                <span className="text-[8px] bg-forge-very-dark text-forge-neon border border-forge-neon/40 px-1.5 py-0.5 rounded font-bold">GPL-3.0</span>
              </div>
              <span className="text-forge-dim text-[8.5px]">
                Zeloryn is copyleft open source. Contribute code, report issues, or star the project on GitHub!
              </span>
              <div className="flex flex-wrap gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    const url = 'https://github.com/yassin-kryleos/zeloryn';
                    if ((window as any).electronAPI?.openExternal) {
                      (window as any).electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-forge-very-dark hover:bg-forge-dark text-forge-text border border-forge-dark hover:border-forge-neon rounded text-[9px] font-bold cursor-pointer transition-colors"
                >
                  <Globe size={10} />
                  <span>GitHub Repository</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const url = 'https://github.com/yassin-kryleos/zeloryn/issues';
                    if ((window as any).electronAPI?.openExternal) {
                      (window as any).electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-forge-very-dark hover:bg-forge-dark text-forge-text border border-forge-dark hover:border-forge-neon rounded text-[9px] font-bold cursor-pointer transition-colors"
                >
                  <BookOpen size={10} />
                  <span>Issues & Bugs</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const url = 'https://github.com/yassin-kryleos/zeloryn/blob/main/CONTRIBUTING.md';
                    if ((window as any).electronAPI?.openExternal) {
                      (window as any).electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-forge-very-dark hover:bg-forge-dark text-forge-text border border-forge-dark hover:border-forge-neon rounded text-[9px] font-bold cursor-pointer transition-colors"
                >
                  <Heart size={10} />
                  <span>Contributing Guide</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'about' && (
          <div className="flex flex-col gap-3">
            <div className="text-[9px] text-forge-dim uppercase font-bold flex items-center justify-between border-b border-forge-dark pb-1 mb-1 font-mono">
              <span>About Zeloryn • Copyleft Free Software</span>
              <span className="text-[8px] bg-forge-very-dark text-forge-neon border border-forge-neon/40 px-1.5 py-0.5 rounded font-bold">GPL-3.0</span>
            </div>

            <div className="p-3.5 rounded border border-forge-dark bg-black/40 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe size={16} className="text-forge-neon" />
                  <span className="text-sm font-bold text-white">Zeloryn</span>
                  <span className="text-xs text-forge-neon font-mono font-bold">v{APP_VERSION}</span>
                </div>
                <span className="text-[8px] bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-mono font-bold">
                  LOCAL-FIRST AGENT WORKSPACE
                </span>
              </div>
              <p className="text-[10px] text-forge-dim leading-relaxed">
                Zeloryn is a free, copyleft open-source agentic development environment built for pair-programming developers. Designed for complete local sovereignty, zero-telemetry privacy, and unified multi-engine orchestration.
              </p>
            </div>

            {/* Version & Release Checker */}
            <div className="flex flex-col gap-1.5 border border-forge-dark bg-black/40 p-3 rounded font-mono text-[9px]">
              <div className="flex items-center justify-between">
                <span className="text-forge-neon font-bold uppercase text-[9.5px] flex items-center gap-1.5">
                  <RefreshCw size={11} className={isCheckingUpdates ? 'animate-spin text-forge-neon' : 'text-forge-dim'} />
                  <span>Release Channel</span>
                </span>
                <span className={`text-[8px] border px-1.5 py-0.5 rounded font-bold ${
                  updateAvailableVersion
                    ? 'bg-amber-950 text-amber-300 border-amber-500/50 animate-pulse'
                    : 'bg-forge-very-dark text-forge-dim border-forge-dark'
                }`}>
                  {updateAvailableVersion ? `v${updateAvailableVersion} AVAILABLE` : 'STABLE RELEASE'}
                </span>
              </div>
              <span className="text-forge-dim text-[8.5px]">
                {updateStatusText || 'Check GitHub for the latest releases, bug fixes, and security patches.'}
              </span>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={handleManualCheckUpdates}
                  disabled={isCheckingUpdates}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-forge-very-dark hover:bg-forge-dark text-forge-neon border border-forge-neon/40 rounded text-[9px] font-bold cursor-pointer transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={10} className={isCheckingUpdates ? 'animate-spin' : ''} />
                  <span>{isCheckingUpdates ? 'Checking Releases...' : 'Check for Updates'}</span>
                </button>
                {updateAvailableVersion && (
                  <button
                    type="button"
                    onClick={() => {
                      const url = 'https://github.com/yassin-kryleos/zeloryn/releases/latest';
                      if ((window as any).electronAPI?.openExternal) {
                        (window as any).electronAPI.openExternal(url);
                      } else {
                        window.open(url, '_blank');
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded text-[9px] font-bold cursor-pointer transition-colors"
                  >
                    <span>Download v{updateAvailableVersion}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Community Links */}
            <div className="flex flex-col gap-1.5 border border-forge-dark bg-black/40 p-3 rounded font-mono text-[9px]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-forge-neon font-bold uppercase text-[9.5px] flex items-center gap-1.5">
                  <Globe size={11} className="text-forge-neon" />
                  <span>Free & Open Source</span>
                </span>
                <span className="text-[8px] bg-forge-very-dark text-forge-neon border border-forge-neon/40 px-1.5 py-0.5 rounded font-bold">GPL-3.0</span>
              </div>
              <p className="text-forge-dim text-[8.5px] mb-2 leading-relaxed">
                Zeloryn is governed by the GNU General Public License v3.0. Contributions from developers worldwide are welcomed and encouraged!
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const url = 'https://github.com/yassin-kryleos/zeloryn';
                    if ((window as any).electronAPI?.openExternal) {
                      (window as any).electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-forge-very-dark hover:bg-forge-dark text-forge-text border border-forge-dark hover:border-forge-neon rounded text-[9px] font-bold cursor-pointer transition-colors"
                >
                  <Globe size={10} />
                  <span>GitHub Repository</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const url = 'https://github.com/yassin-kryleos/zeloryn/issues';
                    if ((window as any).electronAPI?.openExternal) {
                      (window as any).electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-forge-very-dark hover:bg-forge-dark text-forge-text border border-forge-dark hover:border-forge-neon rounded text-[9px] font-bold cursor-pointer transition-colors"
                >
                  <BookOpen size={10} />
                  <span>Issues & Bugs</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const url = 'https://github.com/yassin-kryleos/zeloryn/blob/main/CONTRIBUTING.md';
                    if ((window as any).electronAPI?.openExternal) {
                      (window as any).electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-forge-very-dark hover:bg-forge-dark text-forge-text border border-forge-dark hover:border-forge-neon rounded text-[9px] font-bold cursor-pointer transition-colors"
                >
                  <Heart size={10} />
                  <span>Contributing Guide</span>
                </button>
              </div>
            </div>
          </div>
        )}

              </div>
            </div>

            {/* Save Buttons Footer */}
            <div className="flex justify-between items-center gap-3 border-t border-forge-dark px-4 py-2.5 shrink-0 bg-forge-very-dark">
              <button
                type="button"
                onClick={wipeLocalData}
                className="px-2.5 py-1 border border-red-900 text-red-400 hover:text-white hover:bg-red-950/40 rounded text-[9.5px] font-mono transition-colors"
                title="Workspace files and .kryleos folders are preserved"
              >
                CLEAR CREDENTIALS + LOCAL APP DATA
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfigDrawer(false)}
                  className="px-3 py-1 border border-forge-dark text-forge-dim hover:text-forge-neon rounded text-[10px] font-mono transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="forge-btn text-[10px] font-bold py-1 px-3.5"
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
                    Zeloryn utilizes advanced LLM providers. Depending on your configuration, source code snippets, prompt directions, and compiler/linter error messages may be transmitted to external model servers to synthesize solutions.
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

            <div className="border-t border-forge-dark pt-3 mt-3 flex flex-col gap-1.5 text-[9px] font-mono text-left">
              <span className="text-forge-dim uppercase tracking-wider font-bold">Backend URL Configuration:</span>
              <div className="bg-forge-very-dark border border-forge-dark rounded p-2 text-forge-dim flex flex-col gap-1">
                <div><span className="text-forge-neon font-semibold">LAN:</span> http://&lt;desktop-ip&gt;:3001 (Local Wi-Fi)</div>
                <div><span className="text-forge-neon font-semibold">Tailscale:</span> http://100.x.y.z:3001 (Zero-cost mesh VPN)</div>
                <div><span className="text-forge-neon font-semibold">Cloudflare:</span> https://your-tunnel.domain.com</div>
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
