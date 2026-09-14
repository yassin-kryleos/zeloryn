import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { 
  StyleSheet, Text, View, ScrollView, TextInput, 
  TouchableOpacity, SafeAreaView, Alert as RNAlert, Modal,
  View as RNView, Text as RNText, Vibration,
  KeyboardAvoidingView, Platform, BackHandler
} from 'react-native';

declare const require: any;

type FeatureStatus = 'production' | 'preview' | 'simulator' | 'mock' | 'planned';

const FEATURE_STATUS_LABELS: Record<FeatureStatus, string> = {
  production: 'Production',
  preview: 'Preview',
  simulator: 'Simulator',
  mock: 'Mock',
  planned: 'Planned',
};

const FEATURE_STATUS_COLORS: Record<FeatureStatus, { color: string; borderColor: string; backgroundColor: string }> = {
  production: { color: '#00ff66', borderColor: '#00ff66', backgroundColor: '#001103' },
  preview: { color: '#67e8f9', borderColor: '#67e8f9', backgroundColor: '#031013' },
  simulator: { color: '#fbbf24', borderColor: '#fbbf24', backgroundColor: '#171002' },
  mock: { color: '#f472b6', borderColor: '#f472b6', backgroundColor: '#160712' },
  planned: { color: '#c4b5fd', borderColor: '#c4b5fd', backgroundColor: '#120b1f' },
};

import { redactSensitiveData } from './src/utils/redact';
import { generateDeviceKeypair, buildSignedMessage, signMessage, generateNonce, verifyDesktopSignature, type DeviceKeypair } from './src/utils/deviceIdentity';

const TOAST_COLORS = {
  success: '#34d399',
  error: '#fca5a5',
  warning: '#fde68a',
  info: '#e2e8f0',
} as const;

const TOAST_ICONS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
} as const;

type TabKey = 'dashboard' | 'plan' | 'chat' | 'tasks' | 'settings';

const TABS: ReadonlyArray<{ key: TabKey; icon: string; label: string }> = [
  { key: 'dashboard', icon: '📊', label: 'Dashboard' },
  { key: 'plan', icon: '📋', label: 'Plan' },
  { key: 'chat', icon: '💬', label: 'Chat' },
  { key: 'tasks', icon: '✓', label: 'Tasks' },
  { key: 'settings', icon: '⚙️', label: 'Settings' },
];

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <RNView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#09090b', padding: 32 }}>
          <RNText style={{ color: '#ff3333', fontFamily: 'monospace', fontSize: 18, marginBottom: 12 }}>⚠ RENDER ERROR</RNText>
          <RNText style={{ color: '#a1a1aa', fontFamily: 'monospace', fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </RNText>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false, error: null })}
            style={{ backgroundColor: '#00ff66', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 4 }}
          >
            <RNText style={{ color: '#09090b', fontFamily: 'monospace', fontWeight: 'bold' }}>RELOAD</RNText>
          </TouchableOpacity>
        </RNView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  // Shared Settings
  const [apiKey, setApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  type ToastSeverity = 'success' | 'error' | 'warning' | 'info';
  type AlertButton = { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' };

  const [toast, setToast] = useState<{ message: string; type: ToastSeverity } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: ToastSeverity = 'info') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // Lightweight notification API. Severity is passed explicitly by the caller —
  // never inferred from the message text — so toasts are always labelled correctly.
  // `notify` shows an in-app toast; `confirm` opens the native multi-button dialog.
  const notify = (type: ToastSeverity, message: string) => showToast(message, type);
  const confirm = (title: string, message: string, buttons: AlertButton[]) =>
    RNAlert.alert(title, message, buttons);

  const styles = useMemo(() => getStyles(theme), [theme]);
  const colors = useMemo(() => THEMES[theme as keyof typeof THEMES] || THEMES.forge, [theme]);

  function StatusBadge({ status, label }: { status: FeatureStatus; label?: string }) {
    return (
      <RNText style={[styles.statusBadge, FEATURE_STATUS_COLORS[status]]}>
        {(label || FEATURE_STATUS_LABELS[status]).toUpperCase()}
      </RNText>
    );
  }
  const [customInstructions, setCustomInstructions] = useState('');
  const [responseMode, setResponseMode] = useState<'balanced' | 'concise' | 'critical' | 'brutal_audit'>('balanced');
  const [backendUrl, setBackendUrl] = useState('http://localhost:3001');
  const [isSyncEnabled, setIsSyncEnabled] = useState(false);

  // Offline Scoping Queue States
  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueue, setOfflineQueue] = useState<Array<{ text: string; timestamp: string }>>([]);

  // Telemetry Statistics
  const [bytesSent, setBytesSent] = useState(14850);
  const [bytesReceived, setBytesReceived] = useState(45290);

  // PII compliance filter state
  const [piiFilterEnabled, setPiiFilterEnabled] = useState(false);

  // Telemetry Dashboard status
  const [serverOnline, setServerOnline] = useState(true);
  const [activeSpecialist, setActiveSpecialist] = useState<'Builder' | 'Analyst' | 'Reviewer' | 'Idle'>('Idle');
  const [tokenCount, setTokenCount] = useState(24580);
  const [estimatedCost, setEstimatedCost] = useState(0.049);
  
  // Interactive Lists
  const [tasks, setTasks] = useState([
    { id: 1, text: 'Define remote database model', status: 'completed', lastModified: new Date().toISOString() },
    { id: 2, text: 'Implement mobile auth socket hooks', status: 'progress', lastModified: new Date().toISOString() },
    { id: 3, text: 'Configure local storage wrappers', status: 'pending', lastModified: new Date().toISOString() },
    { id: 4, text: 'Run compilation tests', status: 'pending', lastModified: new Date().toISOString() }
  ]);

  // Messages lists
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: 'Mobile companion channel established. Query local sessions or monitor execution.' }
  ]);
  const [voiceTarget, setVoiceTarget] = useState<'chat' | 'plan' | null>(null);

  const [planInput, setPlanInput] = useState('');
  const [planMessages, setPlanMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: 'Architect planning module active. Suggest specs to generate implementation checklists.' }
  ]);

  const [planDraft, setPlanDraft] = useState(
    `# Mobile Scoping Plan\n\n- [ ] Design custom authentication forms\n- [x] Configure socket client bindings\n- [/] Integrate layout tabs`
  );

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [pendingApprovalCommand, setPendingApprovalCommand] = useState('npm run test -- --watchAll=false');
  const [pendingApprovalCommandId, setPendingApprovalCommandId] = useState<string | null>(null);
  const [pendingApprovalSessionId, setPendingApprovalSessionId] = useState<string | null>(null);
  const [semanticCacheEnabled, setSemanticCacheEnabled] = useState(false);
  const [selfHealingEnabled, setSelfHealingEnabled] = useState(false);
  const [rbacEnabled, setRbacEnabled] = useState(false);

  const [pairingCode, setPairingCode] = useState('');
  const [pairingSecret, setPairingSecret] = useState('');
  // Phase 5.3: signed-message identity. Persisted only for the app session —
  // a restart re-pairs via pairing code + secret. Cross-restart persistence
  // (expo-secure-store) is a follow-up; not needed for LAN/Tailscale use.
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [desktopPublicKey, setDesktopPublicKey] = useState<string | null>(null);
  const deviceIdRef = useRef<string>(`mobile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const deviceKeypairRef = useRef<DeviceKeypair | null>(null);
  // Mirrors `desktopPublicKey` for the long-lived ws.onmessage closure below,
  // which would otherwise see a stale (pre-pairing) value of the state.
  const desktopPublicKeyRef = useRef<string | null>(null);
  const [companionStatus, setCompanionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [navOpen, setNavOpen] = useState(false);
  const [desktopLogs, setDesktopLogs] = useState<any[]>([]);
  // Phase 5.7: live session feed (P5.5's session_update broadcast) and real
  // process telemetry (replaces the removed fake cpu/memory interval).
  const [latestTrace, setLatestTrace] = useState<any | null>(null);
  const [liveCpuLoad, setLiveCpuLoad] = useState<number | null>(null);
  const [liveMemoryUsage, setLiveMemoryUsage] = useState<number | null>(null);
  const [pendingApprovalDestructive, setPendingApprovalDestructive] = useState(false);
  const [destructiveConfirmed, setDestructiveConfirmed] = useState(false);
  const [voiceQueue, setVoiceQueue] = useState<Array<{
    id: string;
    timestamp: string;
    duration: string;
    size: string;
    transcription: string;
    status: 'ready' | 'syncing' | 'synced';
  }>>([
    {
      id: 'v_1',
      timestamp: new Date(Date.now() - 3600000).toLocaleTimeString(),
      duration: '0:14',
      size: '28 KB',
      transcription: 'Simulated voice note: Add security scanner middleware to express server',
      status: 'ready'
    },
    {
      id: 'v_2',
      timestamp: new Date(Date.now() - 1200000).toLocaleTimeString(),
      duration: '0:32',
      size: '64 KB',
      transcription: 'Simulated voice note: Implement command approval hooks in companion client',
      status: 'ready'
    }
  ]);

  const companionWsRef = useRef<WebSocket | null>(null);

  const connectCompanion = (code: string) => {
    if (!code) return;
    if (companionWsRef.current) {
      companionWsRef.current.close();
    }
    setCompanionStatus('connecting');

    // Phase 5.3: a previously-paired device reconnects with its deviceToken
    // instead of the short-lived pairing code.
    const wsUrl = deviceToken
      ? getWsUrl() + `/api/companion/ws?deviceToken=${deviceToken}`
      : getWsUrl() + `/api/companion/ws?code=${code}`;
    const ws = new WebSocket(wsUrl);
    companionWsRef.current = (ws as any);

    ws.onopen = async () => {
      setCompanionStatus('connected');
      setIsOnline(true);
      setServerOnline(true);

      // First-time pairing: exchange our public key for a deviceToken so
      // future remote actions can be signed and verified by the desktop.
      if (!deviceToken && pairingSecret) {
        if (!deviceKeypairRef.current) {
          deviceKeypairRef.current = await generateDeviceKeypair();
        }
        ws.send(JSON.stringify({
          type: 'PAIR_DEVICE',
          deviceId: deviceIdRef.current,
          publicKey: deviceKeypairRef.current.publicKey,
          label: `${Platform.OS} companion`,
          pairingSecret
        }));
      }

      // Auto-sync offline scoping requests if any exist
      if (offlineQueue.length > 0) {
        let notesText = '';
        offlineQueue.forEach(item => {
          notesText += `\n- ${item.text}`;
        });
        ws.send(JSON.stringify({
          type: 'SYNC_PLANNING_NOTES',
          notes: notesText
        }));
        
        let additionalSpec = '';
        offlineQueue.forEach(item => {
          additionalSpec += `\n- [ ] Implemented (Synced): ${item.text}`;
        });
        setPlanDraft(prev => prev + additionalSpec);
        setOfflineQueue([]);
        notify('success', 'Synchronized queued offline scoping requests to desktop.');
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connection_status' && data.status === 'paired') {
          setCompanionStatus('connected');
        } else if (data.type === 'device_paired') {
          setDeviceToken(data.deviceToken);
          setDesktopPublicKey(data.desktopPublicKey);
          desktopPublicKeyRef.current = data.desktopPublicKey;
          notify('success', 'Device paired. Remote approvals are now signed.');
        } else if (data.type === 'command_approval_required') {
          // Verify this request was actually signed by the paired desktop's
          // RSA key before surfacing it — otherwise a forged
          // command_approval_required (e.g. from a malicious LAN peer) could
          // prompt the user to approve an arbitrary command.
          if (desktopPublicKeyRef.current) {
            const sessionId = data.sessionId || 'global_session';
            const payload = `${sessionId}:command_approval_required:${data.commandId}`;
            if (!verifyDesktopSignature(desktopPublicKeyRef.current, payload, data.signature || '')) {
              console.warn('Rejected command_approval_required with invalid desktop signature.');
              return;
            }
          }
          setPendingApprovalCommand(data.command);
          setPendingApprovalCommandId(data.commandId);
          setPendingApprovalSessionId(data.sessionId || 'global_session');
          setPendingApprovalDestructive(!!data.destructive);
          setDestructiveConfirmed(false);
          setShowApprovalModal(true);
          Vibration.vibrate([0, 500, 200, 300]); // Vibrate on command approval request
        } else if (data.type === 'update' || data.type === 'session_update') {
          if (data.logs) {
            setDesktopLogs(data.logs);
          }
          if (data.activeAgent) {
            setActiveSpecialist(data.activeAgent === 'system' ? 'Idle' : data.activeAgent);
          }
          if (data.latestTrace) {
            setLatestTrace(data.latestTrace);
          }
          if (data.checklist) {
            const mapped = data.checklist.map((taskText: string, index: number) => {
              let status = 'pending';
              let text = taskText;
              if (taskText.startsWith('[x]')) {
                status = 'completed';
                text = taskText.substring(3).trim();
              } else if (taskText.startsWith('[/]')) {
                status = 'progress';
                text = taskText.substring(3).trim();
              } else if (taskText.startsWith('[ ]')) {
                status = 'pending';
                text = taskText.substring(3).trim();
              }
              return { id: index + 1, text, status, lastModified: new Date().toISOString() };
            });
            if (mapped.length > 0) {
              setTasks(mapped);
            }
          }
          if (data.tasks) {
            const statusMap: Record<string, string> = { done: 'completed', in_progress: 'progress', todo: 'pending' };
            setTasks(data.tasks.map((t: any, index: number) => ({
              id: t.id ?? index + 1,
              text: t.title ?? t.text,
              status: statusMap[t.status] ?? t.status ?? 'pending',
              lastModified: t.lastModified ?? new Date().toISOString()
            })));
          }
        } else if (data.type === 'telemetry_stream') {
          if (typeof data.cpuLoad === 'number') setLiveCpuLoad(data.cpuLoad);
          if (typeof data.memoryUsage === 'number') setLiveMemoryUsage(data.memoryUsage);
        } else if (data.type === 'command_status') {
          notify('info', `Command execution ${data.status}.`);
          if (data.commandId === pendingApprovalCommandId) {
            setShowApprovalModal(false);
          }
        } else if (data.type === 'workflow_status') {
          notify('info', data.message || `Workflow ${data.status}`);
        } else if (data.type === 'error') {
          notify('error', data.message || 'Companion connection error.');
          setCompanionStatus('error');
        }
      } catch (err: any) {
        console.error('Error parsing companion message:', err);
      }
    };

    ws.onclose = () => {
      setCompanionStatus('disconnected');
      companionWsRef.current = null;
    };

    ws.onerror = () => {
      setCompanionStatus('error');
      notify('error', `Desktop host not found at ${backendUrl}. Start Forge, use its LAN/Tailscale address (not localhost), then reconnect.`);
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

  // Phase 5.3: once paired (deviceToken set), every state-changing companion
  // message carries a fresh-nonce Ed25519 signature over
  // `${deviceId}:${type}:${itemId}:${nonce}` so companionHub can verify it
  // against our registered public key. Pre-pairing (legacy code-only
  // connections), companionHub doesn't require a signature, so this returns
  // an empty object and the message is sent unsigned as before.
  const signedExtras = async (type: string, itemId: string): Promise<{ signature?: string; nonce?: string }> => {
    if (!deviceToken || !deviceKeypairRef.current) return {};
    const nonce = generateNonce();
    const message = buildSignedMessage(deviceIdRef.current, type, itemId, nonce);
    const signature = await signMessage(deviceKeypairRef.current.privateKey, message);
    return { signature, nonce };
  };

  const approveCommandRemote = async () => {
    if (companionWsRef.current && (companionWsRef.current as any).readyState === WebSocket.OPEN) {
      const extras = await signedExtras('APPROVE_COMMAND', pendingApprovalCommandId || '');
      companionWsRef.current.send(JSON.stringify({
        type: 'APPROVE_COMMAND',
        sessionId: pendingApprovalSessionId,
        commandId: pendingApprovalCommandId,
        ...extras
      }));
      setShowApprovalModal(false);
    } else {
      notify('error', 'Connection lost — cannot approve command while offline.');
    }
  };

  const rejectCommandRemote = async () => {
    if (companionWsRef.current && (companionWsRef.current as any).readyState === WebSocket.OPEN) {
      const extras = await signedExtras('REJECT_COMMAND', pendingApprovalCommandId || '');
      companionWsRef.current.send(JSON.stringify({
        type: 'REJECT_COMMAND',
        sessionId: pendingApprovalSessionId,
        commandId: pendingApprovalCommandId,
        ...extras
      }));
      setShowApprovalModal(false);
    } else {
      notify('error', 'Connection lost — cannot reject command while offline.');
    }
  };

  const stopWorkflowRemote = async () => {
    if (companionWsRef.current && (companionWsRef.current as any).readyState === WebSocket.OPEN) {
      const targetSession = pendingApprovalSessionId || 'global_session';
      const extras = await signedExtras('STOP_WORKFLOW', targetSession);
      companionWsRef.current.send(JSON.stringify({
        type: 'STOP_WORKFLOW',
        sessionId: targetSession,
        ...extras
      }));
      notify('info', 'Workflow stop request dispatched remotely.');
    } else {
      notify('error', 'Connection lost — cannot stop workflow while offline.');
    }
  };

  // Phase 5.7: launch a FORGE run for a plan item from the phone. Requires a
  // paired+signed device — companionHub rejects unsigned START_FORGE_RUN.
  const launchForgeRun = async (planItemId: string) => {
    if (!(companionWsRef.current && (companionWsRef.current as any).readyState === WebSocket.OPEN)) {
      notify('error', 'Connection lost — cannot launch run while offline.');
      return;
    }
    if (!deviceToken || !deviceKeypairRef.current) {
      notify('error', 'Pair this device with the desktop (Settings) before launching runs remotely.');
      return;
    }
    const extras = await signedExtras('START_FORGE_RUN', planItemId);
    companionWsRef.current.send(JSON.stringify({
      type: 'START_FORGE_RUN',
      sessionId: 'global_session',
      planItemId,
      ...extras
    }));
    notify('info', `FORGE run requested for "${planItemId}".`);
  };

  const addVoiceNoteAttachment = () => {
    const id = `v_${Date.now()}`;
    const transcripts = [
      'Add security scanner middleware to express server',
      'Implement remote stop actions in mobile WebSocket',
      'Optimize Ollie models local context paths',
      'Configure zero egress firewall bounds'
    ];
    const transcript = 'Simulated voice note: ' + transcripts[Math.floor(Math.random() * transcripts.length)];
    const durationSec = Math.floor(10 + Math.random() * 50);
    const sizeKb = Math.floor(durationSec * 2);
    
    const newVoice = {
      id,
      timestamp: new Date().toLocaleTimeString(),
      duration: `0:${durationSec < 10 ? '0' + durationSec : durationSec}`,
      size: `${sizeKb} KB`,
      transcription: transcript,
      status: 'ready' as const
    };
    
    setVoiceQueue(prev => [...prev, newVoice]);
    notify('success', 'Simulated voice scoping attachment added to queue.');
  };

  const syncVoiceNote = (id: string) => {
    const note = voiceQueue.find(v => v.id === id);
    if (!note) return;
    
    if (companionWsRef.current && (companionWsRef.current as any).readyState === WebSocket.OPEN) {
      setVoiceQueue(prev => prev.map(v => v.id === id ? { ...v, status: 'syncing' } : v));
      companionWsRef.current.send(JSON.stringify({
        type: 'SYNC_PLANNING_NOTES',
        notes: note.transcription
      }));
      setTimeout(() => {
        setVoiceQueue(prev => prev.map(v => v.id === id ? { ...v, status: 'synced' } : v));
        notify('success', 'Transcription sent to desktop scratchbook.');
      }, 1000);
    } else {
      notify('warning', 'Offline — voice note queued. Sync will proceed when connection is restored.');
    }
  };

  const deleteVoiceNote = (id: string) => {
    setVoiceQueue(prev => prev.filter(v => v.id !== id));
  };

  useEffect(() => {
    return () => {
      if (companionWsRef.current) {
        companionWsRef.current.close();
      }
    };
  }, []);

  // Back button interception for Android
  useEffect(() => {
    const handleBackButton = () => {
      if (showApprovalModal) { setShowApprovalModal(false); return true; }
      if (activeTab !== 'dashboard') { setActiveTab('dashboard'); return true; }
      return false; // Let OS handle it (exits app)
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackButton);
    return () => backHandler.remove();
  }, [activeTab, showApprovalModal]);

  const handleShortcutCommand = (commandName: string) => {
    setActiveSpecialist('Reviewer');
    notify('info', `Running [${commandName}] in desktop sandbox...`);
    setTimeout(() => {
      setActiveSpecialist('Idle');
      notify('success', `Command [${commandName}] completed successfully.`);
    }, 3000);
  };

  const getWsUrl = () => {
    const trimmed = backendUrl.trim().replace(/\/+$/, '');
    if (trimmed.startsWith('https://')) {
      return trimmed.replace(/^https:/i, 'wss:');
    }
    return trimmed.replace(/^http:/i, 'ws:');
  };

  const syncOfflineQueue = () => {
    if (offlineQueue.length === 0) {
      notify('info', 'No queued offline scoping items to sync.');
      return;
    }
    if (companionStatus !== 'connected' || !companionWsRef.current) {
      notify('warning', 'Desktop companion not connected. Connect via LAN, Tailscale, or Tunnel first.');
      return;
    }
    let notesText = '';
    offlineQueue.forEach(item => {
      notesText += `\n- ${item.text}`;
    });
    companionWsRef.current.send(JSON.stringify({
      type: 'SYNC_PLANNING_NOTES',
      notes: notesText
    }));

    let additionalSpec = '';
    offlineQueue.forEach(item => {
      additionalSpec += `\n- [ ] Implemented (Synced): ${item.text}`;
    });
    setPlanDraft(prev => prev + additionalSpec);
    setOfflineQueue([]);
    notify('success', `Synchronized ${offlineQueue.length} offline scoping item(s) to desktop.`);
  };

  const sendQueryToBackend = (text: string, space: 'chat' | 'plan') => {
    return new Promise<string>((resolve, reject) => {
      let finalContent = '';
      const ws = new WebSocket(getWsUrl());
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Backend connection timed out'));
      }, 12000);

      ws.onopen = () => {
        setServerOnline(true);
        ws.send(JSON.stringify({ type: 'config', customInstructions, responseMode }));
        ws.send(JSON.stringify({ type: 'query', text, space: 'chat', sessionId: `mobile_${space}_${Date.now()}` }));
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'update') {
          if (data.streamingContent) finalContent = data.streamingContent;
          if (!data.isStreaming && data.logs) {
            const assistantLog = [...data.logs].reverse().find((log: any) => log.sender === 'assistant');
            if (assistantLog?.message) finalContent = assistantLog.message;
            clearTimeout(timeout);
            ws.close();
            resolve(finalContent || 'Backend completed without a text response.');
          }
        } else if (data.type === 'error') {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(data.message || 'Backend error'));
        }
      };
      ws.onerror = () => {
        setServerOnline(false);
        clearTimeout(timeout);
        reject(new Error('Backend WebSocket unavailable'));
      };
    });
  };

  const handleVoiceInput = async (target: 'chat' | 'plan') => {
    try {
      const voiceModule = require('@react-native-voice/voice');
      const Voice = voiceModule.default || voiceModule;

      if (voiceTarget === target) {
        await Voice.stop();
        setVoiceTarget(null);
        return;
      }

      Voice.onSpeechResults = (event: { value?: string[] }) => {
        const transcript = event.value?.[0]?.trim();
        if (transcript) {
          if (target === 'chat') {
            setChatInput(prev => prev ? `${prev} ${transcript}` : transcript);
          } else {
            setPlanInput(prev => prev ? `${prev} ${transcript}` : transcript);
          }
        }
        setVoiceTarget(null);
      };
      Voice.onSpeechError = (event: { error?: { message?: string } }) => {
        setVoiceTarget(null);
        notify('error', event.error?.message || 'Voice input failed — speech recognition error.');
      };
      Voice.onSpeechEnd = () => setVoiceTarget(null);

      setVoiceTarget(target);
      await Voice.start('en-US');
    } catch {
      notify('warning', 'Voice input requires a native build. Expo Go cannot use speech recognition.');
      setVoiceTarget(null);
    }
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    
    let filtered = chatInput;
    let piiWarning = false;
    if (piiFilterEnabled) {
      filtered = redactSensitiveData(chatInput);
      if (filtered !== chatInput) piiWarning = true;
    }

    setBytesSent(p => p + filtered.length);
    setChatMessages(prev => {
      const list = [...prev, { role: 'user' as const, content: filtered }];
      if (piiWarning) {
        list.push({ role: 'assistant' as const, content: '⚠️ [PII SHIELD ACTIVE]: Sensitive credentials, emails, or phone numbers redacted.' });
      }
      return list;
    });

    const query = filtered;
    setChatInput('');

    sendQueryToBackend(query, 'chat')
      .then((content) => {
        setBytesReceived(p => p + content.length);
        setChatMessages(prev => [...prev, { role: 'assistant' as const, content }]);
      })
      .catch(() => {
        setTimeout(() => {
          setBytesReceived(p => p + 180);
          setChatMessages(prev => [...prev, {
            role: 'assistant' as const,
            content: `[MOBILE AGENT FALLBACK] Backend unavailable. Evaluated [${query}] in local simulator.\nWorkspace files are stable. CPU load is normal.`
          }]);
        }, 1000);
      });
  };

  const handleSendPlan = () => {
    if (!planInput.trim()) return;

    let filtered = planInput;
    let piiWarning = false;
    if (piiFilterEnabled) {
      filtered = redactSensitiveData(planInput);
      if (filtered !== planInput) piiWarning = true;
    }

    if (!isOnline || companionStatus !== 'connected') {
      // Offline queue caching & plan draft update
      const timestamp = new Date().toLocaleTimeString();
      setOfflineQueue(prev => [...prev, { text: filtered, timestamp }]);
      setPlanDraft(prev => prev + `\n- [ ] Queued (Offline): ${filtered}`);
      setPlanMessages(prev => {
        const list = [...prev, { role: 'user' as const, content: filtered }];
        list.push({
          role: 'assistant' as const,
          content: '📡 [OFFLINE MODE]: Scoping request cached locally. Will sync when link to desktop/tunnel is restored.'
        });
        if (piiWarning) {
          list.push({ role: 'assistant' as const, content: '⚠️ [PII SHIELD ACTIVE]: Sensitive data redacted.' });
        }
        return list;
      });
      setPlanInput('');
      notify('info', 'Offline ideation note queued locally.');
      return;
    }

    setBytesSent(p => p + filtered.length);
    setPlanMessages(prev => {
      const list = [...prev, { role: 'user' as const, content: filtered }];
      if (piiWarning) {
        list.push({ role: 'assistant' as const, content: '⚠️ [PII SHIELD ACTIVE]: Sensitive credentials, emails, or phone numbers redacted.' });
      }
      return list;
    });

    const query = filtered;
    setPlanInput('');

    sendQueryToBackend(`[ARCHITECT SPECIFICATION INSTRUCTION]: ${query}`, 'plan')
      .then((content) => {
        setBytesReceived(p => p + content.length);
        setPlanMessages(prev => [...prev, { role: 'assistant' as const, content }]);
        setPlanDraft(prev => prev + `\n- [ ] Implemented: ${query}`);
      })
      .catch(() => {
        setOfflineQueue(prev => [...prev, { text: query, timestamp: new Date().toLocaleTimeString() }]);
        setPlanMessages(prev => [...prev, {
          role: 'assistant' as const,
          content: `Backend unavailable. Saved [${query}] to offline ideation queue.`
        }]);
        setPlanDraft(prev => prev + `\n- [ ] Queued (Offline Fallback): ${query}`);
        notify('warning', 'Backend unreachable. Saved to offline ideation queue.');
      });
  };

  useEffect(() => {
    const loadTelemetry = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/telemetry`);
        if (!res.ok) throw new Error('Telemetry unavailable');
        const data = await res.json();
        setBytesSent(data.bytesSent ?? bytesSent);
        setBytesReceived(data.bytesReceived ?? bytesReceived);
        setServerOnline(true);
      } catch {
        setServerOnline(false);
      }
    };
    loadTelemetry();
    const timer = setInterval(loadTelemetry, 10000);
    return () => clearInterval(timer);
  }, [backendUrl]);

  const toggleConnection = () => {
    const nextState = !isOnline;
    setIsOnline(nextState);
    setServerOnline(nextState);
    
    if (nextState && offlineQueue.length > 0) {
      notify('success', `Connection restored — synchronizing ${offlineQueue.length} queued scoping request(s) to desktop...`);
      
      let additionalSpec = '';
      offlineQueue.forEach(item => {
        additionalSpec += `\n- [ ] Implemented (Synced): ${item.text}`;
      });
      setPlanDraft(prev => prev + additionalSpec);
      setBytesSent(p => p + JSON.stringify(offlineQueue).length);
      setBytesReceived(p => p + 200);
      setOfflineQueue([]);
    }
  };

  const handleImportPlan = () => {
    confirm(
      'Simulate Sync Conflict?',
      'Would you like to simulate a Sync Conflict (3-way merge) for this import?',
      [
        {
          text: 'No (Normal Sync)',
          onPress: () => {
            notify('success', 'Draft plan successfully written to implementation_plan.md on desktop.');
          }
        },
        {
          text: 'Yes (Trigger Conflict)',
          onPress: () => {
            confirm(
              'Sync Conflict Detected',
              'Your local mobile scoping draft conflicts with updates made on the desktop server.',
              [
                {
                  text: 'Keep Mobile Version',
                  onPress: () => {
                    notify('success', 'Desktop version overwritten with your mobile version.');
                  }
                },
                {
                  text: 'Keep Desktop Version',
                  onPress: () => {
                    const desktopMockPlan = planDraft + "\n- [ ] Implemented (Desktop): Core auth socket modules";
                    setPlanDraft(desktopMockPlan);
                    notify('success', 'Mobile draft replaced with desktop version.');
                  }
                },
                {
                  text: 'Inject Markers',
                  onPress: () => {
                    const conflictedText = planDraft + "\n\n<<<<<<< CLIENT (OURS)\n- [ ] Synced: Mobile offline scope\n=======\n- [ ] Synced: Conflicting desktop update\n>>>>>>> SERVER (THEIRS)";
                    setPlanDraft(conflictedText);
                    notify('warning', 'Merge conflict markers injected. Resolve directly in the plan.');
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const handleToggleSync = (value: boolean) => {
    setIsSyncEnabled(value);
  };

  const toggleTask = (id: number) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        const nextStatus = t.status === 'completed' ? 'pending' : t.status === 'pending' ? 'progress' : 'completed';
        return { ...t, status: nextStatus, lastModified: new Date().toISOString() };
      }
      return t;
    }));
  };

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const progressPercent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <ErrorBoundary>
    <SafeAreaView style={styles.safeArea}>
      <RNView style={styles.header}>
        <RNView style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <TouchableOpacity
            onPress={() => setNavOpen(open => !open)}
            accessibilityRole="button"
            accessibilityLabel={navOpen ? 'Close navigation menu' : 'Open navigation menu'}
            style={styles.menuButton}
          >
            <RNText style={styles.menuButtonText}>{navOpen ? 'X' : '☰'}</RNText>
          </TouchableOpacity>
          <RNText style={styles.headerTitle}>⚡ KRYLEOS FORGE // COMPANION</RNText>
        </RNView>
        <TouchableOpacity
          onPress={toggleConnection}
          style={styles.serverStatusContainer}
          accessibilityRole="button"
          accessibilityLabel="Toggle network offline simulator mode"
        >
          <RNView style={[styles.statusDot, { backgroundColor: !isOnline ? '#ff3333' : companionStatus === 'connected' ? '#00ff66' : '#ffaa00' }]} />
          <RNText style={styles.serverStatusText}>{!isOnline ? 'LINK OFFLINE' : companionStatus === 'connected' ? 'DESKTOP LINKED' : 'BACKEND ONLINE'}</RNText>
        </TouchableOpacity>
      </RNView>

      {/* Tabs Switcher */}
      {navOpen && <RNView role="tablist" style={styles.tabContainer}>
        {TABS.map(({ key, icon, label }) => {
          const isActive = activeTab === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => { setActiveTab(key); setNavOpen(false); }}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              accessibilityRole="tab"
              accessibilityLabel={`${label} tab`}
              accessibilityState={{ selected: isActive }}
            >
              <RNText style={[styles.tabIcon, isActive && styles.tabIconActive]}>{icon}</RNText>
              <RNText style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                {label}
              </RNText>
              {isActive && <RNView style={styles.tabActiveIndicator} />}
            </TouchableOpacity>
          );
        })}
      </RNView>}

      {/* Screen Panels with Keyboard Avoiding support */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView style={styles.contentScroll} contentContainerStyle={styles.contentContainer}>
        
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <RNView style={styles.cardContainer}>
            {/* Status overview card */}
            <RNView style={styles.card}>
              <RNText style={styles.cardHeader}>WORKSPACE TELEMETRY</RNText>
              <RNView style={styles.row}>
                <RNText style={styles.label}>Active Specialist:</RNText>
                <RNText style={[styles.value, { color: activeSpecialist !== 'Idle' ? '#00ff66' : '#aaffbb' }]}>{activeSpecialist.toUpperCase()}</RNText>
              </RNView>
              <RNView style={styles.row}>
                <RNText style={styles.label}>Task Completion:</RNText>
                <RNText style={styles.value}>{progressPercent}% ({completedCount}/{tasks.length})</RNText>
              </RNView>
              {/* Simple progress bar */}
              <RNView style={styles.progressBarBg}>
                <RNView style={[styles.progressBarFg, { width: `${progressPercent}%` }]} />
              </RNView>
              {activeSpecialist !== 'Idle' && (
                <TouchableOpacity
                  onPress={stopWorkflowRemote}
                  style={[styles.gridBtn, { width: '100%', marginTop: 12, backgroundColor: '#220002', borderColor: '#ff3333' }]}
                >
                  <RNText style={[styles.gridBtnText, { color: '#ff3333' }]}>■ STOP WORKFLOW EXECUTION</RNText>
                </TouchableOpacity>
              )}
            </RNView>

            {/* Voice scoping queue card */}
            <RNView style={styles.card}>
              <RNView style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 8, marginBottom: 10 }}>
                <RNView style={styles.featureTitleRow}>
                  <RNText style={[styles.cardHeader, { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>VOICE SCOPING QUEUE</RNText>
                  <StatusBadge status="simulator" />
                </RNView>
                <TouchableOpacity
                  onPress={addVoiceNoteAttachment}
                  style={[styles.syncBtn, { backgroundColor: colors.neon }]}
                  accessibilityRole="button"
                  accessibilityLabel="Record a simulated voice note"
                >
                  <RNText style={[styles.syncBtnText, { color: '#000000' }]}>🎤 RECORD</RNText>
                </TouchableOpacity>
              </RNView>
              {voiceQueue.length === 0 ? (
                <RNText style={{ color: colors.dim, fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginVertical: 8 }}>
                  No voice note attachments queued.
                </RNText>
              ) : (
                voiceQueue.map(v => (
                  <RNView key={v.id} style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 }}>
                    <RNView style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <RNText style={{ color: colors.neon, fontSize: 12, fontWeight: 'bold', fontFamily: 'Courier' }}>
                        🔊 NOTE {v.duration} ({v.size})
                      </RNText>
                      <RNText style={{ color: colors.dim, fontSize: 11, fontFamily: 'Courier' }}>
                        {v.timestamp}
                      </RNText>
                    </RNView>
                    <RNText style={{ color: colors.value, fontSize: 13, lineHeight: 18, marginBottom: 8 }}>
                      {v.transcription}
                    </RNText>
                    <RNView style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => notify('info', 'Simulated playing audio attachment...')}
                        style={[styles.syncBtn, { backgroundColor: '#002205', borderWidth: 1, borderColor: '#00ff66', paddingHorizontal: 6 }]}
                      >
                        <RNText style={[styles.syncBtnText, { color: '#00ff66' }]}>PLAY</RNText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => syncVoiceNote(v.id)}
                        disabled={v.status === 'synced' || v.status === 'syncing'}
                        style={[styles.syncBtn, {
                          backgroundColor: v.status === 'synced' ? '#003311' : v.status === 'syncing' ? '#555555' : '#d97706',
                          paddingHorizontal: 6
                        }]}
                      >
                        <RNText style={styles.syncBtnText}>
                          {v.status === 'synced' ? '✓ SYNCED' : v.status === 'syncing' ? 'SYNCING...' : '☁ SYNC'}
                        </RNText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => deleteVoiceNote(v.id)}
                        style={[styles.syncBtn, { backgroundColor: '#220002', borderWidth: 1, borderColor: '#ff3333', paddingHorizontal: 6 }]}
                      >
                        <RNText style={[styles.syncBtnText, { color: '#ff3333' }]}>DELETE</RNText>
                      </TouchableOpacity>
                    </RNView>
                  </RNView>
                ))
              )}
            </RNView>

            {/* Live Desktop traces card */}
            <RNView style={styles.card}>
              <RNText style={styles.cardHeader}>LIVE DESKTOP COMMAND TRACES</RNText>
              <ScrollView style={{ height: 180 }} nestedScrollEnabled={true}>
                {desktopLogs.length === 0 ? (
                  <RNText style={{ color: colors.dim, fontSize: 12, lineHeight: 17, fontStyle: 'italic', textAlign: 'center', marginTop: 30 }}>
                    No remote execution traces received. Connect companion node to start receiving trace logs.
                  </RNText>
                ) : (
                  desktopLogs.map((log, index) => (
                    <RNView key={index} style={{
                      padding: 6,
                      borderWidth: 1,
                      borderColor: log.type === 'error' ? '#ff3333' : log.type === 'action' ? '#00ff66' : '#004411',
                      backgroundColor: log.type === 'error' ? '#220002' : log.type === 'action' ? '#001a05' : 'transparent',
                      borderRadius: 4,
                      marginBottom: 6
                    }}>
                      <RNText style={{ color: colors.dim, fontSize: 10, fontFamily: 'Courier' }}>
                        [{log.timestamp}] {log.sender.toUpperCase()} → {log.recipient.toUpperCase()}
                      </RNText>
                      <RNText style={{ color: log.type === 'error' ? '#ffc9c9' : log.type === 'action' ? colors.neon : colors.value, fontSize: 12, lineHeight: 17, fontFamily: 'Courier', marginTop: 3 }}>
                        {log.message}
                      </RNText>
                    </RNView>
                  ))
                )}
              </ScrollView>
            </RNView>

            {/* Live process telemetry + latest execution trace card */}
            <RNView style={styles.card}>
              <RNView style={[styles.featureTitleRow, { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6, marginBottom: 10 }]}>
                <RNText style={[styles.cardHeader, { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>DESKTOP PROCESS TELEMETRY</RNText>
                {liveCpuLoad === null && liveMemoryUsage === null ? <StatusBadge status="simulator" label="Awaiting data" /> : <StatusBadge status="production" label="Live" />}
              </RNView>
              <RNView style={styles.row}>
                <RNText style={styles.label}>CPU Load:</RNText>
                <RNText style={styles.value}>{liveCpuLoad === null ? '—' : `${liveCpuLoad.toFixed(1)}%`}</RNText>
              </RNView>
              <RNView style={styles.row}>
                <RNText style={styles.label}>Memory (RSS):</RNText>
                <RNText style={styles.value}>{liveMemoryUsage === null ? '—' : `${liveMemoryUsage.toFixed(1)} MB`}</RNText>
              </RNView>

              <RNText style={[styles.cardHeader, { marginTop: 14 }]}>LATEST EXECUTION TRACE</RNText>
              {!latestTrace ? (
                <RNText style={{ color: colors.dim, fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginVertical: 8 }}>
                  No execution trace received yet for this session.
                </RNText>
              ) : (
                <>
                  <RNView style={styles.row}>
                    <RNText style={styles.label}>Plan Item:</RNText>
                    <RNText style={styles.value}>{latestTrace.planItemId}</RNText>
                  </RNView>
                  <RNView style={styles.row}>
                    <RNText style={styles.label}>Suggested Status:</RNText>
                    <RNText style={styles.value}>{latestTrace.suggestedStatus}</RNText>
                  </RNView>
                  {(latestTrace.criteriaResults || []).map((c: any, index: number) => (
                    <RNView key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                      <RNText style={{ color: colors.value, fontSize: 12, flex: 1 }}>{c.criterionId}</RNText>
                      <RNText style={{ color: c.status === 'pass' ? '#00ff66' : c.status === 'fail' ? '#ff3333' : colors.dim, fontSize: 12, fontWeight: 'bold' }}>
                        {c.status.toUpperCase()}
                      </RNText>
                    </RNView>
                  ))}
                </>
              )}
            </RNView>

            {/* Token analytics card */}
            <RNView style={styles.card}>
              <RNView style={[styles.featureTitleRow, { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6, marginBottom: 10 }]}>
                <RNText style={[styles.cardHeader, { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>API TOKEN CONSUMPTION</RNText>
                <StatusBadge status="mock" label="Mock data" />
              </RNView>
              <RNView style={styles.row}>
                <RNText style={styles.label}>Session Tokens:</RNText>
                <RNText style={styles.value}>{tokenCount.toLocaleString()}</RNText>
              </RNView>
              <RNView style={styles.row}>
                <RNText style={styles.label}>Estimated Cost:</RNText>
                <RNText style={[styles.value, { color: '#bb66ff' }]}>${estimatedCost.toFixed(3)} USD</RNText>
              </RNView>
            </RNView>

            {/* Remote commands grid */}
            <RNView style={styles.card}>
              <RNView style={[styles.featureTitleRow, { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6, marginBottom: 10 }]}>
                <RNText style={[styles.cardHeader, { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>REMOTE SANDBOX SHORTCUTS</RNText>
                <StatusBadge status="simulator" />
              </RNView>
              <RNView style={styles.grid}>
                <TouchableOpacity
                  onPress={() => handleShortcutCommand('npm run build')}
                  style={styles.gridBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Run build command remotely"
                >
                  <RNText style={styles.gridBtnText}>🔨 RUN BUILD</RNText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleShortcutCommand('npm run lint')}
                  style={styles.gridBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Run linter remotely"
                >
                  <RNText style={styles.gridBtnText}>✨ RUN LINT</RNText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleShortcutCommand('npm test')}
                  style={styles.gridBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Run tests remotely"
                >
                  <RNText style={styles.gridBtnText}>🧪 RUN TEST</RNText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleShortcutCommand('git status')}
                  style={styles.gridBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Run git status remotely"
                >
                  <RNText style={styles.gridBtnText}>☁️ GIT STATUS</RNText>
                </TouchableOpacity>
              </RNView>
            </RNView>
          </RNView>
        )}

        {/* PLANNING TAB */}
        {activeTab === 'plan' && (
          <RNView style={styles.scopingContainer}>
            {/* Draft Plan box */}
            <RNView style={styles.card}>
              <RNView style={styles.rowSpaceBetween}>
                <RNText style={styles.cardHeader}>PLAN DRAFT: implementation_plan.md</RNText>
                <TouchableOpacity onPress={handleImportPlan} style={styles.syncBtn}>
                  <RNText style={styles.syncBtnText}>☁️ IMPORT PLAN</RNText>
                </TouchableOpacity>
              </RNView>
              <RNText style={styles.planDoc}>{planDraft}</RNText>
            </RNView>

            {/* Offline Ideation Queue */}
            <RNView style={styles.card}>
              <RNView style={styles.rowSpaceBetween}>
                <RNText style={styles.cardHeader}>
                  📝 OFFLINE IDEATION QUEUE ({offlineQueue.length})
                </RNText>
                {offlineQueue.length > 0 && (
                  <TouchableOpacity
                    onPress={syncOfflineQueue}
                    disabled={!isOnline || companionStatus !== 'connected'}
                    style={[styles.syncBtn, (!isOnline || companionStatus !== 'connected') && { opacity: 0.5 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Sync queued offline plans to desktop"
                  >
                    <RNText style={styles.syncBtnText}>🔄 SYNC TO DESKTOP</RNText>
                  </TouchableOpacity>
                )}
              </RNView>
              {offlineQueue.length === 0 ? (
                <RNText style={{ color: '#888888', fontSize: 12, fontFamily: 'Courier', paddingVertical: 4 }}>
                  All ideation notes synced. You can draft feature scopes offline; they will auto-queue and sync when connected.
                </RNText>
              ) : (
                offlineQueue.map((item, idx) => (
                  <RNView key={idx} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#222222' }}>
                    <RNText style={{ color: '#00ff66', fontSize: 12, fontFamily: 'Courier' }}>• {item.text}</RNText>
                    <RNText style={{ color: '#666666', fontSize: 10, marginTop: 2 }}>Queued at: {item.timestamp}</RNText>
                  </RNView>
                ))
              )}
            </RNView>

            {/* Architect chat pane */}
            <RNView style={[styles.card, { minHeight: 220 }]}>
              <RNText style={styles.cardHeader}>ARCHITECT CHAT CHANNEL</RNText>
              <ScrollView style={styles.messageScroll}>
                {planMessages.map((msg, idx) => (
                  <RNView key={idx} style={[styles.msgBubble, msg.role === 'user' ? styles.msgBubbleUser : styles.msgBubbleAgent]}>
                    <RNText style={styles.msgRole}>{msg.role === 'user' ? '👤 YOU' : '🤖 ARCHITECT'}</RNText>
                    <RNText style={styles.msgContent}>{msg.content}</RNText>
                  </RNView>
                ))}
              </ScrollView>
              <RNView style={styles.inputRow}>
                <TextInput
                  value={planInput}
                  onChangeText={setPlanInput}
                  placeholder="Outline feature scopes..."
                  placeholderTextColor="#00aa44"
                  style={styles.input}
                  multiline={true}
                  autoCapitalize="sentences"
                  autoCorrect={true}
                  accessibilityLabel="Plan outline description input"
                />
                <TouchableOpacity
                  onPress={handleSendPlan}
                  style={styles.sendBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Send plan specification"
                >
                  <RNText style={styles.sendBtnText}>SEND</RNText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleVoiceInput('plan')}
                  style={[styles.voiceBtn, voiceTarget === 'plan' && styles.voiceBtnActive]}
                  accessibilityRole="button"
                  accessibilityLabel={voiceTarget === 'plan' ? 'Stop planning voice input' : 'Start planning voice input'}
                >
                  <RNText style={styles.voiceBtnText}>{voiceTarget === 'plan' ? 'STOP' : 'MIC'}</RNText>
                </TouchableOpacity>
              </RNView>
            </RNView>
          </RNView>
        )}

        {/* CHAT TAB */}
        {activeTab === 'chat' && (
          <RNView style={styles.card}>
            <RNText style={styles.cardHeader}>WORKSPACE CHAT CONSOLE</RNText>
            <ScrollView style={[styles.messageScroll, { height: 260 }]}>
              {chatMessages.map((msg, idx) => (
                <RNView key={idx} style={[styles.msgBubble, msg.role === 'user' ? styles.msgBubbleUser : styles.msgBubbleAgent]}>
                  <RNText style={styles.msgRole}>{msg.role === 'user' ? '👤 YOU' : '🤖 AGENT'}</RNText>
                  <RNText style={styles.msgContent}>{msg.content}</RNText>
                </RNView>
              ))}
            </ScrollView>
            <RNView style={styles.inputRow}>
              <TextInput
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Ask agent queries..."
                placeholderTextColor="#00aa44"
                style={styles.input}
                multiline={true}
                autoCapitalize="sentences"
                autoCorrect={true}
                accessibilityLabel="Agent query console input"
              />
              <TouchableOpacity
                onPress={handleSendChat}
                style={styles.sendBtn}
                accessibilityRole="button"
                accessibilityLabel="Run agent query"
              >
                <RNText style={styles.sendBtnText}>RUN</RNText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleVoiceInput('chat')}
                style={[styles.voiceBtn, voiceTarget === 'chat' && styles.voiceBtnActive]}
                accessibilityRole="button"
                accessibilityLabel={voiceTarget === 'chat' ? 'Stop chat voice input' : 'Start chat voice input'}
              >
                <RNText style={styles.voiceBtnText}>{voiceTarget === 'chat' ? 'STOP' : 'MIC'}</RNText>
              </TouchableOpacity>
            </RNView>
          </RNView>
        )}

        {/* TASKS CHECKLIST TAB */}
        {activeTab === 'tasks' && (
          <RNView style={styles.card}>
            <RNText style={styles.cardHeader}>PROJECT CHECKLIST</RNText>
            {tasks.map(task => {
              const isChecked = task.status === 'completed';
              const isProgress = task.status === 'progress';
              const symbol = isChecked ? '[x]' : isProgress ? '[/]' : '[ ]';
              const color = isChecked ? '#a1a1aa' : isProgress ? '#00ff66' : '#aaffbb';

              return (
                <RNView key={task.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={() => toggleTask(task.id)}
                    style={[styles.taskItem, { flex: 1 }]}
                    accessibilityRole="checkbox"
                    accessibilityLabel={task.text}
                    accessibilityState={{ checked: isChecked }}
                    aria-checked={isChecked}
                  >
                    <RNText style={[styles.taskSymbol, { color }]}>{symbol}</RNText>
                    <RNText style={[styles.taskText, isChecked && styles.taskTextCompleted, { color }]}>
                      {task.text}
                    </RNText>
                  </TouchableOpacity>
                  {!isChecked && (
                    <TouchableOpacity
                      onPress={() => launchForgeRun(String(task.id))}
                      style={[styles.syncBtn, { backgroundColor: '#001a05', borderWidth: 1, borderColor: '#00ff66', paddingHorizontal: 6 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Launch FORGE run for ${task.text}`}
                    >
                      <RNText style={[styles.syncBtnText, { color: '#00ff66' }]}>▶ RUN</RNText>
                    </TouchableOpacity>
                  )}
                </RNView>
              );
            })}
          </RNView>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <RNView style={styles.cardContainer}>
            <RNView style={styles.card}>
              <RNView style={[styles.featureTitleRow, { justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6, marginBottom: 10 }]}>
                <RNText style={[styles.cardHeader, { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>MOBILE CONFIGURATION</RNText>
                <StatusBadge status="mock" label="Mock keychain" />
              </RNView>
              
              <RNText style={styles.inputLabel}>DEEPSEEK API KEY</RNText>
              <TextInput
                value={apiKey}
                onChangeText={setApiKey}
                secureTextEntry
                placeholder="sk-..."
                placeholderTextColor="#004411"
                style={styles.inputField}
                accessibilityLabel="DeepSeek API key input"
              />

              <RNText style={styles.inputLabel}>GEMINI API KEY</RNText>
              <TextInput
                value={geminiApiKey}
                onChangeText={setGeminiApiKey}
                secureTextEntry
                placeholder="AIzaSy..."
                placeholderTextColor="#004411"
                style={styles.inputField}
                accessibilityLabel="Google Gemini API key input"
              />

              <RNText style={styles.inputLabel}>DESKTOP BACKEND URL</RNText>
              <TextInput
                value={backendUrl}
                onChangeText={setBackendUrl}
                placeholder="http://100.x.y.z:3001 (Tailscale) or https://tunnel.domain"
                placeholderTextColor="#004411"
                style={styles.inputField}
                autoCapitalize="none"
                keyboardType="url"
                autoCorrect={false}
                accessibilityLabel="Desktop backend URL configuration input"
              />
              <RNText style={[styles.syncSub, { marginBottom: 8 }]}>
                Connect via LAN (http://192.168.x.x:3001), Tailscale mesh VPN (http://100.x.y.z:3001), or Cloudflare Tunnel (https://forge.domain.com). Zero hosting costs.
              </RNText>
              <RNText style={[styles.syncSub, { color: serverOnline ? '#00ff66' : '#ff3333', marginBottom: 8 }]}>
                Backend status: {serverOnline ? 'ONLINE' : 'OFFLINE / SIMULATOR FALLBACK'}
              </RNText>

              <RNText style={styles.inputLabel}>COMPANION PAIRING CODE</RNText>
              <RNView style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <TextInput
                  value={pairingCode}
                  onChangeText={setPairingCode}
                  placeholder="Enter 6-digit code"
                  placeholderTextColor="#004411"
                  style={[styles.inputField, { flex: 1, marginBottom: 0 }]}
                  keyboardType="numeric"
                  maxLength={6}
                  accessibilityLabel="Companion pairing code configuration input"
                />
                <TouchableOpacity
                  onPress={toggleCompanionConnection}
                  style={[styles.toggleBtn, { height: 32, justifyContent: 'center' }]}
                >
                  <RNText style={styles.toggleBtnText}>
                    {companionStatus === 'connected' ? 'DISCONNECT' : companionStatus === 'connecting' ? 'PAIRING...' : 'PAIR'}
                  </RNText>
                </TouchableOpacity>
              </RNView>
              {!deviceToken && (
                <>
                  <RNText style={styles.inputLabel}>PAIRING SECRET (FROM DESKTOP)</RNText>
                  <TextInput
                    value={pairingSecret}
                    onChangeText={setPairingSecret}
                    placeholder="Optional — enables signed remote approvals"
                    placeholderTextColor="#004411"
                    style={styles.inputField}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="Companion pairing secret configuration input"
                  />
                </>
              )}
              <RNText style={[styles.syncSub, { color: companionStatus === 'connected' ? '#00ff66' : '#ff3333', marginBottom: 8 }]}>
                Companion Status: {companionStatus.toUpperCase()}{deviceToken ? ' · DEVICE PAIRED (SIGNED)' : ''}
              </RNText>

              <RNText style={styles.inputLabel}>RESPONSE MODE</RNText>
              <RNView style={styles.planBtnRow}>
                {(['balanced', 'concise', 'critical', 'brutal_audit'] as const).map(mode => (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => setResponseMode(mode)}
                    style={[styles.planBtn, responseMode === mode && styles.planBtnActive]}
                  >
                    <RNText style={[styles.planBtnText, responseMode === mode && styles.planBtnTextActive]}>
                      {mode === 'brutal_audit' ? 'AUDIT' : mode.toUpperCase()}
                    </RNText>
                  </TouchableOpacity>
                ))}
              </RNView>

              {/* PII Compliance Filter toggle */}
              <RNView style={styles.syncRow}>
                <RNView style={{ flex: 1 }}>
                  <RNText style={styles.syncLabel}>PII COMPLIANCE FILTER</RNText>
                  <RNText style={styles.syncSub}>Redact emails, phones, and api keys.</RNText>
                </RNView>
                <TouchableOpacity 
                  onPress={() => setPiiFilterEnabled(!piiFilterEnabled)} 
                  style={[styles.toggleBtn, piiFilterEnabled && { borderColor: '#00ff66', backgroundColor: '#003311' }]}
                >
                  <RNText style={styles.toggleBtnText}>{piiFilterEnabled ? 'ON' : 'OFF'}</RNText>
                </TouchableOpacity>
              </RNView>

              {/* Sync settings */}
              <RNView style={styles.syncRow}>
                <RNView style={{ flex: 1 }}>
                  <RNView style={styles.featureTitleRow}>
                    <RNText style={styles.syncLabel}>SETTINGS CLOUD SYNC</RNText>
                    <StatusBadge status="preview" />
                  </RNView>
                  <RNText style={styles.syncSub}>Sync keys & checklists across devices.</RNText>
                </RNView>
                <TouchableOpacity onPress={() => handleToggleSync(!isSyncEnabled)} style={styles.toggleBtn}>
                  <RNText style={styles.toggleBtnText}>{isSyncEnabled ? 'ON' : 'OFF'}</RNText>
                </TouchableOpacity>
              </RNView>

              {/* Semantic Cache Indexer */}
              <RNView style={styles.syncRow}>
                <RNView style={{ flex: 1 }}>
                  <RNView style={styles.featureTitleRow}>
                    <RNText style={styles.syncLabel}>SEMANTIC CACHE INDEXER</RNText>
                    <StatusBadge status="preview" />
                  </RNView>
                  <RNText style={styles.syncSub}>Index workspace symbols for fast local queries.</RNText>
                </RNView>
                <TouchableOpacity
                  onPress={() => {
                    setSemanticCacheEnabled(!semanticCacheEnabled);
                    if (!semanticCacheEnabled) {
                      notify('success', 'Indexed 47 symbols across workspace.');
                    }
                  }} 
                  style={[styles.toggleBtn, semanticCacheEnabled && { borderColor: '#00ff66', backgroundColor: '#003311' }]}
                >
                  <RNText style={styles.toggleBtnText}>{semanticCacheEnabled ? 'ON' : 'OFF'}</RNText>
                </TouchableOpacity>
              </RNView>

              {/* Self-Healing Rollback Monitor */}
              <RNView style={styles.syncRow}>
                <RNView style={{ flex: 1 }}>
                  <RNView style={styles.featureTitleRow}>
                    <RNText style={styles.syncLabel}>SELF-HEALING ROLLBACKS</RNText>
                    <StatusBadge status="preview" />
                  </RNView>
                  <RNText style={styles.syncSub}>Monitor command execution failures and rollback indicators.</RNText>
                </RNView>
                <TouchableOpacity
                  onPress={() => {
                    setSelfHealingEnabled(!selfHealingEnabled);
                  }} 
                  style={[styles.toggleBtn, selfHealingEnabled && { borderColor: '#00ff66', backgroundColor: '#003311' }]}
                >
                  <RNText style={styles.toggleBtnText}>{selfHealingEnabled ? 'ON' : 'OFF'}</RNText>
                </TouchableOpacity>
              </RNView>
              {selfHealingEnabled && (
                <RNText style={[styles.syncSub, { color: '#00ff66', marginTop: 4, fontFamily: 'Courier', textAlign: 'center' }]}>
                  🔄 SELF-HEALING ACTIVE: Monitoring command execution exits.
                </RNText>
              )}

              {/* RBAC Command Policies */}
              <RNView style={styles.syncRow}>
                <RNView style={{ flex: 1 }}>
                  <RNView style={styles.featureTitleRow}>
                    <RNText style={styles.syncLabel}>RBAC COMMAND POLICY</RNText>
                    <StatusBadge status="simulator" />
                  </RNView>
                  <RNText style={styles.syncSub}>Demonstrate command restrictions by role.</RNText>
                </RNView>
                <TouchableOpacity
                  onPress={() => {
                    setRbacEnabled(!rbacEnabled);
                  }} 
                  style={[styles.toggleBtn, rbacEnabled && { borderColor: '#00ff66', backgroundColor: '#003311' }]}
                >
                  <RNText style={styles.toggleBtnText}>{rbacEnabled ? 'ON' : 'OFF'}</RNText>
                </TouchableOpacity>
              </RNView>
              {rbacEnabled && (
                <RNText style={[styles.syncSub, { color: '#00ff66', marginTop: 4, fontFamily: 'Courier', textAlign: 'center' }]}>
                  RBAC SIMULATOR ACTIVE: Blocking npm publish, docker push, terraform, aws.
                </RNText>
              )}
            </RNView>

            {/* Console Styling Theme Card */}
            <RNView style={styles.card}>
              <RNText style={styles.cardHeader}>CONSOLE STYLING THEME</RNText>
              <RNView style={styles.planBtnRow}>
                {['dark', 'light'].map(t => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setTheme(t as any)}
                    style={[styles.planBtn, theme === t && styles.planBtnActive]}
                  >
                    <RNText style={[styles.planBtnText, theme === t && styles.planBtnTextActive]}>
                      {t === 'dark' ? 'DARK (DEFAULT)' : 'LIGHT'}
                    </RNText>
                  </TouchableOpacity>
                ))}
              </RNView>
            </RNView>

            {/* WebSocket compression & Telemetry Stats Card */}
            <RNView style={styles.card}>
              <RNView style={[styles.featureTitleRow, { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6, marginBottom: 10 }]}>
                <RNText style={[styles.cardHeader, { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>WEBSOCKET TELEMETRY</RNText>
                <StatusBadge status="preview" />
              </RNView>
              <RNView style={styles.row}>
                <RNText style={styles.label}>Bytes Transmitted:</RNText>
                <RNText style={styles.value}>{(bytesSent / 1024).toFixed(2)} KB</RNText>
              </RNView>
              <RNView style={styles.row}>
                <RNText style={styles.label}>Bytes Received:</RNText>
                <RNText style={styles.value}>{(bytesReceived / 1024).toFixed(2)} KB</RNText>
              </RNView>
              <RNView style={styles.row}>
                <RNText style={styles.label}>Compression Savings:</RNText>
                <RNText style={[styles.value, { color: '#00ff66' }]}>68% (zlib deflate)</RNText>
              </RNView>
            </RNView>

            {/* Free & Open Source License Card */}
            <RNView style={styles.card}>
              <RNView style={styles.featureTitleRow}>
                <RNText style={styles.cardHeader}>FREE & OPEN SOURCE (BYOK)</RNText>
                <StatusBadge status="production" label="Full Access" />
              </RNView>
              <RNView style={styles.row}>
                <RNText style={styles.label}>Access Mode:</RNText>
                <RNText style={[styles.value, { color: '#00ff66' }]}>COMMUNITY EDITION</RNText>
              </RNView>
              <RNText style={[styles.syncSub, { marginTop: 6, color: colors.mutedText }]}>
                All features, semantic cache, drift detection, and companion syncing are 100% free and open source. Bring your own API keys or use local models (Ollama).
              </RNText>
            </RNView>
          </RNView>
        )}

      </ScrollView>
      </KeyboardAvoidingView>

      {/* Command Approval Modal Notification */}
      <Modal visible={showApprovalModal} transparent animationType="slide">
        <RNView style={styles.modalBg}>
          <RNView style={[styles.modalPanel, { borderColor: '#ff3333' }]}>
            <RNText style={[styles.modalHeader, { color: '#ff3333' }]}>🚨 SECURITY APPROVAL REQUIRED</RNText>
            <RNText style={styles.modalTextSub}>Proposed CLI Sandbox Execution:</RNText>
            <RNText style={styles.cmdText}>{pendingApprovalCommand}</RNText>

            {pendingApprovalDestructive && (
              <RNView style={{ borderWidth: 1, borderColor: '#ff3333', backgroundColor: '#220002', borderRadius: 4, padding: 8, marginVertical: 8 }}>
                <RNText style={{ color: '#ff3333', fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>
                  ⚠️ This command was classified as DESTRUCTIVE. It may delete or overwrite files.
                </RNText>
                <TouchableOpacity
                  onPress={() => setDestructiveConfirmed(!destructiveConfirmed)}
                  style={[styles.toggleBtn, destructiveConfirmed && { borderColor: '#00ff66', backgroundColor: '#003311' }]}
                >
                  <RNText style={styles.toggleBtnText}>
                    {destructiveConfirmed ? '✓ CONFIRMED — I understand the risk' : 'TAP TO CONFIRM YOU UNDERSTAND'}
                  </RNText>
                </TouchableOpacity>
              </RNView>
            )}

            <RNView style={styles.row}>
              <TouchableOpacity
                onPress={approveCommandRemote}
                disabled={pendingApprovalDestructive && !destructiveConfirmed}
                style={[
                  styles.modalBtn,
                  { backgroundColor: '#004411', borderColor: '#00ff66' },
                  pendingApprovalDestructive && !destructiveConfirmed && { opacity: 0.4 }
                ]}
              >
                <RNText style={{ color: '#00ff66', fontSize: 11, fontWeight: 'bold' }}>APPROVE RUN</RNText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={rejectCommandRemote}
                style={[styles.modalBtn, { backgroundColor: '#220002', borderColor: '#ff3333' }]}
              >
                <RNText style={{ color: '#ff3333', fontSize: 11, fontWeight: 'bold' }}>REJECT</RNText>
              </TouchableOpacity>
            </RNView>
          </RNView>
        </RNView>
      </Modal>

      {/* Dynamic visual toast notifications */}
      {toast && (
        <RNView
          style={[styles.toastContainer, { borderColor: TOAST_COLORS[toast.type] }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${toast.type}: ${toast.message}`}
        >
          <RNText style={[styles.toastText, { color: TOAST_COLORS[toast.type] }]}>
            {TOAST_ICONS[toast.type]} {toast.message}
          </RNText>
        </RNView>
      )}

      <StatusBar style="light" />
    </SafeAreaView>
    </ErrorBoundary>
  );
}

const THEMES = {
  dark: {
    bg: '#080e12',
    panelBg: '#131c21',
    border: '#29353c',
    neon: '#56d57a',
    dim: '#7e8b94',
    text: '#ebeff2',
    mutedText: '#7e8b94',
    tabActiveBg: '#0d1519',
    label: '#7e8b94',
    value: '#ebeff2',
    inputBg: '#080e12',
    progressBarFg: '#56d57a',
    progressBarBg: '#131c21',
  },

  forge: {
    bg: '#080e12',
    panelBg: '#131c21',
    border: '#29353c',
    neon: '#56d57a',
    dim: '#7e8b94',
    text: '#ebeff2',
    mutedText: '#7e8b94',
    tabActiveBg: '#0d1519',
    label: '#7e8b94',
    value: '#ebeff2',
    inputBg: '#080e12',
    progressBarFg: '#56d57a',
    progressBarBg: '#131c21',
  },

  light: {
    bg: '#f8f7f3',
    panelBg: '#ffffff',
    border: '#dddad5',
    neon: '#007834',
    dim: '#505a5f',
    text: '#12171a',
    mutedText: '#505a5f',
    tabActiveBg: '#f0eee9',
    label: '#505a5f',
    value: '#12171a',
    inputBg: '#ffffff',
    progressBarFg: '#007834',
    progressBarBg: '#dddad5',
  }
};

const getStyles = (theme: string) => {
  const colors = THEMES[theme as keyof typeof THEMES] || THEMES.forge;
  const isMono = false;
  const defaultFont = undefined;
  
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingTop: 40,
    },
    header: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.panelBg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerTitle: {
      color: colors.neon,
      fontSize: 12,
      fontWeight: 'bold',
      fontFamily: defaultFont,
    },
    menuButton: {
      borderWidth: 1,
      borderColor: colors.border,
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    menuButtonText: {
      color: colors.neon,
      fontSize: 16,
      fontWeight: 'bold',
    },
    serverStatusContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
      paddingHorizontal: 6,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginRight: 5,
    },
    serverStatusText: {
      color: colors.dim,
      fontSize: 11,
      fontWeight: '600',
      fontFamily: defaultFont,
    },
    tabContainer: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.bg,
    },
    tabButton: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 2,
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 3,
      borderRightWidth: 1,
      borderRightColor: colors.border,
    },
    tabButtonActive: {
      backgroundColor: colors.tabActiveBg,
    },
    tabIcon: {
      fontSize: 18,
      lineHeight: 22,
      opacity: 0.6,
    },
    tabIconActive: {
      opacity: 1,
    },
    tabButtonText: {
      color: colors.dim,
      fontSize: 11,
      fontWeight: '600',
      fontFamily: defaultFont,
    },
    tabButtonTextActive: {
      color: colors.neon,
      fontWeight: 'bold',
    },
    tabActiveIndicator: {
      position: 'absolute',
      bottom: 0,
      left: '20%',
      right: '20%',
      height: 2,
      borderRadius: 2,
      backgroundColor: colors.neon,
    },
    contentScroll: {
      flex: 1,
    },
    contentContainer: {
      padding: 16,
    },
    cardContainer: {
      gap: 16,
    },
    card: {
      backgroundColor: colors.panelBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      padding: 12,
    },
    cardHeader: {
      color: colors.text,
      fontSize: 13,
      letterSpacing: 0.4,
      fontWeight: 'bold',
      fontFamily: defaultFont,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: 6,
      marginBottom: 10,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    rowSpaceBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: 6,
      marginBottom: 10,
      flex: 1,
    },
    label: {
      color: colors.label,
      fontSize: 14,
      fontFamily: defaultFont,
    },
    value: {
      color: colors.value,
      fontSize: 15,
      fontWeight: 'bold',
      fontFamily: defaultFont,
    },
    progressBarBg: {
      height: 6,
      backgroundColor: colors.progressBarBg,
      borderRadius: 3,
      marginTop: 6,
      overflow: 'hidden',
    },
    progressBarFg: {
      height: 6,
      backgroundColor: colors.progressBarFg,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    gridBtn: {
      width: '48%',
      paddingVertical: 14,
      backgroundColor: colors.progressBarBg,
      borderWidth: 1,
      borderColor: colors.neon,
      borderRadius: 4,
      alignItems: 'center',
    },
    gridBtnText: {
      color: colors.neon,
      fontSize: 13,
      fontFamily: defaultFont,
      fontWeight: 'bold',
    },
    scopingContainer: {
      gap: 16,
    },
    syncBtn: {
      backgroundColor: colors.neon,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minHeight: 44,
      justifyContent: 'center',
      borderRadius: 4,
    },
    syncBtnText: {
      color: '#000000',
      fontSize: 12,
      fontWeight: 'bold',
      fontFamily: defaultFont,
    },
    planDoc: {
      color: colors.value,
      fontSize: 12,
      fontFamily: 'Courier',
      lineHeight: 18,
      backgroundColor: 'rgba(0,0,0,0.3)',
      padding: 8,
      borderRadius: 4,
    },
    messageScroll: {
      height: 180,
      marginBottom: 10,
    },
    msgBubble: {
      padding: 8,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
      maxWidth: '85%',
    },
    msgBubbleUser: {
      backgroundColor: colors.tabActiveBg,
      borderColor: colors.neon,
      alignSelf: 'flex-end',
    },
    msgBubbleAgent: {
      backgroundColor: '#0c0714',
      borderColor: '#bb66ff',
      alignSelf: 'flex-start',
    },
    msgRole: {
      fontSize: 10,
      color: colors.dim,
      fontWeight: 'bold',
      letterSpacing: 0.4,
      marginBottom: 4,
    },
    msgContent: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 21,
      fontFamily: defaultFont,
    },
    inputRow: {
      flexDirection: 'row',
      gap: 8,
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.inputBg,
      color: colors.text,
      fontSize: 14,
      fontFamily: defaultFont,
      paddingHorizontal: 10,
      paddingVertical: 10,
      minHeight: 48,
      borderRadius: 4,
    },
    sendBtn: {
      backgroundColor: colors.progressBarBg,
      borderWidth: 1,
      borderColor: colors.neon,
      paddingHorizontal: 12,
      justifyContent: 'center',
      borderRadius: 4,
    },
    sendBtnText: {
      color: colors.neon,
      fontSize: 12,
      fontWeight: 'bold',
      fontFamily: defaultFont,
    },
    voiceBtn: {
      backgroundColor: colors.progressBarBg,
      borderWidth: 1,
      borderColor: colors.neon,
      minHeight: 44,
      paddingHorizontal: 10,
      justifyContent: 'center',
      borderRadius: 4,
    },
    voiceBtnActive: {
      borderColor: '#ff3333',
      backgroundColor: '#220002',
    },
    voiceBtnText: {
      color: colors.neon,
      fontSize: 11,
      fontWeight: 'bold',
      fontFamily: defaultFont,
    },
    taskItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    taskSymbol: {
      fontSize: 15,
      fontFamily: 'Courier',
      marginRight: 10,
      fontWeight: 'bold',
    },
    taskText: {
      fontSize: 15,
      lineHeight: 21,
      fontFamily: defaultFont,
      flex: 1,
    },
    taskTextCompleted: {
      textDecorationLine: 'line-through',
    },
    inputLabel: {
      color: colors.dim,
      fontSize: 12,
      fontWeight: 'bold',
      letterSpacing: 0.3,
      fontFamily: defaultFont,
      marginTop: 8,
      marginBottom: 4,
    },
    inputField: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.inputBg,
      color: colors.text,
      fontSize: 14,
      fontFamily: defaultFont,
      paddingHorizontal: 8,
      height: 48,
      borderRadius: 4,
      marginBottom: 8,
    },
    syncRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    syncLabel: {
      color: colors.text,
      fontSize: 13,
      fontWeight: 'bold',
      fontFamily: defaultFont,
    },
    syncSub: {
      color: colors.dim,
      fontSize: 12,
      lineHeight: 16,
      fontFamily: defaultFont,
      marginTop: 3,
    },
    featureTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
    },
    statusBadge: {
      borderWidth: 1,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      fontSize: 9,
      fontWeight: 'bold',
      letterSpacing: 0.3,
      fontFamily: defaultFont,
      overflow: 'hidden',
    },
    toggleBtn: {
      borderWidth: 1,
      borderColor: colors.neon,
      backgroundColor: colors.progressBarBg,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 4,
    },
    toggleBtnText: {
      color: colors.neon,
      fontSize: 11,
      fontWeight: 'bold',
      fontFamily: defaultFont,
    },
    planBtnRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    planBtn: {
      flex: 1,
      paddingVertical: 6,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 4,
    },
    planBtnActive: {
      borderColor: colors.neon,
      backgroundColor: colors.progressBarBg,
    },
    planBtnText: {
      color: colors.dim,
      fontSize: 11,
      fontFamily: defaultFont,
    },
    planBtnTextActive: {
      color: colors.text,
      fontWeight: 'bold',
    },
    modalBg: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalPanel: {
      backgroundColor: '#0a0502',
      borderWidth: 1,
      borderColor: '#d97706',
      padding: 20,
      borderRadius: 6,
      width: '100%',
      maxWidth: 320,
      alignItems: 'center',
    },
    modalHeader: {
      color: '#f59e0b',
      fontSize: 15,
      fontWeight: 'bold',
      fontFamily: defaultFont,
      marginBottom: 10,
    },
    modalText: {
      color: '#fde9c8',
      fontSize: 13,
      textAlign: 'center',
      fontFamily: defaultFont,
      lineHeight: 19,
      marginBottom: 16,
    },
    modalTextSub: {
      color: '#ffc9c9',
      fontSize: 12,
      fontFamily: defaultFont,
      marginBottom: 6,
    },
    cmdText: {
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: 10,
      borderRadius: 4,
      fontSize: 13,
      fontFamily: 'Courier',
      borderWidth: 1,
      borderColor: '#550002',
      width: '100%',
      marginBottom: 16,
      textAlign: 'center',
    },
    modalUpgradeBtn: {
      backgroundColor: '#d97706',
      width: '100%',
      paddingVertical: 10,
      borderRadius: 4,
      alignItems: 'center',
      marginBottom: 8,
    },
    modalUpgradeText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: 'bold',
      fontFamily: defaultFont,
    },
    modalCopyBtn: {
      borderWidth: 1,
      borderColor: '#d97706',
      width: '100%',
      paddingVertical: 8,
      borderRadius: 4,
      alignItems: 'center',
    },
    modalCopyText: {
      color: '#e8890b',
      fontSize: 11,
      fontWeight: '600',
      fontFamily: defaultFont,
    },
    modalBtn: {
      flex: 1,
      borderWidth: 1,
      paddingVertical: 8,
      borderRadius: 4,
      alignItems: 'center',
      marginHorizontal: 4,
    },
    toastContainer: {
      position: 'absolute',
      bottom: 80,
      left: 20,
      right: 20,
      backgroundColor: '#0a0502',
      borderWidth: 1,
      borderColor: colors.neon,
      padding: 12,
      borderRadius: 8,
      zIndex: 10000,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    toastText: {
      fontFamily: defaultFont,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: 'bold',
      textAlign: 'center',
    },
  });
};
