import { API_BASE_URL } from '../api/client';
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
      await fetch(`${API_BASE_URL}/workspace/command-policy`, {
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
      const res = await fetch(`${API_BASE_URL}/workspace/semantic-cache/rebuild`, {
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
      const res = await fetch(`${API_BASE_URL}/companion/devices`);
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
      const res = await fetch(`${API_BASE_URL}/companion/devices/${deviceId}`, { method: 'DELETE' });
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
        const res = await fetch(`${API_BASE_URL}/companion/status`);
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

      const res = await fetch(`${API_BASE_URL}/providers/health-check`, {
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
      const res = await fetch(`${API_BASE_URL}/providers/custom/models`, {
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
      const res = await fetch(`${API_BASE_URL}/providers/detect?baseUrl=${encodeURIComponent(inputOllamaUrl)}`);
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
      const res = await fetch(`${API_BASE_URL}/local-data`, { method: 'DELETE' });
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
      const response = await fetch(`${API_BASE_URL}/google/auth-url`);
      const data = await response.json() as any;
      if (data.url) {
        window.open(data.url, '_blank');
        onNotify?.('Google link flow opened in your browser.', 'info');
        let count = 0;
        const interval = setInterval(async () => {
          count++;
          const res = await fetch(`${API_BASE_URL}/google/status`);
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
      const res = await fetch(`${API_BASE_URL}/google/sync`, { method: 'POST' });
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
      const url = new URL(`${API_BASE_URL}/ollama/models`);
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
      fetch(`${API_BASE_URL}/git/remote`, {
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
      <div className="flex items-center gap-1 border border-forge-dark rounded px-1 py-0.5 bg-black/40 hover:border-forge-neon/40 transition-colors max-w-[150px] sm:max-w-[190px]">
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
          className="bg-transparent border-0 text-[11px] text-forge-text font-mono font-bold outline-none px-1 py-0.5 cursor-pointer max-w-[125px] sm:max-w-[165px] truncate"
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
      <div className="flex items-center gap-1 border border-forge-dark rounded px-1 py-0.5 bg-black/40 hover:border-forge-cyan/40 transition-colors max-w-[150px] sm:max-w-[190px]" title="Fast Model override for triage, Scope Guard review, and diff checks">
        <Zap size={10} className="text-forge-cyan shrink-0" />
        <select
          aria-label="Fast AI model"
          value={fastModel}
          onChange={(e) => onUpdateConfig({ fastModel: e.target.value })}
          className="bg-transparent border-0 text-[11px] text-forge-cyan font-mono font-bold outline-none px-1 py-0.5 cursor-pointer max-w-[125px] sm:max-w-[165px] truncate"
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

    </div>
  );
};

// Note: SettingsDrawer was extracted to SettingsDrawer.tsx
