import React, { useState, useEffect, useCallback } from 'react';
import { Send, Download, FileText, Sparkles, Edit, Eye, CheckCircle, Mic, MicOff, GitBranch, Layers, RefreshCw, X, FileCode, Terminal, Pencil, Square, Check, AlertTriangle, AlertCircle, Trash2, Plus, ChevronDown, ChevronUp, Globe } from 'lucide-react';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { crewPersonas, installCrewPersona } from '../shared/crewPersonas';
import { driftClass } from '../shared/driftClassification';
import type { AcceptanceCriterion, CriterionResult, DriftClassification, ExecutionTrace, ProjectTask, PlanWorkspaceItem } from '../backend/db';

interface DriftItem {
  taskId: string;
  title: string;
  status: DriftClassification;
  category?: string;
  workspace?: string;
  blockedBy: string[];
  results: CriterionResult[];
  latestTrace?: ExecutionTrace;
  suggestedStatus: ProjectTask['status'];
}

interface PlanningScreenProps {
  sessionId?: string;
  activeProject?: any | null;
  workspaceRoot: string;
  onSendQuery: (text: string, space: 'chat' | 'cowork' | 'project') => void;
  logs: any[];
  isStreaming: boolean;
  streamingContent: string;
  initialInput?: string;
  onClearInitialInput?: () => void;
  workspacePaths?: string[];
  onUpdateWorkspacePaths?: (paths: string[]) => void;
  onSendPlanItemToForge?: (title: string) => void;
  tasks?: ProjectTask[];
  onConfirmComplete?: (taskId: string) => Promise<void> | void;
  authToken?: string;
  onNotify?: (message: string, kind?: 'success' | 'error' | 'warning' | 'info') => void;
  onAbort?: () => void;
  resetKey?: number;
  githubToken?: string;
  githubRepoUrl?: string;
  onUpdateGithubConfig?: (config: { githubToken?: string; githubRepoUrl?: string }) => void;
  activeModel?: string;
  zeroEgressMode?: boolean;
  onUpdateConfig?: (newConfig: any) => void;
}

interface WhatsLeftItem {
  taskId: string;
  title: string;
  status: DriftClassification;
  category?: string;
  reason: string;
}

interface WhatsLeftReport {
  generatedAt: string;
  items: WhatsLeftItem[];
  total: number;
  limit: number | null;
  truncated: boolean;
  usedLlm: boolean;
}

function criterionStatusClass(status?: 'pass' | 'fail' | 'unknown') {
  switch (status) {
    case 'pass':
      return 'text-forge-neon';
    case 'fail':
      return 'text-forge-red';
    default:
      return 'text-forge-dim';
  }
}

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'deepseek-chat': { input: 0.14 / 1000000, output: 0.28 / 1000000 },
  'deepseek-reasoner': { input: 0.55 / 1000000, output: 2.19 / 1000000 },
  'gemini-2.5-flash': { input: 0.075 / 1000000, output: 0.30 / 1000000 },
  'gemini-2.5-pro': { input: 1.25 / 1000000, output: 5.00 / 1000000 },
  'gpt-4o': { input: 2.50 / 1000000, output: 10.00 / 1000000 },
  'gpt-4o-mini': { input: 0.15 / 1000000, output: 0.60 / 1000000 },
  'claude-3-5-sonnet-latest': { input: 3.00 / 1000000, output: 15.00 / 1000000 },
  'claude-3-5-haiku-latest': { input: 0.80 / 1000000, output: 4.00 / 1000000 },
  'meta-llama/llama-3.3-70b-instruct': { input: 0.54 / 1000000, output: 0.54 / 1000000 },
  'qwen/qwen-2.5-coder-32b-instruct': { input: 0.40 / 1000000, output: 0.40 / 1000000 },
};

function getPricingForModel(model: string): { input: number; output: number } {
  const m = (model || '').toLowerCase();
  if (m.startsWith('ollama:') || m === 'llama3' || m === 'qwen2.5-coder') {
    return { input: 0, output: 0 };
  }
  if (MODEL_PRICING[m]) return MODEL_PRICING[m];
  if (m.startsWith('gemini')) return { input: 0.075 / 1000000, output: 0.30 / 1000000 };
  if (m.startsWith('gpt')) return { input: 0.15 / 1000000, output: 0.60 / 1000000 };
  if (m.startsWith('claude')) return { input: 3.00 / 1000000, output: 15.00 / 1000000 };
  if (m.includes('llama')) return { input: 0.54 / 1000000, output: 0.54 / 1000000 };
  return { input: 0.14 / 1000000, output: 0.28 / 1000000 };
}

function isLowCapacityModel(modelName: string): boolean {
  const m = (modelName || '').toLowerCase();
  if (m.startsWith('ollama:') || m === 'llama3' || m === 'qwen2.5-coder') return true;
  if (m === 'gpt-4o-mini' || m.startsWith('claude-3-5-haiku') || m === 'gemini-2.5-flash') return true;
  return false;
}

export function PlanningScreen({
  sessionId = 'planning_session',
  activeProject = null,
  workspaceRoot,
  onSendQuery,
  logs,
  isStreaming,
  streamingContent,
  initialInput,
  onClearInitialInput,
  workspacePaths = [],
  onUpdateWorkspacePaths,
  onSendPlanItemToForge,
  tasks = [],
  onConfirmComplete,
  authToken = '',
  onNotify,
  onAbort,
  resetKey = 0,
  githubToken = '',
  githubRepoUrl = '',
  onUpdateGithubConfig,
  activeModel = 'deepseek-chat',
  zeroEgressMode = false,
  onUpdateConfig
}: PlanningScreenProps) {
  const defaultArchitectMessage = 'Hello! I am the Architect System Planning Agent. I can help you model your system design, plan database models, outline code changes, and construct task checklists. Let me know what feature we are scoping today!';
  
  const [inputText, setInputText] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [rightView, setRightView] = useState<'draft' | 'loop' | 'docs' | 'cost' | 'utilities'>('draft'); // 'draft' is now the Plan Workspace list
  const [generatingUtility, setGeneratingUtility] = useState(false);
  const [utilityContent, setUtilityContent] = useState('');
  const [utilitySavePath, setUtilitySavePath] = useState('');
  const [customUtilityPrompt, setCustomUtilityPrompt] = useState('');
  const [savingUtility, setSavingUtility] = useState(false);
  const [agencyBranding, setAgencyBranding] = useState({
    agencyName: 'Kryleos Partner Agency',
    logoUrl: 'https://raw.githubusercontent.com/thetimelord69/Kryleos-forge/main/logo.png',
    primaryColor: '#10b981'
  });
  const [currentCost, setCurrentCost] = useState(0);
  const [currentInputTokens, setCurrentInputTokens] = useState(0);
  const [currentOutputTokens, setCurrentOutputTokens] = useState(0);
  const [currentSavings, setCurrentSavings] = useState(0);

  const [sessionCost, setSessionCost] = useState(0);
  const [sessionTokens, setSessionTokens] = useState(0);
  const [sessionSavings, setSessionSavings] = useState(0);

  const [costHistory, setCostHistory] = useState<any[]>([]);
  const [costRestricted, setCostRestricted] = useState(false);
  const [costHistoryLoading, setCostHistoryLoading] = useState(false);

  const loadCostHistory = useCallback(async () => {
    setCostHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/cost/history`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCostHistory(data.history || []);
          setCostRestricted(!!data.restricted);
        }
      }
    } catch (err) {
      console.error('Failed to load cost history:', err);
    } finally {
      setCostHistoryLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    const handleCostUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setCurrentCost(detail.cost || 0);
        setCurrentInputTokens(detail.inputTokens || 0);
        setCurrentOutputTokens(detail.outputTokens || 0);
        setCurrentSavings(detail.tokenSavings || 0);

        setSessionCost(prev => prev + (detail.cost || 0));
        setSessionTokens(prev => prev + (detail.inputTokens || 0) + (detail.outputTokens || 0));
        setSessionSavings(prev => prev + (detail.tokenSavings || 0));

        loadCostHistory();
      }
    };

    window.addEventListener('kryleos_cost_update', handleCostUpdate);
    return () => {
      window.removeEventListener('kryleos_cost_update', handleCostUpdate);
    };
  }, [loadCostHistory]);

  useEffect(() => {
    if (rightView === 'cost') {
      loadCostHistory();
    }
  }, [rightView, loadCostHistory]);
  const [driftItems, setDriftItems] = useState<DriftItem[]>([]);
  const [loopLoading, setLoopLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichDiff, setEnrichDiff] = useState<Array<{ taskId: string; title: string; added: AcceptanceCriterion[] }>>([]);
  const [enrichDismissed, setEnrichDismissed] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [whatsLeft, setWhatsLeft] = useState<WhatsLeftReport | null>(null);
  const [whatsLeftLoading, setWhatsLeftLoading] = useState(false);
  const [whatsLeftExport, setWhatsLeftExport] = useState(false);
  const [showRepoManager, setShowRepoManager] = useState(false);
  const [newRepoPath, setNewRepoPath] = useState('');
  const [activeTargets, setActiveTargets] = useState<string[]>([workspaceRoot]);

  // Plan Workspace state
  const [workspaceItems, setWorkspaceItems] = useState<PlanWorkspaceItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [expandedContextIds, setExpandedContextIds] = useState<Set<string>>(new Set());
  const [feasibilityVerdicts, setFeasibilityVerdicts] = useState<{ [id: string]: { verdict: string; reason: string; loading?: boolean } }>({});
  
  // Modals state
  const [isExtractModalOpen, setIsExtractModalOpen] = useState(false);
  const [extractedDrafts, setExtractedDrafts] = useState<PlanWorkspaceItem[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PlanWorkspaceItem | null>(null);
  
  const [isPushDiffModalOpen, setIsPushDiffModalOpen] = useState(false);
  const [isPushing, setIsPushing] = useState(false);

  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
  const [gitTokenInput, setGitTokenInput] = useState(githubToken);
  const [gitRepoInput, setGitRepoInput] = useState(githubRepoUrl);
  const [gitIssues, setGitIssues] = useState<any[]>([]);
  const [selectedGitIssueIds, setSelectedGitIssueIds] = useState<Set<number>>(new Set());
  const [fetchingIssues, setFetchingIssues] = useState(false);
  const [importingIssues, setImportingIssues] = useState(false);
  const [gitIssuesSearch, setGitIssuesSearch] = useState('');

  const [docTemplates, setDocTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [docsTargetFolder, setDocsTargetFolder] = useState('.kryleos/docs');
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [patchingDoc, setPatchingDoc] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);
  const [docContent, setDocContent] = useState('');
  const [docPathsList, setDocPathsList] = useState<string[]>([]);
  const [selectedDocPath, setSelectedDocPath] = useState('');

  useEffect(() => {
    setGitTokenInput(githubToken);
  }, [githubToken]);

  useEffect(() => {
    setGitRepoInput(githubRepoUrl);
  }, [githubRepoUrl]);

  const loadDocTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/docs/templates`);
      if (res.ok) {
        const data = await res.json();
        setDocTemplates(data.templates || []);
        if (data.templates && data.templates.length > 0) {
          setSelectedTemplateId(data.templates[0].id);
        }
      }
    } catch {}
  }, []);

  const loadSavedDocs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/artifacts`);
      if (res.ok) {
        const data = await res.json();
        const docs = (data.artifacts || [])
          .map((a: any) => a.path)
          .filter((p: string) => p.startsWith('.kryleos/docs/') || p.startsWith('docs/'));
        setDocPathsList(docs);
        if (docs.length > 0) {
          setSelectedDocPath(prev => prev || docs[0]);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (rightView === 'docs') {
      loadDocTemplates();
      loadSavedDocs();
    }
  }, [rightView, loadDocTemplates, loadSavedDocs]);

  const handleFetchGithubIssues = async () => {
    if (!gitRepoInput.trim()) {
      onNotify?.('Please enter a GitHub repository URL.', 'warning');
      return;
    }
    setFetchingIssues(true);
    setGitIssues([]);
    setSelectedGitIssueIds(new Set());
    try {
      onUpdateGithubConfig?.({ githubToken: gitTokenInput, githubRepoUrl: gitRepoInput });

      const res = await fetch(`${API_BASE_URL}/integrations/github/fetch-issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: gitTokenInput, repoUrl: gitRepoInput })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGitIssues(data.issues || []);
        onNotify?.(`Loaded ${data.issues.length} open issues.`, 'success');
      } else {
        throw new Error(data.error || 'Failed to fetch issues.');
      }
    } catch (err: any) {
      onNotify?.(`Failed to fetch issues: ${err.message}`, 'error');
    } finally {
      setFetchingIssues(false);
    }
  };

  const handleImportGithubIssues = async () => {
    if (selectedGitIssueIds.size === 0) {
      onNotify?.('Please select at least one issue to import.', 'warning');
      return;
    }
    setImportingIssues(true);
    const issuesToImport = gitIssues.filter(issue => selectedGitIssueIds.has(issue.id));
    try {
      const res = await fetch(`${API_BASE_URL}/integrations/github/import-issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: gitTokenInput,
          repoUrl: gitRepoInput,
          issues: issuesToImport
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotify?.(`Successfully imported ${data.count} issue(s) with AI acceptance criteria.`, 'success');
        setIsGithubModalOpen(false);
        setSelectedGitIssueIds(new Set());
        loadWorkspaceItems();
      } else {
        throw new Error(data.error || 'Failed to import issues.');
      }
    } catch (err: any) {
      onNotify?.(`Import failed: ${err.message}`, 'error');
    } finally {
      setImportingIssues(false);
    }
  };

  const handleGenerateDoc = async () => {
    if (!selectedTemplateId) return;
    setGeneratingDoc(true);
    setDocContent('');
    try {
      const res = await fetch(`${API_BASE_URL}/docs/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDocContent(data.content);
        onNotify?.('Document generated successfully. You can now preview and save it.', 'success');
      } else {
        throw new Error(data.error || 'Failed to generate document.');
      }
    } catch (err: any) {
      onNotify?.(`Doc generation failed: ${err.message}`, 'error');
    } finally {
      setGeneratingDoc(false);
    }
  };

  const handleGenerateUtility = async (workflowType: 'founder' | 'agency', workflowId: string) => {
    setGeneratingUtility(true);
    setUtilityContent('');
    setUtilitySavePath('');
    try {
      const isFounder = workflowType === 'founder';
      const endpoint = isFounder 
        ? `${API_BASE_URL}/workflows/founder/generate`
        : `${API_BASE_URL}/workflows/agency/export`;

      const body: any = {
        workflowId,
        customPrompt: customUtilityPrompt
      };

      if (!isFounder) {
        body.branding = agencyBranding;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUtilityContent(data.content);
        setUtilitySavePath(data.defaultPath);
        onNotify?.(`Successfully generated ${workflowId} document. You can now preview and save it.`, 'success');
      } else {
        throw new Error(data.error || 'Server error during generation');
      }
    } catch (err: any) {
      onNotify?.(`Generation failed: ${err.message}`, 'error');
    } finally {
      setGeneratingUtility(false);
    }
  };

  const handleSaveUtility = async () => {
    if (!utilitySavePath || !utilityContent) return;
    setSavingUtility(true);
    try {
      const res = await fetch(`${API_BASE_URL}/docs/write`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          docPath: utilitySavePath,
          content: utilityContent
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotify?.(`Document saved to: ${data.path}`, 'success');
      } else {
        throw new Error(data.error || 'Server error during save');
      }
    } catch (err: any) {
      onNotify?.(`Save failed: ${err.message}`, 'error');
    } finally {
      setSavingUtility(false);
    }
  };

  const handlePatchDoc = async () => {
    if (!selectedDocPath) {
      onNotify?.('Please select a saved document to patch.', 'warning');
      return;
    }
    setPatchingDoc(true);
    try {
      const res = await fetch(`${API_BASE_URL}/docs/patch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docPath: selectedDocPath })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDocContent(data.content);
        onNotify?.('Document updated from latest patches.', 'success');
      } else {
        throw new Error(data.error || 'Failed to patch document.');
      }
    } catch (err: any) {
      onNotify?.(`Doc patch failed: ${err.message}`, 'error');
    } finally {
      setPatchingDoc(false);
    }
  };

  const handleSaveDoc = () => {
    if (!docContent.trim()) {
      onNotify?.('No content to save.', 'warning');
      return;
    }
    const selectedTpl = docTemplates.find(t => t.id === selectedTemplateId);
    const fileName = selectedTpl ? `${selectedTpl.id}.md` : 'document.md';
    const finalPath = `${docsTargetFolder}/${fileName}`;
    
    setConfirmDialog({
      isOpen: true,
      title: 'Overwrite Generated Document',
      message: `Are you sure you want to save this document? If an existing document exists at "${finalPath}", it will be overwritten.`,
      onConfirm: async () => {
        setSavingDoc(true);
        try {
          const res = await fetch(`${API_BASE_URL}/docs/write`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ docPath: finalPath, content: docContent })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            onNotify?.(`Document saved successfully to ${data.path}.`, 'success');
            loadSavedDocs();
          } else {
            throw new Error(data.error || 'Failed to save document.');
          }
        } catch (err: any) {
          onNotify?.(`Save failed: ${err.message}`, 'error');
        } finally {
          setSavingDoc(false);
        }
      }
    });
  };

  const voice = useVoiceInput((text) => {
    setInputText(prev => prev ? `${prev} ${text}` : text);
  });

  useEffect(() => {
    if (initialInput) {
      setInputText(initialInput);
      onClearInitialInput?.();
    }
  }, [initialInput, onClearInitialInput]);

  useEffect(() => {
    setActiveTargets(prev => {
      const allPossible = [workspaceRoot, ...workspacePaths];
      return prev.filter(p => allPossible.includes(p));
    });
  }, [workspaceRoot, workspacePaths]);

  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content: defaultArchitectMessage
    }
  ]);

  // Load plan workspace items from API
  const loadWorkspaceItems = useCallback(async () => {
    if (!activeProject) {
      setWorkspaceItems([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/plan/workspace`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.items)) {
          setWorkspaceItems(data.items);
          
          // Seed feasibility verdicts from loaded items
          const verdicts: typeof feasibilityVerdicts = {};
          data.items.forEach((item: PlanWorkspaceItem) => {
            if (item.feasibility) {
              verdicts[item.id] = {
                verdict: item.feasibility.verdict,
                reason: item.feasibility.reason
              };
            }
          });
          setFeasibilityVerdicts(verdicts);
        }
      }
    } catch (err) {
      console.error('Failed to load workspace items:', err);
    }
  }, [activeProject]);

  useEffect(() => {
    loadWorkspaceItems();
  }, [loadWorkspaceItems]);

  useEffect(() => {
    if (resetKey === 0) return;
    setInputText('');
    setRightView('draft');
    setChatMessages([{ role: 'assistant', content: defaultArchitectMessage }]);
    setShowRepoManager(false);
    setNewRepoPath('');
    setActiveTargets([workspaceRoot]);
    setSelectedItemIds(new Set());
    setExpandedContextIds(new Set());
    loadWorkspaceItems();
  }, [resetKey, workspaceRoot, defaultArchitectMessage, loadWorkspaceItems]);

  // Update chat message list when logs change
  useEffect(() => {
    if (logs && logs.length > 0) {
      const formatted = logs
        .filter(l => l.sender === 'user' || l.sender === 'assistant')
        .map(l => ({
          role: (l.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: l.message
        }));
      if (formatted.length > 0) {
        setChatMessages(formatted);
      }
    }
  }, [logs]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    
    if (inputText.length > 15000) {
      const ok = window.confirm(`Large Request Warning: Your prompt is approximately ${Math.ceil(inputText.length / 4)} tokens. Sending very large payloads can consume significant token quota and may take longer to process. Do you want to continue?`);
      if (!ok) return;
    }

    // Add user message locally
    const updated = [...chatMessages, { role: 'user', content: inputText } as const];
    setChatMessages(updated);
    
    // Scratchbook chat is unified and ephemeral, send as 'chat' space query
    onSendQuery(inputText, 'chat');
    setInputText('');
  };

  const editPreviousQuestion = () => {
    const previousUserMessage = [...chatMessages].reverse().find(message => message.role === 'user');
    if (!previousUserMessage) return;
    setInputText(previousUserMessage.content);
  };

  // --- Summarize & Push (Workspace extraction) ---
  const handleSummarizeAndPush = async () => {
    setIsExtracting(true);
    setIsExtractModalOpen(true);
    try {
      const res = await fetch(`${API_BASE_URL}/plan/workspace/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.items)) {
        setExtractedDrafts(data.items);
        onNotify?.(`Extracted ${data.items.length} proposed item(s) from Scratchbook.`, 'success');
      } else {
        throw new Error(data.error || 'Failed to extract items.');
      }
    } catch (err: any) {
      onNotify?.(`Extraction failed: ${err.message}`, 'error');
      setIsExtractModalOpen(false);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleConfirmExtraction = async () => {
    // Append drafts to current workspace items
    const updatedItems = [...workspaceItems, ...extractedDrafts];
    try {
      const res = await fetch(`${API_BASE_URL}/plan/workspace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updatedItems })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotify?.(`Successfully staged ${extractedDrafts.length} plan item(s).`, 'success');
        setIsExtractModalOpen(false);
        setExtractedDrafts([]);
        loadWorkspaceItems();
      } else {
        throw new Error(data.error || 'Failed to save items.');
      }
    } catch (err: any) {
      onNotify?.(`Failed to stage items: ${err.message}`, 'error');
    }
  };

  // --- Check Feasibility ---
  const checkFeasibility = async (item: PlanWorkspaceItem) => {
    setFeasibilityVerdicts(prev => ({
      ...prev,
      [item.id]: { verdict: '', reason: '', loading: true }
    }));
    
    try {
      const projectDescription = localStorage.getItem('matrix_project_description') || '';
      const res = await fetch(`${API_BASE_URL}/plan/workspace/feasibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectDescription,
          title: item.title,
          description: item.description,
          category: item.category
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.feasibility) {
        const result = data.feasibility;
        
        // Save the verdict on the backend item too
        const updatedItems = workspaceItems.map(it => {
          if (it.id === item.id) {
            return {
              ...it,
              feasibility: {
                verdict: result.verdict,
                reason: result.reason
              }
            };
          }
          return it;
        });
        
        await fetch(`${API_BASE_URL}/plan/workspace`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: updatedItems })
        });

        setFeasibilityVerdicts(prev => ({
          ...prev,
          [item.id]: { verdict: result.verdict, reason: result.reason, loading: false }
        }));
        
        onNotify?.(`Feasibility verdict check done for "${item.title}".`, 'success');
      } else {
        throw new Error(data.error || 'Failed feasibility check.');
      }
    } catch (err: any) {
      onNotify?.(`Feasibility check failed: ${err.message}`, 'error');
      setFeasibilityVerdicts(prev => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
    }
  };

  // --- Toggle status between draft and ready_for_crew ---
  const toggleItemStatus = async (item: PlanWorkspaceItem) => {
    const nextStatus = item.status === 'draft' ? 'ready_for_crew' : 'draft';
    const updated = workspaceItems.map(it => {
      if (it.id === item.id) {
        return { ...it, status: nextStatus };
      }
      return it;
    });
    
    try {
      const res = await fetch(`${API_BASE_URL}/plan/workspace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updated })
      });
      if (res.ok) {
        loadWorkspaceItems();
      }
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  // --- Edit Plan Item ---
  const openEditModal = (item: PlanWorkspaceItem) => {
    setEditingItem({ ...item });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    const updated = workspaceItems.map(it => {
      if (it.id === editingItem.id) {
        return editingItem;
      }
      return it;
    });

    try {
      const res = await fetch(`${API_BASE_URL}/plan/workspace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updated })
      });
      if (res.ok) {
        setIsEditModalOpen(false);
        setEditingItem(null);
        onNotify?.('Workspace item updated.', 'success');
        loadWorkspaceItems();
      }
    } catch (err: any) {
      onNotify?.(`Failed to edit item: ${err.message}`, 'error');
    }
  };

  // --- Delete Plan Item ---
  const deleteWorkspaceItem = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Plan Item',
      message: 'Are you sure you want to delete this item from the Plan Workspace? This action cannot be undone.',
      onConfirm: async () => {
        const updated = workspaceItems.filter(it => it.id !== id);
        try {
          const res = await fetch(`${API_BASE_URL}/plan/workspace`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: updated })
          });
          if (res.ok) {
            onNotify?.('Item deleted from Plan Workspace.', 'info');
            loadWorkspaceItems();
            // Clear selection
            setSelectedItemIds(prev => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
        } catch (err: any) {
          onNotify?.(`Failed to delete item: ${err.message}`, 'error');
        }
      }
    });
  };

  // --- Push to CREW ---
  const handlePushToCrewTrigger = () => {
    if (selectedItemIds.size === 0) {
      onNotify?.('Please select at least one item to push to CREW.', 'warning');
      return;
    }
    
    setIsPushDiffModalOpen(true);
  };

  const executePushToCrew = async () => {
    setIsPushing(true);
    const selectedItemsList = workspaceItems.filter(it => selectedItemIds.has(it.id));
    try {
      const res = await fetch(`${API_BASE_URL}/crew/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          items: selectedItemsList
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onNotify?.(data.message || 'Plan workspace pushed to CREW context.', 'success');
        setIsPushDiffModalOpen(false);
        setSelectedItemIds(new Set());
        loadWorkspaceItems();
      } else {
        throw new Error(data.error || 'Failed to sync to CREW.');
      }
    } catch (err: any) {
      onNotify?.(`Sync to CREW failed: ${err.message}`, 'error');
    } finally {
      setIsPushing(false);
    }
  };

  const getExportMarkdown = () => {
    const selectedItemsList = workspaceItems.filter(it => selectedItemIds.has(it.id));
    let md = `=== PLAN WORKSPACE ITEMS STAGED FOR REVIEW ===\n`;
    selectedItemsList.forEach((it, idx) => {
      md += `${idx + 1}. Title: ${it.title}\n   Category: ${it.category}\n   Description: ${it.description}\n`;
      if (it.context) {
        md += `   Origin context: ${it.context}\n`;
      }
    });
    md += `==============================================\n`;
    return md;
  };

  const toggleSelectAll = () => {
    if (selectedItemIds.size === workspaceItems.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(workspaceItems.map(it => it.id)));
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpandContext = (id: string) => {
    setExpandedContextIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // --- Build Loop: PLAN-side trace cards ---
  const loadBuildLoop = useCallback(async () => {
    setLoopLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/plan/drift`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'drift route failed');
      setDriftItems(Array.isArray(data.report?.items) ? data.report.items : []);
    } catch (err: any) {
      onNotify?.(`Could not load Build Loop data: ${err.message}`, 'error');
      setDriftItems([]);
    } finally {
      setLoopLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    if (rightView === 'loop' && activeProject) loadBuildLoop();
  }, [rightView, loadBuildLoop, activeProject]);

  const enrichCandidates = driftItems.filter(
    item => item.results.length > 0 && !item.results.some(r => r.type === 'file_exists')
  );

  const runEnrichment = async () => {
    if (enrichCandidates.length === 0) return;
    setEnriching(true);
    const diff: Array<{ taskId: string; title: string; added: AcceptanceCriterion[] }> = [];
    try {
      for (const item of enrichCandidates) {
        try {
          const res = await fetch(
            `${API_BASE_URL}/plan/items/${encodeURIComponent(item.taskId)}/criteria/enrich`,
            { method: 'POST' }
          );
          const data = await res.json();
          if (res.ok && data.success && Array.isArray(data.added) && data.added.length > 0) {
            diff.push({ taskId: item.taskId, title: item.title, added: data.added });
          }
        } catch {
          // Skip
        }
      }
      setEnrichDiff(diff);
      const totalAdded = diff.reduce((sum, entry) => sum + entry.added.length, 0);
      onNotify?.(
        totalAdded > 0
          ? `Enriched ${diff.length} item(s) with ${totalAdded} workspace file criteria. Review the diff below.`
          : 'No new workspace file criteria were found to add.',
        totalAdded > 0 ? 'success' : 'info'
      );
      await loadBuildLoop();
    } finally {
      setEnriching(false);
    }
  };

  const discardEnrichedCriterion = async (taskId: string, criterionId: string) => {
    try {
      const current = await fetch(`${API_BASE_URL}/plan/items/${encodeURIComponent(taskId)}/criteria`);
      const currentData = await current.json();
      if (!current.ok || !currentData.success) throw new Error(currentData.error || 'criteria fetch failed');
      const remaining = (currentData.criteria as AcceptanceCriterion[]).filter(c => c.id !== criterionId);
      const res = await fetch(`${API_BASE_URL}/plan/items/${encodeURIComponent(taskId)}/criteria`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria: remaining })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'criteria patch failed');
      setEnrichDiff(prev => prev
        .map(entry => entry.taskId === taskId
          ? { ...entry, added: entry.added.filter(c => c.id !== criterionId) }
          : entry)
        .filter(entry => entry.added.length > 0));
      onNotify?.('Removed enriched criterion.', 'info');
      await loadBuildLoop();
    } catch (err: any) {
      onNotify?.(`Could not remove criterion: ${err.message}`, 'error');
    }
  };

  const confirmComplete = async (taskId: string) => {
    if (!onConfirmComplete) return;
    setConfirmingId(taskId);
    try {
      await onConfirmComplete(taskId);
      await loadBuildLoop();
    } finally {
      setConfirmingId(null);
    }
  };

  const runWhatsLeft = async () => {
    setWhatsLeftLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/plan/whats-left`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'whats-left route failed');
      setWhatsLeft(data.report as WhatsLeftReport);
      setWhatsLeftExport(Boolean(data.exportAllowed));
      const report = data.report as WhatsLeftReport;
      onNotify?.(
        `What's Left: ${report.items.length} open item(s).`,
        'success'
      );
    } catch (err: any) {
      onNotify?.(`Could not run What's Left: ${err.message}`, 'error');
    } finally {
      setWhatsLeftLoading(false);
    }
  };

  const exportWhatsLeftMarkdown = async () => {
    if (!whatsLeft) return;
    const lines = [
      `# What's Left`,
      ``,
      `Generated ${whatsLeft.generatedAt} — ${whatsLeft.items.length} of ${whatsLeft.total} open item(s).`,
      ``,
      ...whatsLeft.items.map((item, idx) => `${idx + 1}. **${item.title}** \`${item.status}\`${item.category ? ` _(${item.category})_` : ''}\n   - ${item.reason}`)
    ];
    const content = lines.join('\n');

    try {
      const scanRes = await fetch(`${API_BASE_URL}/security/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content })
      });
      if (scanRes.ok) {
        const scanData = await scanRes.json();
        if (scanData.secrets && scanData.secrets.length > 0) {
          const proceed = window.confirm(`WARNING: Secrets detected in export payload:\n${scanData.secrets.map((s: any) => `- ${s.secretType}`).join('\n')}\n\nExport anyway?`);
          if (!proceed) {
            onNotify?.('Export cancelled by user.', 'info');
            return;
          }
        }
      }
    } catch (err: any) {
      console.warn('Secret scan failed before export:', err);
    }

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'whats-left.md';
    anchor.click();
    URL.revokeObjectURL(url);
    onNotify?.('Exported whats-left.md', 'success');
  };

  const tracedItems = driftItems.filter(item => item.latestTrace);

  const getCategoryColor = (cat: string) => {
    switch ((cat || '').toLowerCase()) {
      case 'frontend': return 'border-cyan-800 text-cyan-300 bg-cyan-950/40';
      case 'backend': return 'border-purple-800 text-purple-300 bg-purple-950/40';
      case 'testing': return 'border-green-800 text-green-300 bg-green-950/40';
      case 'security': return 'border-red-800 text-red-300 bg-red-950/40';
      case 'docs': return 'border-amber-800 text-amber-300 bg-amber-950/40';
      case 'infra': return 'border-blue-800 text-blue-300 bg-blue-950/40';
      default: return 'border-forge-dark text-forge-dim bg-forge-very-dark';
    }
  };

  const getFeasibilityVerdictClass = (verd: string) => {
    switch (verd) {
      case 'feasible': return 'border-forge-neon text-forge-neon bg-green-950/20';
      case 'needs_clarification': return 'border-amber-600 text-amber-300 bg-amber-950/20';
      case 'potential_conflict': return 'border-red-600 text-red-400 bg-red-950/20';
      default: return 'border-forge-dark text-forge-dim';
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-forge-very-dark text-forge-text font-mono h-full relative">
      {/* Left Pane: Architect Chat (Scratchbook) */}
      <div
        role="region"
        aria-label="Scratchbook Panel"
        className="flex flex-col border-b lg:border-b-0 lg:border-r border-forge-dark bg-forge-panel-bg overflow-hidden"
        style={{ flex: '1 1 44%', minWidth: 320, maxWidth: 760 }}
      >
        {!activeProject ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-forge-very-dark/30 font-mono h-full">
            <div className="max-w-md w-full border border-forge-dark bg-forge-panel-bg p-8 rounded shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-forge-neon animate-pulse" />
              <div className="text-center space-y-6">
                <div className="inline-flex items-center justify-center p-3 border border-forge-dark rounded bg-forge-very-dark mb-2">
                  <Sparkles size={32} className="text-forge-neon" />
                </div>
                
                <h2 className="text-sm font-bold text-forge-text tracking-widest uppercase">
                  Plan
                </h2>

                <p className="text-xs text-forge-text/80 leading-relaxed border-t border-b border-forge-dark py-4">
                  No project selected yet. Pick a project from the left sidebar, or use "Add project" in the header to create one — then start scoping here.
                </p>

                <div className="text-[10px] text-forge-dim">
                  The Scratchbook opens as soon as a project is active.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="forge-panel-header flex items-center justify-between shrink-0">
              <span className="forge-panel-title flex items-center gap-1.5">
                <Sparkles size={14} className="text-forge-neon" />
                <span>Scratchbook</span>
              </span>
              <span className="forge-status-chip forge-status-chip-success">Continuous Ideation</span>
            </div>

            {/* Messages feed */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 flex flex-col justify-end">
              <div className="space-y-3 overflow-y-auto max-h-full pr-1">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`forge-chat-bubble p-2.5 text-[11px] leading-relaxed max-w-[90%] ${
                      msg.role === 'user'
                        ? 'text-forge-text ml-auto'
                        : 'forge-chat-bubble-assistant text-forge-text'
                    }`}
                  >
                    <div className="text-[9px] text-forge-dim font-bold mb-1">
                      {msg.role === 'user' ? 'You' : 'Assistant'}
                    </div>
                    <div className="whitespace-pre-wrap" style={{ overflowWrap: 'anywhere' }}>{msg.content}</div>
                  </div>
                ))}
                {isStreaming && (
                  <div className="forge-chat-bubble forge-chat-bubble-assistant p-2.5 text-[11px] max-w-[90%] animate-pulse">
                    <div className="text-[9px] text-forge-dim font-bold mb-1">Assistant is drafting</div>
                    <div className="whitespace-pre-wrap" style={{ overflowWrap: 'anywhere' }}>{streamingContent || 'Thinking...'}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Summarize & Push Button + Composer */}
            <div className="p-3 border-t border-forge-dark bg-forge-panel-bg flex flex-col gap-2 shrink-0">
              {chatMessages.length <= 1 && (
                <div className="grid grid-cols-1 gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      const query = 'Analyze the existing codebase in this repository. Produce an architectural summary, list key modules, files, dependencies, and propose a structured roadmap for tinkering or extending features.';
                      setInputText(query);
                    }}
                    className="text-left text-[10px] font-bold border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 rounded px-2.5 py-1.5 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <FileCode size={12} className="text-cyan-400" />
                      <span>Analyze &amp; Map Existing Codebase</span>
                    </div>
                    <span className="text-[9px] uppercase tracking-wider text-cyan-400/80">Brownfield</span>
                  </button>
                  {[
                    'Turn my rough idea into a small first release with testable acceptance criteria.',
                    'Review this repo and suggest the safest high-impact improvement.',
                    'Help me scope one feature into frontend, backend, and test tasks.'
                  ].map(prompt => (
                    <button key={prompt} type="button" onClick={() => setInputText(prompt)} className="text-left text-[9px] border border-forge-dark rounded px-2 py-1 text-forge-dim hover:text-forge-text hover:border-forge-neon">
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSummarizeAndPush}
                  disabled={isStreaming || chatMessages.length <= 1}
                  title={
                    isStreaming
                      ? 'Wait for the current response to finish.'
                      : chatMessages.length <= 1
                        ? 'Chat with the Scratchbook first — then summarize the conversation into plan items.'
                        : 'Extract structured plan items from this conversation.'
                  }
                  className="w-full text-center py-2 px-3 bg-forge-neon text-black font-bold uppercase rounded hover:bg-white disabled:opacity-40 disabled:pointer-events-none transition-colors text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles size={13} />
                  <span>Summarize &amp; Push to Workspace</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-[9px] text-forge-dim">Ephemeral Chat Scratchpad</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={editPreviousQuestion}
                    disabled={isStreaming || !chatMessages.some(message => message.role === 'user')}
                    className="forge-secondary-button disabled:opacity-40"
                    title="Edit previous question"
                  >
                    <Pencil size={10} />
                  </button>
                  {isStreaming && (
                    <button
                      type="button"
                      onClick={onAbort}
                      className="forge-stop-button flex items-center gap-1 animate-pulse"
                      title="Stop current activity"
                    >
                      <Square size={9} />
                      <span>STOP</span>
                    </button>
                  )}
                </div>
              </div>
              
              <div className="forge-composer flex flex-col gap-2">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Brainstorm features, describe endpoints, outline databases..."
                  className="forge-input text-[12px] bg-forge-very-dark border-forge-dark text-forge-text"
                  style={{
                    minHeight: 120,
                    maxHeight: 220,
                    resize: 'vertical',
                    overflowY: 'auto',
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere'
                  }}
                  disabled={isStreaming}
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] text-forge-dim font-bold uppercase tracking-wider flex items-center gap-2">
                    <span>{inputText.length > 0 ? `${inputText.length} chars` : 'ready'}</span>
                    {inputText.length > 0 && (
                      <span className="text-forge-neon">
                        ~{Math.ceil(inputText.length / 4)} tokens
                        {(() => {
                          const tokens = Math.ceil(inputText.length / 4);
                          const pricing = getPricingForModel(activeModel);
                          const cost = tokens * pricing.input;
                          if (cost === 0) return ' (Free)';
                          return ` ($${cost.toFixed(5)})`;
                        })()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {voice.isSupported && (
                      <button
                        onClick={() => voice.isListening ? voice.stopListening() : voice.startListening()}
                        disabled={isStreaming}
                        className={`border px-2.5 rounded text-[10px] font-bold disabled:opacity-50 ${
                          voice.isListening
                            ? 'border-red-500 text-red-400 bg-forge-very-dark'
                            : 'border-forge-dark text-forge-neon bg-forge-very-dark hover:border-forge-neon'
                        }`}
                        type="button"
                        title={voice.isListening ? 'Stop voice input' : 'Start voice input'}
                      >
                        {voice.isListening ? <MicOff size={12} /> : <Mic size={12} />}
                      </button>
                    )}
                    <button
                      onClick={handleSend}
                      disabled={isStreaming || !inputText.trim()}
                      className="forge-btn text-[11px] px-3.5 flex items-center gap-1 font-bold disabled:opacity-50"
                      type="button"
                    >
                      <Send size={11} />
                      <span>SEND</span>
                    </button>
                  </div>
                </div>
                {voice.error && <span className="text-[9px] text-red-400 self-center">{voice.error}</span>}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right Pane: Plan Workspace / Build Loop */}
      <div
        role="region"
        aria-label="Plan Workspace Panel"
        className="flex flex-col bg-forge-panel-bg overflow-hidden border-t lg:border-t-0 lg:border-l border-forge-dark"
        style={{ flex: '1 1 56%', minWidth: 320 }}
      >
        {isLowCapacityModel(activeModel) && (rightView === 'loop' || rightView === 'draft') && (
          <div className="bg-amber-950/40 border-b border-amber-600/40 px-3 py-1.5 flex items-start gap-2 text-[10px] text-amber-200 font-mono select-none">
            <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong>Low-capacity model active ({activeModel.replace('ollama:', '')}).</strong> Complex Build Loop tasks (like drift detection or criteria generation) may produce lower quality results. Recommended: Claude Sonnet, Gemini Pro, DeepSeek V3, or GPT-4o.
            </div>
          </div>
        )}
        <div className="forge-panel-header flex items-center justify-between shrink-0">
          <div className="forge-tabs text-[10px] font-bold">
            <button
              type="button"
              onClick={() => setRightView('draft')}
              className={`forge-tab flex items-center gap-1 ${rightView === 'draft' ? 'forge-tab-active' : ''}`}
            >
              <FileText size={10} />
              <span>Plan workspace</span>
            </button>
            <button
              type="button"
              onClick={() => setRightView('loop')}
              className={`forge-tab flex items-center gap-1 ${rightView === 'loop' ? 'forge-tab-active' : ''}`}
            >
              <GitBranch size={10} />
              <span>Build loop</span>
            </button>
            <button
              type="button"
              onClick={() => setRightView('docs')}
              className={`forge-tab flex items-center gap-1 ${rightView === 'docs' ? 'forge-tab-active' : ''}`}
            >
              <FileText size={10} />
              <span>Docs autopilot</span>
            </button>
            <button
              type="button"
              onClick={() => setRightView('cost')}
              className={`forge-tab flex items-center gap-1 ${rightView === 'cost' ? 'forge-tab-active' : ''}`}
            >
              <Terminal size={10} />
              <span>Cost guard</span>
            </button>
            <button
              type="button"
              onClick={() => setRightView('utilities')}
              className={`forge-tab flex items-center gap-1 ${rightView === 'utilities' ? 'forge-tab-active' : ''}`}
            >
              <FileText size={10} />
              <span>Founder & Agency</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {rightView === 'draft' ? (
              <>
                <button
                  onClick={() => setIsGithubModalOpen(true)}
                  className="text-[9px] border border-forge-dark px-2 py-0.5 rounded text-forge-dim hover:text-forge-text flex items-center gap-1 cursor-pointer"
                  type="button"
                >
                  <Globe size={10} />
                  <span>GitHub Issues</span>
                </button>
                <button
                  onClick={handlePushToCrewTrigger}
                  disabled={selectedItemIds.size === 0}
                  className="forge-btn flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  type="button"
                >
                  <Download size={10} />
                  <span>Push to CREW ({selectedItemIds.size})</span>
                </button>
              </>
            ) : rightView === 'loop' ? (
              <>
                <button
                  onClick={runWhatsLeft}
                  disabled={whatsLeftLoading}
                  className="text-[9px] bg-forge-neon text-black px-2 py-0.5 rounded font-bold hover:bg-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  type="button"
                  title="AI-prioritized list of what's left, capped by your tier"
                >
                  <FileText size={10} />
                  <span>{whatsLeftLoading ? 'WORKING…' : "WHAT'S LEFT"}</span>
                </button>
                <button
                  onClick={loadBuildLoop}
                  disabled={loopLoading}
                  className="text-[9px] border border-forge-dark px-2 py-0.5 rounded text-forge-dim hover:text-forge-text flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  type="button"
                >
                  <RefreshCw size={10} className={loopLoading ? 'animate-spin' : ''} />
                  <span>{loopLoading ? 'LOADING' : 'REFRESH'}</span>
                </button>
              </>
            ) : null}
          </div>
        </div>

        {rightView === 'draft' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Multi-Repo target workspaces configurator */}
            <div className="border-b border-forge-dark bg-forge-very-dark px-3 py-2 flex flex-col gap-1.5 text-[11px] select-none shrink-0">
              <div 
                className="flex justify-between items-center cursor-pointer hover:text-forge-text"
                onClick={() => setShowRepoManager(!showRepoManager)}
              >
                <span className="font-bold text-xs text-forge-text uppercase tracking-wider truncate">
                  Workspace targets ({activeTargets.length} active)
                </span>
                <span className="text-forge-dim font-bold">{showRepoManager ? 'Hide' : 'Show'}</span>
              </div>

              {showRepoManager && (
                <div className="grid gap-2 mt-1.5 border-t border-forge-dark pt-1.5 font-mono" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 34%)' }}>
                  <div className="flex flex-col gap-1 max-h-[72px] overflow-y-auto pr-1" style={{ minWidth: 0 }}>
                    <label className="flex items-center gap-2 text-[11px] text-forge-text" style={{ minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={activeTargets.includes(workspaceRoot)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setActiveTargets(prev => [...prev, workspaceRoot]);
                          } else {
                            setActiveTargets(prev => prev.filter(p => p !== workspaceRoot));
                          }
                        }}
                        className="accent-forge-neon cursor-pointer"
                      />
                      <span className="truncate font-bold text-forge-text" title={workspaceRoot}>Primary: {workspaceRoot}</span>
                    </label>

                    {workspacePaths.map((pathItem, idx) => (
                      <div key={idx} className="flex justify-between items-center text-[10px] gap-2" style={{ minWidth: 0 }}>
                        <label className="flex items-center gap-2 truncate flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={activeTargets.includes(pathItem)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setActiveTargets(prev => [...prev, pathItem]);
                              } else {
                                setActiveTargets(prev => prev.filter(p => p !== pathItem));
                              }
                            }}
                            className="accent-forge-neon cursor-pointer"
                          />
                          <span className="truncate text-forge-text" title={pathItem}>{pathItem}</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = workspacePaths.filter(p => p !== pathItem);
                            onUpdateWorkspacePaths?.(updated);
                            setActiveTargets(prev => prev.filter(p => p !== pathItem));
                          }}
                          className="text-forge-red hover:text-forge-text font-bold text-[9px]"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2" style={{ minWidth: 0 }}>
                    <input
                      type="text"
                      value={newRepoPath}
                      onChange={(e) => setNewRepoPath(e.target.value)}
                      placeholder="Absolute directory path..."
                      className="forge-input text-[10px] bg-forge-very-dark border-forge-dark flex-1 px-1.5 py-0.5 text-forge-neon"
                      style={{ minWidth: 0 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newRepoPath.trim()) {
                          const cleanPath = newRepoPath.trim().replace(/\\/g, '/');
                          if (workspaceRoot === cleanPath || workspacePaths.includes(cleanPath)) return;
                          const updated = [...workspacePaths, cleanPath];
                          onUpdateWorkspacePaths?.(updated);
                          setActiveTargets(prev => [...prev, cleanPath]);
                          setNewRepoPath('');
                        }
                      }}
                      className="forge-btn text-[9px] px-2 py-0.5 font-bold cursor-pointer"
                    >
                      Add repo
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* List Controls */}
            {workspaceItems.length > 0 && (
              <div className="px-4 py-2 border-b border-forge-dark bg-forge-very-dark/50 flex justify-between items-center text-[10px] select-none shrink-0">
                <label className="flex items-center gap-2 cursor-pointer text-forge-dim hover:text-forge-text">
                  <input
                    type="checkbox"
                    checked={workspaceItems.length > 0 && selectedItemIds.size === workspaceItems.length}
                    onChange={toggleSelectAll}
                    className="accent-forge-neon cursor-pointer"
                  />
                  <span>Select All ({selectedItemIds.size}/{workspaceItems.length})</span>
                </label>
                <span className="text-forge-dim">PERSISTENT STAGING AREA</span>
              </div>
            )}

            {/* Staging List Content */}
            <div aria-label="Staged plan items" className="flex-1 overflow-y-auto p-4 space-y-3">
              {workspaceItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-forge-dim py-20 border border-dashed border-forge-dark rounded">
                  <AlertCircle size={20} className="mb-2 text-forge-dim" />
                  <span className="text-xs font-bold uppercase tracking-wider">Plan Workspace is Empty</span>
                  <span className="text-[10px] mt-1 max-w-[280px]">
                    Use "Summarize &amp; Push to Workspace" on Scratchbook logs to extract and stage items here.
                  </span>
                </div>
              ) : (
                workspaceItems.map(item => {
                  const isSelected = selectedItemIds.has(item.id);
                  const isExpanded = expandedContextIds.has(item.id);
                  const fVerdict = feasibilityVerdicts[item.id];
                  
                  return (
                    <div
                      key={item.id}
                      className={`border rounded p-3 bg-black/40 transition-all ${
                        isSelected ? 'border-forge-neon' : 'border-forge-dark hover:border-forge-dim'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectItem(item.id)}
                          className="mt-1 accent-forge-neon cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          {/* Title and badges */}
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-bold text-forge-text select-text break-words pr-2">
                              {item.title}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0 select-none">
                              <span className={`text-[8px] uppercase border px-1.5 py-0.5 rounded font-bold ${getCategoryColor(item.category)}`}>
                                {item.category}
                              </span>
                              <button
                                onClick={() => toggleItemStatus(item)}
                                className={`text-[8px] uppercase px-1.5 py-0.5 rounded font-bold border cursor-pointer hover:bg-forge-dark ${
                                  item.status === 'ready_for_crew'
                                    ? 'border-forge-neon text-forge-neon'
                                    : 'border-forge-dark text-forge-dim'
                                }`}
                                title="Click to toggle status"
                                aria-label={`Toggle status for ${item.title}`}
                              >
                                {item.status === 'ready_for_crew' ? 'Ready for Crew' : 'Draft'}
                              </button>
                            </div>
                          </div>

                          {/* Description */}
                          <p className="text-[11px] text-forge-dim mt-1.5 select-text leading-relaxed">
                            {item.description}
                          </p>

                          {/* Feasibility Verdict */}
                          {fVerdict && (
                            <div className={`mt-2 border rounded p-1.5 text-[9px] flex items-start gap-1.5 select-text ${getFeasibilityVerdictClass(fVerdict.verdict)}`}>
                              {fVerdict.loading ? (
                                <span className="animate-pulse">Checking Feasibility...</span>
                              ) : (
                                <>
                                  <span className="font-bold uppercase tracking-wider">
                                    {fVerdict.verdict === 'feasible' && '✓ Feasible'}
                                    {fVerdict.verdict === 'needs_clarification' && '⚠ Clarify'}
                                    {fVerdict.verdict === 'potential_conflict' && '✗ Conflict'}
                                  </span>
                                  <span className="text-forge-text opacity-90">{fVerdict.reason}</span>
                                </>
                              )}
                            </div>
                          )}

                          {/* Action Bar */}
                          <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-forge-very-dark text-[9px] font-bold">
                            <div className="flex items-center gap-2">
                              {!fVerdict && (
                                <button
                                  type="button"
                                  onClick={() => checkFeasibility(item)}
                                  className="text-cyan-400 hover:text-white flex items-center gap-0.5 border border-cyan-800/40 rounded px-1.5 py-0.5 cursor-pointer"
                                >
                                  Check Feasibility
                                </button>
                              )}
                              {item.context && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpandContext(item.id)}
                                  className="text-forge-dim hover:text-white flex items-center gap-0.5 cursor-pointer"
                                >
                                  <span>Context</span>
                                  {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditModal(item)}
                                className="text-forge-dim hover:text-forge-neon flex items-center gap-0.5 cursor-pointer"
                                aria-label={`Edit staged item ${item.title}`}
                              >
                                <Edit size={10} />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteWorkspaceItem(item.id)}
                                className="text-red-500 hover:text-red-400 flex items-center gap-0.5 cursor-pointer"
                                aria-label={`Delete staged item ${item.title}`}
                              >
                                <Trash2 size={10} />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>

                          {/* Origin Context */}
                          {isExpanded && item.context && (
                            <div className="mt-2 p-2 bg-black/60 border border-forge-dark rounded text-[9px] text-forge-dim select-text whitespace-pre-wrap max-h-40 overflow-y-auto">
                              {item.context}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {rightView === 'loop' && (
          <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3">
            {/* What's Left report */}
            {whatsLeft && (
              <div className="p-2.5 bg-black bg-opacity-35 border border-forge-neon border-opacity-40 rounded text-[10px] font-mono">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-forge-neon uppercase tracking-wide flex items-center gap-1.5">
                    <FileText size={11} /> What's Left ({whatsLeft.items.length}/{whatsLeft.total})
                  </span>
                  <div className="flex items-center gap-1.5">
                    {whatsLeft.usedLlm && <span className="text-[8px] uppercase border border-forge-neon text-forge-neon rounded px-1">AI ranked</span>}
                    {whatsLeftExport ? (
                      <button type="button" onClick={exportWhatsLeftMarkdown} className="text-[8px] border border-forge-dark text-forge-dim hover:text-forge-text px-1.5 py-0.5 rounded">
                        EXPORT MD
                      </button>
                    ) : (
                      <span className="text-[8px] text-forge-dim" title="Founder tier exports Markdown">MD ⭢ Founder</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
                  {whatsLeft.items.map((item, idx) => (
                    <div key={item.taskId} className="flex items-start gap-2 border border-forge-dark rounded p-1.5">
                      <span className="text-forge-dim w-4 shrink-0">{idx + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-forge-text truncate font-bold">{item.title}</span>
                          <span className={`text-[8px] uppercase border rounded px-1 shrink-0 ${driftClass(item.status)}`}>{item.status.replace('_', ' ')}</span>
                        </div>
                        <div className="text-forge-dim">{item.reason}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {whatsLeft.truncated && (
                  <div className="mt-2 text-[9px] text-amber-300 border-t border-forge-dark pt-1.5">
                    {whatsLeft.total - whatsLeft.items.length} more item(s) hidden by your tier cap. Upgrade to see all.
                  </div>
                )}
              </div>
            )}

            {/* Phase 2 enrichment banner */}
            {!enrichDismissed && enrichCandidates.length > 0 && (
              <div className="p-2.5 bg-forge-very-dark border border-cyan-700 rounded text-[10px] font-mono">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-cyan-300 uppercase tracking-wide flex items-center gap-1.5">
                    <Layers size={11} /> Phase 2 Enrichment Available
                  </span>
                  <button
                    type="button"
                    onClick={() => setEnrichDismissed(true)}
                    className="text-cyan-600 hover:text-cyan-400"
                    title="Dismiss"
                  >
                    <X size={11} />
                  </button>
                </div>
                <p className="text-forge-text mb-2 leading-relaxed">
                  {enrichCandidates.length} plan item(s) have abstract Phase 1 criteria with no concrete
                  workspace file paths yet. Enrich them with real file references scanned from the workspace.
                </p>
                <button
                  type="button"
                  onClick={runEnrichment}
                  disabled={enriching}
                  className="text-[9px] bg-cyan-700 text-black px-2.5 py-1 rounded font-bold hover:bg-cyan-400 flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw size={10} className={enriching ? 'animate-spin' : ''} />
                  <span>{enriching ? 'ENRICHING...' : `ENRICH ${enrichCandidates.length} ITEM(S)`}</span>
                </button>
              </div>
            )}

            {/* Enrichment diff for review */}
            {enrichDiff.length > 0 && (
              <div className="p-2.5 bg-black bg-opacity-35 border border-cyan-800 rounded text-[10px] font-mono">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-cyan-300 uppercase">Enrichment Diff (review &amp; edit)</span>
                  <button
                    type="button"
                    onClick={() => setEnrichDiff([])}
                    className="text-[9px] border border-forge-dark px-2 py-0.5 rounded text-forge-dim hover:text-forge-text"
                  >
                    KEEP ALL
                  </button>
                </div>
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {enrichDiff.map(entry => (
                    <div key={entry.taskId} className="border border-forge-dark rounded p-1.5">
                      <div className="text-forge-text font-bold truncate mb-1">{entry.title}</div>
                      <div className="space-y-1">
                        {entry.added.map(crit => (
                          <div key={crit.id} className="flex items-center justify-between gap-2">
                            <span className="text-forge-neon truncate">
                              <span className="text-cyan-500">+ {crit.type}:</span> {crit.target}
                            </span>
                            <button
                              type="button"
                              onClick={() => discardEnrichedCriterion(entry.taskId, crit.id)}
                              className="text-red-500 hover:text-red-400 shrink-0"
                              title="Discard this enriched criterion"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trace cards */}
            <div className="flex items-center justify-between text-[10px] uppercase font-bold text-forge-neon tracking-wide">
              <span className="flex items-center gap-1.5"><GitBranch size={11} /> Execution Traces</span>
              <span className="text-forge-dim">
                {tracedItems.length} traced{tasks.length > 0 ? ` / ${tasks.length} plan item(s)` : ''}
              </span>
            </div>

            {loopLoading && tracedItems.length === 0 && (
              <div className="text-[10px] text-forge-dim text-center py-6 animate-pulse">Loading Build Loop…</div>
            )}

            {!loopLoading && tracedItems.length === 0 && (
              <div className="text-[10px] text-forge-dim text-center py-6 border border-dashed border-forge-dark rounded">
                No execution traces yet. Send a plan item to the FORGE agent from FLOW — a trace is captured after each run.
              </div>
            )}

            {tracedItems.map(item => {
              const trace = item.latestTrace as ExecutionTrace;
              const results: CriterionResult[] = trace.criteriaResults?.length ? trace.criteriaResults : item.results;
              const canComplete = trace.suggestedStatus === 'done' && item.status !== 'complete';
              return (
                <div key={item.taskId} className={`border rounded bg-black bg-opacity-30 text-[10px] font-mono ${trace.mode === 'demo' ? 'border-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.12)]' : 'border-forge-dark'}`}>
                  <div className="flex items-center justify-between gap-2 p-2 border-b border-forge-dark">
                    <span className="text-forge-text font-bold truncate">
                      {trace.mode === 'demo' && <span className="text-emerald-400 mr-2">DEMO PROOF</span>}
                      {item.title}
                    </span>
                    <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border shrink-0 ${driftClass(item.status)}`}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="p-2 space-y-2">
                    <div className="text-forge-text leading-relaxed">{trace.summary}</div>

                    {results.length > 0 && (
                      <div className="space-y-0.5">
                        <div className="text-[9px] text-forge-dim uppercase font-bold">Acceptance Criteria</div>
                        {results.map(result => (
                          <div key={result.criterionId} className="flex items-start gap-1.5">
                            <span className={`font-bold ${criterionStatusClass(result.status)}`}>
                              {result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '•'}
                            </span>
                            <span className="text-forge-text truncate">
                              <span className="text-forge-dim">{result.type}</span> — {result.evidence}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {trace.filesChanged?.length > 0 && (
                      <div>
                        <div className="text-[9px] text-forge-dim uppercase font-bold flex items-center gap-1"><FileCode size={9} /> Files Changed ({trace.filesChanged.length})</div>
                        <div className="max-h-[70px] overflow-y-auto space-y-0.5 mt-0.5">
                          {trace.filesChanged.map((file, idx) => (
                            <div key={`${file}-${idx}`} className="text-forge-neon truncate">{file}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {trace.commandsRun?.length > 0 && (
                      <div>
                        <div className="text-[9px] text-forge-dim uppercase font-bold flex items-center gap-1"><Terminal size={9} /> Commands Run ({trace.commandsRun.length})</div>
                        <div className="max-h-[70px] overflow-y-auto space-y-0.5 mt-0.5">
                          {trace.commandsRun.map((cmd, idx) => (
                            <div key={`${cmd}-${idx}`} className="text-amber-300 truncate">$ {cmd}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-forge-dark">
                      <span className="text-[9px] text-forge-dim">
                        Suggested: <span className="text-forge-text font-bold uppercase">{trace.suggestedStatus}</span>
                      </span>
                      {canComplete && onConfirmComplete && (
                        <button
                          type="button"
                          onClick={() => confirmComplete(item.taskId)}
                          disabled={confirmingId === item.taskId}
                          className="text-[9px] bg-forge-neon text-black px-2 py-0.5 rounded font-bold hover:bg-white flex items-center gap-1 disabled:opacity-50"
                        >
                          <CheckCircle size={10} />
                          <span>{confirmingId === item.taskId ? 'CONFIRMING...' : 'CONFIRM COMPLETE'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rightView === 'docs' && (
          <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-4">
            {/* Header/Description */}
            <div className="p-3 border border-forge-dark bg-black/40 rounded flex flex-col gap-1.5 select-text font-mono">
              <span className="text-xs font-bold text-forge-neon uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={12} /> Docs Autopilot Workspace
              </span>
              <p className="text-[10px] text-forge-dim leading-relaxed">
                Generate and maintain project-level documentation compiled automatically from your codebase workspace signals.
              </p>
            </div>

            {/* Generator Controls */}
            <div className="border border-forge-dark bg-black/20 rounded p-3 space-y-3 font-mono">
              <span className="text-[10px] font-bold text-forge-text uppercase tracking-wider">Create New Documentation</span>
              
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-forge-dim uppercase">Select Template</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="forge-input text-[11px] bg-forge-very-dark border-forge-dark px-2 py-1 text-forge-text focus:outline-none"
                >
                  {docTemplates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name || t.id}{t.requiredTier ? ` (${String(t.requiredTier).toUpperCase()})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Template details */}
              {(() => {
                const activeTpl = docTemplates.find(t => t.id === selectedTemplateId);
                if (!activeTpl) return null;
                return (
                  <div className="space-y-2">
                    <p className="text-[10px] text-forge-dim italic select-text pr-1">{activeTpl.description}</p>
                    <div className="flex gap-2">
                      <div className="flex-1 flex flex-col gap-0.5">
                        <label className="text-[9px] text-forge-dim uppercase">Save Path</label>
                        <input
                          type="text"
                          value={docsTargetFolder}
                          onChange={(e) => setDocsTargetFolder(e.target.value)}
                          placeholder=".kryleos/docs"
                          className="forge-input text-[11px] bg-forge-very-dark border-forge-dark px-2 py-1 text-forge-neon focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleGenerateDoc}
                        disabled={generatingDoc}
                        className="forge-btn shrink-0 self-end text-[10px] py-1 px-3 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                      >
                        {generatingDoc ? 'GENERATING...' : 'GENERATE'}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Saved Docs workspace (Patching / Updating) */}
            <div className="border border-forge-dark bg-black/20 rounded p-3 space-y-3 font-mono">
              <span className="text-[10px] font-bold text-forge-text uppercase tracking-wider">Maintain Existing Documentation</span>
              
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-forge-dim uppercase">Select Document</label>
                {docPathsList.length === 0 ? (
                  <span className="text-[10px] text-forge-dim italic p-1 border border-forge-dark border-dashed rounded text-center">
                    No documents found in target folder. Generate one above first.
                  </span>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={selectedDocPath}
                      onChange={(e) => setSelectedDocPath(e.target.value)}
                      className="forge-input text-[11px] bg-forge-very-dark border-forge-dark px-2 py-1 text-forge-text flex-1 focus:outline-none"
                    >
                      {docPathsList.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handlePatchDoc}
                      disabled={patchingDoc || !selectedDocPath}
                      className="text-[10px] border border-cyan-800 text-cyan-400 hover:text-white px-2 py-1 rounded font-bold disabled:opacity-40"
                    >
                      {patchingDoc ? 'PATCHING...' : 'PATCH'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Content Preview and Save Document */}
            {docContent && (
              <div className="border border-forge-dark bg-black/40 rounded p-3 flex flex-col gap-2 font-mono flex-1 min-h-[300px]">
                <div className="flex justify-between items-center border-b border-forge-very-dark pb-1.5 select-none">
                  <span className="text-[10px] font-bold text-forge-neon uppercase">Document Draft Preview</span>
                  <button
                    type="button"
                    onClick={handleSaveDoc}
                    disabled={savingDoc}
                    className="forge-btn text-[9px] px-2 py-0.5 font-bold disabled:opacity-40"
                  >
                    {savingDoc ? 'SAVING...' : 'SAVE DOCUMENT'}
                  </button>
                </div>
                <textarea
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  className="flex-1 forge-input text-[10px] p-2 bg-black font-mono border border-forge-dark text-forge-text resize-none focus:outline-none leading-relaxed select-text"
                  style={{ minHeight: '220px' }}
                />
              </div>
            )}
          </div>
        )}

        {rightView === 'cost' && (
          <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-4 font-mono select-none">
            {/* Header */}
            <div className="p-3 border border-forge-dark bg-black/40 rounded flex flex-col gap-1.5 font-mono">
              <span className="text-xs font-bold text-forge-neon uppercase tracking-wider flex items-center gap-1.5">
                <Terminal size={12} /> Cost Guard Dashboard
              </span>
              <p className="text-[10px] text-forge-dim leading-relaxed">
                Monitor token usage, estimate transaction costs, and track context savings in real-time.
              </p>
            </div>

            {/* Stats Cards Grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="border border-forge-dark bg-black/20 p-2.5 rounded flex flex-col gap-0.5">
                <span className="text-[9px] text-forge-dim uppercase">Current Message</span>
                <span className="text-xs font-bold text-forge-neon">${currentCost.toFixed(5)}</span>
                <span className="text-[8px] text-forge-dim">In: {currentInputTokens} | Out: {currentOutputTokens} tkn</span>
              </div>
              <div className="border border-forge-dark bg-black/20 p-2.5 rounded flex flex-col gap-0.5">
                <span className="text-[9px] text-forge-dim uppercase">Session Total</span>
                <span className="text-xs font-bold text-forge-neon">${sessionCost.toFixed(5)}</span>
                <span className="text-[8px] text-forge-dim">Total: {sessionTokens} tkn</span>
              </div>
              <div className="border border-forge-dark bg-black/20 p-2.5 rounded flex flex-col gap-0.5">
                <span className="text-[9px] text-forge-dim uppercase">Token Savings</span>
                <span className="text-xs font-bold text-forge-neon">~{sessionSavings} tkn</span>
                <span className="text-[8px] text-forge-dim">Concise/Minimal mode</span>
              </div>
            </div>

            {/* Model Breakdown */}
            <div className="border border-forge-dark bg-black/20 p-3 rounded space-y-2">
              <span className="text-[10px] font-bold text-forge-text uppercase tracking-wider">Active Configuration</span>
              <div className="flex justify-between text-[10px] py-0.5 border-b border-forge-very-dark">
                <span className="text-forge-dim">Active Model:</span>
                <span className="text-forge-text font-bold">{activeModel}</span>
              </div>
              <div className="flex justify-between text-[10px] py-0.5 border-b border-forge-very-dark">
                <span className="text-forge-dim">Zero Egress Mode:</span>
                <span className={`font-bold ${zeroEgressMode ? 'text-forge-neon' : 'text-forge-dim'}`}>
                  {zeroEgressMode ? 'ENABLED (Local Only)' : 'DISABLED (External Allowed)'}
                </span>
              </div>
            </div>

            {/* Context Size Warning Threshold */}
            <div className="border border-forge-dark bg-black/20 p-3 rounded space-y-2">
              <span className="text-[10px] font-bold text-forge-text uppercase tracking-wider">Context Window Helper</span>
              <p className="text-[9px] text-forge-dim leading-relaxed">
                Large request warning threshold: <strong>15,000 characters (~4,000 tokens)</strong>.
                If text payload exceeds this, a truncation and optimization warning is surfaced before API calls.
              </p>
            </div>

            {/* Cost History */}
            <div className="border border-forge-dark bg-black/20 p-3 rounded space-y-2 flex-1 flex flex-col min-h-[200px]">
              <span className="text-[10px] font-bold text-forge-text uppercase tracking-wider flex justify-between items-center">
                <span>Cost Log History</span>
                {costRestricted && (
                  <span className="text-[8px] bg-amber-950 border border-amber-500 text-amber-100 px-1 py-0.2 rounded font-bold uppercase">
                    Solo Plus & Above
                  </span>
                )}
              </span>

              {costHistoryLoading ? (
                <div className="flex-1 flex items-center justify-center text-[10px] text-forge-dim">
                  Loading history...
                </div>
              ) : costRestricted ? (
                <div className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-forge-dark rounded bg-black/40 text-center gap-1.5">
                  <AlertCircle size={16} className="text-amber-500" />
                  <span className="text-[10px] text-forge-text font-bold">Cost Log Gated</span>
                  <p className="text-[9px] text-forge-dim max-w-[200px] leading-relaxed">
                    Persistent Cost Guard history is available for **Solo Plus** and higher plans.
                  </p>
                </div>
              ) : costHistory.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[10px] text-forge-dim border border-dashed border-forge-dark rounded bg-black/40">
                  No records in this workspace yet.
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[220px] border border-forge-dark rounded bg-black/40 flex flex-col">
                  {costHistory.map((h, i) => (
                    <div
                      key={h.id || i}
                      className="p-2 border-b border-forge-very-dark flex justify-between items-center text-[9px] hover:bg-black/30 transition-colors"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-forge-text font-bold">{h.model}</span>
                        <span className="text-forge-dim text-[8px]">
                          {new Date(h.timestamp).toLocaleTimeString()} · In: {h.inputTokens} | Out: {h.outputTokens} tkn
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-forge-neon font-bold">${h.cost.toFixed(5)}</span>
                        {h.tokenSavings > 0 && (
                          <span className="text-forge-dim text-[8px]">Saved ~{h.tokenSavings} tkn</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {rightView === 'utilities' && (
          <div className="flex-1 overflow-hidden flex flex-row font-mono select-text text-forge-text">
            {/* Left Column: Form & Trigger Buttons */}
            <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-4 border-r border-forge-dark" style={{ flex: '1 1 50%' }}>
              <div className="p-3 border border-forge-dark bg-black/40 rounded flex flex-col gap-1.5 font-mono">
                <span className="text-xs font-bold text-forge-neon uppercase tracking-wider flex items-center gap-1.5">
                  💼 Founder & Agency Control Center
                </span>
                <p className="text-[10px] text-forge-dim leading-relaxed">
                  Access premium automated documentation, executive roadmaps, client handoff packages, and branded agency collateral.
                </p>
              </div>

              {/* Custom Prompt Input */}
              <div className="border border-forge-dark bg-black/20 rounded p-3 space-y-2">
                <label className="text-[10px] font-bold text-forge-text uppercase tracking-wider block">Custom Scoping Instructions (Optional)</label>
                <textarea
                  value={customUtilityPrompt}
                  onChange={(e) => setCustomUtilityPrompt(e.target.value)}
                  placeholder="e.g. Include details on API version 2, focus on the HSL CSS variables, list active developer team members..."
                  className="w-full forge-input text-[10px] p-2 bg-forge-very-dark border border-forge-dark text-forge-neon focus:outline-none resize-none leading-relaxed h-14"
                />
              </div>

              {/* Founder Utilities section */}
              <div className="border border-forge-dark bg-black/20 rounded p-3 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-forge-neon uppercase tracking-wider"> Founder Autopilot Utilities</span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleGenerateUtility('founder', 'prd')}
                    disabled={generatingUtility}
                    className="forge-btn text-[9px] py-1 px-1.5 text-left flex flex-col gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="font-bold text-forge-text">Product Specs (PRD)</span>
                    <span className="text-[8px] text-forge-dim">Target audiences & user flows</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateUtility('founder', 'architecture')}
                    disabled={generatingUtility}
                    className="forge-btn text-[9px] py-1 px-1.5 text-left flex flex-col gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="font-bold text-forge-text">System Architecture</span>
                    <span className="text-[8px] text-forge-dim">Data topology & API design</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateUtility('founder', 'roadmap')}
                    disabled={generatingUtility}
                    className="forge-btn text-[9px] py-1 px-1.5 text-left flex flex-col gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="font-bold text-forge-text">Roadmap & Backlog</span>
                    <span className="text-[8px] text-forge-dim">Translate plans to milestones</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateUtility('founder', 'changelog')}
                    disabled={generatingUtility}
                    className="forge-btn text-[9px] py-1 px-1.5 text-left flex flex-col gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="font-bold text-forge-text">Release Changelog</span>
                    <span className="text-[8px] text-forge-dim">Compile logs from git history</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateUtility('founder', 'health_report')}
                    disabled={generatingUtility}
                    className="forge-btn text-[9px] py-1 px-1.5 text-left flex flex-col gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="font-bold text-forge-text">Monthly Health Report</span>
                    <span className="text-[8px] text-forge-dim">Commit density & test stats</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateUtility('founder', 'release_checklist')}
                    disabled={generatingUtility}
                    className="forge-btn text-[9px] py-1 px-1.5 text-left flex flex-col gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="font-bold text-forge-text">Release QA Checklist</span>
                    <span className="text-[8px] text-forge-dim">Manual & automated steps</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateUtility('founder', 'pricing_page')}
                    disabled={generatingUtility}
                    className="forge-btn text-[9px] py-1 px-1.5 text-left flex flex-col gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="font-bold text-forge-text">Pricing Copywriter</span>
                    <span className="text-[8px] text-forge-dim">Convert SaaS page visitors</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateUtility('founder', 'investor_summary')}
                    disabled={generatingUtility}
                    className="forge-btn text-[9px] py-1 px-1.5 text-left flex flex-col gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="font-bold text-forge-text">Investor Executive Summary</span>
                    <span className="text-[8px] text-forge-dim">1-page tech architecture summary</span>
                  </button>
                </div>
              </div>

              {/* Agency Utilities section */}
              <div className="border border-forge-dark bg-black/20 rounded p-3 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-forge-neon uppercase tracking-wider"> Agency Premium Deliverables</span>
                </div>

                {/* Agency Branding Controls */}
                <div className="p-2 border border-forge-dark bg-black/40 rounded space-y-2">
                  <span className="text-[8px] font-bold text-forge-neon uppercase block">Agency Custom Branding Settings</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[8px] text-forge-dim uppercase">Agency Name</label>
                      <input
                        type="text"
                        value={agencyBranding.agencyName}
                        onChange={(e) => setAgencyBranding({ ...agencyBranding, agencyName: e.target.value })}
                        className="forge-input text-[9px] bg-forge-very-dark border border-forge-dark px-1.5 py-0.5 text-forge-text focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[8px] text-forge-dim uppercase">Primary Color</label>
                      <div className="flex gap-1">
                        <input
                          type="color"
                          value={agencyBranding.primaryColor}
                          onChange={(e) => setAgencyBranding({ ...agencyBranding, primaryColor: e.target.value })}
                          className="w-5 h-5 bg-transparent border-0 cursor-pointer p-0 shrink-0"
                        />
                        <input
                          type="text"
                          value={agencyBranding.primaryColor}
                          onChange={(e) => setAgencyBranding({ ...agencyBranding, primaryColor: e.target.value })}
                          className="forge-input text-[9px] bg-forge-very-dark border border-forge-dark px-1.5 py-0.5 text-forge-text focus:outline-none flex-1"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[8px] text-forge-dim uppercase">Logo URL</label>
                    <input
                      type="text"
                      value={agencyBranding.logoUrl}
                      onChange={(e) => setAgencyBranding({ ...agencyBranding, logoUrl: e.target.value })}
                      className="forge-input text-[9px] bg-forge-very-dark border border-forge-dark px-1.5 py-0.5 text-forge-text focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleGenerateUtility('agency', 'handoff')}
                    disabled={generatingUtility}
                    className="forge-btn text-[9px] py-1 px-1.5 text-center flex flex-col gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="font-bold text-forge-text">Handoff Pack</span>
                    <span className="text-[7px] text-forge-dim">Codebase guide</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateUtility('agency', 'brochure')}
                    disabled={generatingUtility}
                    className="forge-btn text-[9px] py-1 px-1.5 text-center flex flex-col gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="font-bold text-forge-text">Pitch Brochure</span>
                    <span className="text-[7px] text-forge-dim">SaaS presentation</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateUtility('agency', 'branded_doc')}
                    disabled={generatingUtility}
                    className="forge-btn text-[9px] py-1 px-1.5 text-center flex flex-col gap-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="font-bold text-forge-text">Branded HTML</span>
                    <span className="text-[7px] text-forge-dim">Styled technical doc</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Draft Preview & Save */}
            <div className="flex-1 overflow-hidden flex flex-col p-3.5 gap-3" style={{ flex: '1 1 50%' }}>
              {utilityContent ? (
                <div className="flex-1 overflow-hidden flex flex-col gap-2.5">
                  <div className="flex justify-between items-center border-b border-forge-dark pb-2">
                    <span className="text-[10px] font-bold text-forge-neon uppercase">Generated Document Draft</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={handleSaveUtility}
                        disabled={savingUtility}
                        className="forge-btn text-[9px] px-2.5 py-0.5 font-bold disabled:opacity-40"
                      >
                        {savingUtility ? 'SAVING...' : 'SAVE TO FILE'}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[8px] text-forge-dim uppercase">Save Path</label>
                    <input
                      type="text"
                      value={utilitySavePath}
                      onChange={(e) => setUtilitySavePath(e.target.value)}
                      className="forge-input text-[10px] bg-forge-very-dark border-forge-dark px-2 py-1 text-forge-neon focus:outline-none"
                    />
                  </div>
                  <textarea
                    value={utilityContent}
                    onChange={(e) => setUtilityContent(e.target.value)}
                    className="flex-1 forge-input text-[10px] p-2 bg-black font-mono border border-forge-dark text-forge-text resize-none focus:outline-none leading-relaxed select-text"
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-forge-dark rounded bg-black/40 text-center gap-1.5">
                  {generatingUtility ? (
                    <>
                      <div className="h-6 w-6 border-2 border-forge-neon border-t-transparent rounded-full animate-spin" />
                      <span className="text-[10px] text-forge-text font-bold">Kryleos Autopilot Working...</span>
                      <p className="text-[8px] text-forge-dim max-w-[200px]">
                        Scanning active workspace and drafting your premium document. Please wait.
                      </p>
                    </>
                  ) : (
                    <>
                      <FileText size={16} className="text-forge-dim" />
                      <span className="text-[10px] text-forge-dim font-bold">No Document Selected</span>
                      <p className="text-[8px] text-forge-dim max-w-[200px]">
                        Select a founder utility or agency deliverable from the left panel to generate.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --- MODAL 1: EXTRACTION MODAL --- */}
      {isExtractModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono select-none">
          <div className="w-full max-w-2xl border border-forge-neon rounded bg-forge-panel-bg p-5 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center border-b border-forge-dark pb-2">
              <span className="text-xs font-bold text-forge-neon uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} /> Extracting Workspace Items
              </span>
              <button
                type="button"
                onClick={() => setIsExtractModalOpen(false)}
                className="text-forge-dim hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {isExtracting ? (
              <div className="flex-1 flex flex-col items-center justify-center py-10 space-y-3">
                <div className="h-6 w-6 border-2 border-forge-neon border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-forge-neon animate-pulse">Running AI extraction on Scratchbook history...</span>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto my-3 space-y-4 pr-1">
                  <div className="text-[10px] text-forge-dim leading-relaxed">
                    Below are the scoped items identified in your Scratchbook logs. Review, refine, or edit before staging them in the Plan Workspace.
                  </div>
                  {extractedDrafts.map((draft, idx) => (
                    <div key={draft.id || idx} className="border border-forge-dark rounded p-3 bg-black/30 space-y-2 relative">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-forge-neon font-bold uppercase">Proposed Item #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setExtractedDrafts(prev => prev.filter((_, i) => i !== idx));
                          }}
                          className="text-red-400 hover:text-white text-[9px]"
                        >
                          Discard
                        </button>
                      </div>
                      
                      {/* Edit Fields */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2 flex flex-col gap-0.5">
                          <label className="text-[8px] text-forge-dim uppercase">Title</label>
                          <input
                            type="text"
                            value={draft.title}
                            onChange={(e) => {
                              const list = [...extractedDrafts];
                              list[idx].title = e.target.value;
                              setExtractedDrafts(list);
                            }}
                            className="forge-input text-[11px] px-2 py-1"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[8px] text-forge-dim uppercase">Category</label>
                          <select
                            value={draft.category}
                            onChange={(e) => {
                              const list = [...extractedDrafts];
                              list[idx].category = e.target.value as any;
                              setExtractedDrafts(list);
                            }}
                            className="bg-black border border-forge-dark text-[10px] text-forge-neon p-1 rounded font-mono"
                          >
                            <option value="frontend">Frontend</option>
                            <option value="backend">Backend</option>
                            <option value="testing">Testing</option>
                            <option value="security">Security</option>
                            <option value="docs">Docs</option>
                            <option value="infra">Infra</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <label className="text-[8px] text-forge-dim uppercase">Description</label>
                        <textarea
                          value={draft.description}
                          onChange={(e) => {
                            const list = [...extractedDrafts];
                            list[idx].description = e.target.value;
                            setExtractedDrafts(list);
                          }}
                          rows={2}
                          className="forge-input text-[11px] px-2 py-1 resize-none"
                        />
                      </div>
                    </div>
                  ))}
                  
                  {extractedDrafts.length === 0 && (
                    <div className="text-center py-6 text-forge-dim text-xs">No items extracted. Close modal and chat more first.</div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-forge-dark pt-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const newItem: PlanWorkspaceItem = {
                        id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        title: 'New Scoped Item',
                        description: 'Outline the objective here...',
                        category: 'frontend',
                        status: 'draft'
                      };
                      setExtractedDrafts(prev => [...prev, newItem]);
                    }}
                    className="forge-secondary-button text-[10px] py-1.5 px-3 flex items-center gap-1"
                  >
                    <Plus size={11} /> Add Item
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsExtractModalOpen(false)}
                      className="forge-secondary-button text-[10px] py-1.5 px-3"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmExtraction}
                      disabled={extractedDrafts.length === 0}
                      className="forge-btn text-[10px] py-1.5 px-4 font-bold disabled:opacity-40"
                    >
                      Confirm &amp; Add ({extractedDrafts.length})
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL 2: EDIT WORKSPACE ITEM MODAL --- */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono select-none">
          <div className="w-full max-w-md border border-forge-dim rounded bg-forge-panel-bg p-5 flex flex-col">
            <div className="flex justify-between items-center border-b border-forge-dark pb-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Edit Workspace Item
              </span>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-forge-dim hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="my-4 space-y-3">
              <div className="flex flex-col gap-0.5">
                <label className="text-[8px] text-forge-dim uppercase">Title</label>
                <input
                  type="text"
                  value={editingItem.title}
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  className="forge-input text-[11px] px-2.5 py-1.5"
                />
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[8px] text-forge-dim uppercase">Category</label>
                <select
                  value={editingItem.category}
                  onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value as any })}
                  className="bg-black border border-forge-dark text-[10px] text-forge-neon p-1.5 rounded font-mono w-full"
                >
                  <option value="frontend">Frontend</option>
                  <option value="backend">Backend</option>
                  <option value="testing">Testing</option>
                  <option value="security">Security</option>
                  <option value="docs">Docs</option>
                  <option value="infra">Infra</option>
                </select>
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[8px] text-forge-dim uppercase">Description</label>
                <textarea
                  value={editingItem.description}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  rows={3}
                  className="forge-input text-[11px] px-2.5 py-1.5 resize-none animate-none w-full"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-forge-dark pt-3">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="forge-secondary-button text-[10px] py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="forge-btn text-[10px] py-1.5 px-4 font-bold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 3: PUSH TO CREW DIFF MODAL --- */}
      {isPushDiffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono select-none">
          <div className="w-full max-w-lg border border-forge-neon rounded bg-forge-panel-bg p-5 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center border-b border-forge-dark pb-2">
              <span className="text-xs font-bold text-forge-neon uppercase tracking-wider">
                Staged Crew Sync Review ({selectedItemIds.size} items)
              </span>
              <button
                type="button"
                onClick={() => setIsPushDiffModalOpen(false)}
                className="text-forge-dim hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto my-3 space-y-2 pr-1">
              <div className="text-[10px] text-forge-dim leading-relaxed mb-2">
                The following plan items will be injected into the system prompt context of the CREW agents (Technical Reviewer, etc.) during co-working.
              </div>
              {workspaceItems.filter(it => selectedItemIds.has(it.id)).map(item => (
                <div key={item.id} className="border border-forge-dark rounded p-2.5 bg-black/30">
                  <div className="flex justify-between">
                    <span className="text-xs font-bold text-white truncate">{item.title}</span>
                    <span className={`text-[8px] uppercase border px-1 rounded font-bold ${getCategoryColor(item.category)}`}>
                      {item.category}
                    </span>
                  </div>
                  <div className="text-[10px] text-forge-dim mt-1 line-clamp-2">{item.description}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-forge-dark pt-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsPushDiffModalOpen(false)}
                className="forge-secondary-button text-[10px] py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executePushToCrew}
                disabled={isPushing}
                className="forge-btn text-[10px] py-1.5 px-4 font-bold disabled:opacity-40"
              >
                {isPushing ? 'Syncing...' : 'Confirm Sync to CREW'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 5: GITHUB ISSUES IMPORT MODAL --- */}
      {isGithubModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono select-none">
          <div className="w-full max-w-2xl border border-forge-neon rounded bg-forge-panel-bg p-5 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center border-b border-forge-dark pb-2">
              <span className="text-xs font-bold text-forge-neon uppercase tracking-wider flex items-center gap-1.5">
                <Globe size={14} /> Import GitHub Issues
              </span>
              <button
                type="button"
                onClick={() => setIsGithubModalOpen(false)}
                className="text-forge-dim hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Config details */}
            <div className="grid grid-cols-2 gap-3 my-3">
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] text-forge-dim uppercase">GitHub Token (Optional PAT)</label>
                <input
                  type="password"
                  value={gitTokenInput}
                  onChange={(e) => setGitTokenInput(e.target.value)}
                  placeholder="github_pat_..."
                  className="forge-input text-[11px] bg-forge-very-dark border-forge-dark px-2 py-1 text-forge-neon focus:outline-none"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[9px] text-forge-dim uppercase">Repository URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={gitRepoInput}
                    onChange={(e) => setGitRepoInput(e.target.value)}
                    placeholder="https://github.com/username/repo"
                    className="forge-input text-[11px] bg-forge-very-dark border-forge-dark px-2 py-1 text-forge-text flex-1 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleFetchGithubIssues}
                    disabled={fetchingIssues}
                    className="forge-btn text-[9px] px-3 font-bold disabled:opacity-40"
                  >
                    {fetchingIssues ? 'FETCHING...' : 'FETCH'}
                  </button>
                </div>
              </div>
            </div>

            {/* Issues checklist */}
            <div className="flex-1 overflow-y-auto min-h-[160px] border border-forge-dark rounded bg-black/40 p-2.5 space-y-2">
              {gitIssues.length === 0 ? (
                <div className="h-full flex items-center justify-center text-forge-dim text-[10px] italic py-8">
                  {fetchingIssues ? 'Connecting to GitHub API...' : 'No issues loaded. Connect repository and click Fetch.'}
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center text-[9px] text-forge-dim border-b border-forge-very-dark pb-1.5 select-none">
                    <label className="flex items-center gap-1.5 cursor-pointer text-left">
                      <input
                        type="checkbox"
                        checked={gitIssues.length > 0 && selectedGitIssueIds.size === gitIssues.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedGitIssueIds(new Set(gitIssues.map(i => i.id)));
                          } else {
                            setSelectedGitIssueIds(new Set());
                          }
                        }}
                        className="accent-forge-neon cursor-pointer"
                      />
                      <span>Select All</span>
                    </label>
                    <input
                      type="text"
                      value={gitIssuesSearch}
                      onChange={(e) => setGitIssuesSearch(e.target.value)}
                      placeholder="Filter issues..."
                      className="bg-transparent text-[10px] text-forge-text text-right focus:outline-none border border-forge-dark px-1.5 py-0.5 rounded"
                    />
                  </div>
                  <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                    {gitIssues
                      .filter(issue => {
                        const s = (gitIssuesSearch || '').toLowerCase();
                        return String(issue.number || '').includes(s) || (issue.title || '').toLowerCase().includes(s);
                      })
                      .map(issue => {
                        const isSelected = selectedGitIssueIds.has(issue.id);
                        return (
                          <label
                            key={issue.id}
                            className={`flex items-start gap-2.5 p-2 rounded border transition-all cursor-pointer ${
                              isSelected ? 'border-forge-neon bg-forge-dark/25' : 'border-forge-very-dark bg-black/20 hover:border-forge-dark'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedGitIssueIds(prev => {
                                  const updated = new Set(prev);
                                  if (updated.has(issue.id)) updated.delete(issue.id);
                                  else updated.add(issue.id);
                                  return updated;
                                });
                              }}
                              className="mt-0.5 accent-forge-neon cursor-pointer"
                            />
                            <div className="flex-1 min-w-0 select-text">
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <span className="text-forge-neon font-bold">#{issue.number}</span>
                                <span className="text-forge-text font-bold truncate">{issue.title}</span>
                              </div>
                              {issue.body && (
                                <p className="text-[9px] text-forge-dim line-clamp-1 mt-0.5">{issue.body}</p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                  </div>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center border-t border-forge-dark pt-3 mt-3 shrink-0">
              <span className="text-[9px] text-forge-dim italic">
                Imported issues will draft abstract Phase 1 criteria using LLMs.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsGithubModalOpen(false)}
                  className="forge-secondary-button text-[10px] py-1.5 px-3"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportGithubIssues}
                  disabled={importingIssues || selectedGitIssueIds.size === 0}
                  className="forge-btn text-[10px] py-1.5 px-4 font-bold disabled:opacity-40"
                >
                  {importingIssues ? 'IMPORTING...' : `IMPORT SELECTED (${selectedGitIssueIds.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION DIALOG MODAL --- */}
      {confirmDialog && confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono select-none">
          <div className="w-full max-w-sm border border-red-800 rounded bg-forge-panel-bg p-5 flex flex-col">
            <div className="flex justify-between items-center border-b border-forge-dark pb-2 mb-3">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle size={14} /> {confirmDialog.title}
              </span>
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="text-forge-dim hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-[10px] text-forge-dim leading-relaxed mb-4">
              {confirmDialog.message}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-forge-dark">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="forge-secondary-button text-[10px] py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="forge-btn text-[10px] py-1.5 px-4 font-bold bg-red-950 border-red-700 text-red-200 hover:bg-red-900"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
