import { usePlanningStore } from "../store/usePlanningStore";
import { API_BASE_URL } from "../api/client";
import React, { useState, useEffect, useCallback } from "react";
import { Sparkles, X, AlertTriangle, Plus, Globe } from "lucide-react";
import { LeftPane } from "./Planning/LeftPane";
import { RightPane, getCategoryColor } from "./Planning/RightPane";
import type { AcceptanceCriterion, CriterionResult, DriftClassification, ExecutionTrace, ProjectTask, PlanWorkspaceItem } from "../backend/db";

interface DriftItem {
  taskId: string;
  title: string;
  status: DriftClassification;
  category?: string;
  workspace?: string;
  blockedBy: string[];
  results: CriterionResult[];
  latestTrace?: ExecutionTrace;
  suggestedStatus: ProjectTask["status"];
}

interface PlanningScreenProps {
  sessionId?: string;
  activeProject?: any | null;
  workspaceRoot: string;
  onSendQuery: (text: string, space: "chat" | "cowork" | "project") => void;
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
  onNotify?: (message: string, kind?: "success" | "error" | "warning" | "info") => void;
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
  
    const { inputText, setInputText, rightView, setRightView, generatingUtility, setGeneratingUtility, utilityContent, setUtilityContent, utilitySavePath, setUtilitySavePath, customUtilityPrompt, setCustomUtilityPrompt, savingUtility, setSavingUtility, currentCost, setCurrentCost, currentInputTokens, setCurrentInputTokens, currentOutputTokens, setCurrentOutputTokens, currentSavings, setCurrentSavings, sessionCost, setSessionCost, sessionTokens, setSessionTokens, sessionSavings, setSessionSavings, costHistory, setCostHistory, costRestricted, setCostRestricted, costHistoryLoading, setCostHistoryLoading, driftItems, setDriftItems, loopLoading, setLoopLoading, enriching, setEnriching, enrichDismissed, setEnrichDismissed, confirmingId, setConfirmingId, whatsLeft, setWhatsLeft, whatsLeftLoading, setWhatsLeftLoading, whatsLeftExport, setWhatsLeftExport, showRepoManager, setShowRepoManager, newRepoPath, setNewRepoPath, workspaceItems, setWorkspaceItems, feasibilityVerdicts, setFeasibilityVerdicts, isExtractModalOpen, setIsExtractModalOpen, extractedDrafts, setExtractedDrafts, isExtracting, setIsExtracting, isEditModalOpen, setIsEditModalOpen, editingItem, setEditingItem, isPushDiffModalOpen, setIsPushDiffModalOpen, isPushing, setIsPushing, isGithubModalOpen, setIsGithubModalOpen, gitIssues, setGitIssues, fetchingIssues, setFetchingIssues, importingIssues, setImportingIssues, gitIssuesSearch, setGitIssuesSearch, docTemplates, setDocTemplates, selectedTemplateId, setSelectedTemplateId, docsTargetFolder, setDocsTargetFolder, generatingDoc, setGeneratingDoc, patchingDoc, setPatchingDoc, savingDoc, setSavingDoc, docContent, setDocContent, docPathsList, setDocPathsList, selectedDocPath, setSelectedDocPath } = usePlanningStore();
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
   // 'draft' is now the Plan Workspace list
            const [agencyBranding, setAgencyBranding] = useState({
    agencyName: 'Kryleos Partner Agency',
    logoUrl: 'https://raw.githubusercontent.com/thetimelord69/Kryleos-forge/main/logo.png',
    primaryColor: '#10b981'
  });
        
      
      
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
        const [enrichDiff, setEnrichDiff] = useState<Array<{ taskId: string; title: string; added: AcceptanceCriterion[] }>>([]);
                const [activeTargets, setActiveTargets] = useState<string[]>([workspaceRoot]);

  // Plan Workspace state
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [expandedContextIds, setExpandedContextIds] = useState<Set<string>>(new Set());
    
  // Modals state
        
      
    
    const [gitTokenInput, setGitTokenInput] = useState(githubToken);
  const [gitRepoInput, setGitRepoInput] = useState(githubRepoUrl);
    const [selectedGitIssueIds, setSelectedGitIssueIds] = useState<Set<number>>(new Set());
      
                  
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


  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-forge-very-dark text-forge-text font-mono h-full relative">
      {/* Left Pane: Architect Chat (Scratchbook) */}
      <LeftPane
        activeProject={activeProject}
        chatMessages={chatMessages}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        onSend={handleSend}
        onEditPreviousQuestion={editPreviousQuestion}
        onSummarizeAndPush={handleSummarizeAndPush}
        onAbort={onAbort}
        activeModel={activeModel}
      />

      {/* Right Pane: Plan Workspace / Build Loop */}
      <RightPane
        workspaceRoot={workspaceRoot}
        workspacePaths={workspacePaths}
        onUpdateWorkspacePaths={onUpdateWorkspacePaths}
        activeModel={activeModel}
        tasks={tasks}
        onConfirmComplete={onConfirmComplete}
        handlePushToCrewTrigger={handlePushToCrewTrigger}
        openEditModal={openEditModal}
        deleteWorkspaceItem={deleteWorkspaceItem}
        selectedItemIds={selectedItemIds}
        toggleSelectAll={toggleSelectAll}
        toggleSelectItem={toggleSelectItem}
        toggleItemStatus={toggleItemStatus}
        checkFeasibility={checkFeasibility}
        expandedContextIds={expandedContextIds}
        toggleExpandContext={toggleExpandContext}
        activeTargets={activeTargets}
        setActiveTargets={setActiveTargets}
        runWhatsLeft={runWhatsLeft}
        exportWhatsLeftMarkdown={exportWhatsLeftMarkdown}
        loadBuildLoop={loadBuildLoop}
        runEnrichment={runEnrichment}
        enrichDiff={enrichDiff}
        setEnrichDiff={setEnrichDiff}
        discardEnrichedCriterion={discardEnrichedCriterion}
        confirmComplete={confirmComplete}
        handleGenerateDoc={handleGenerateDoc}
        handlePatchDoc={handlePatchDoc}
        handleSaveDoc={handleSaveDoc}
        loadCostHistory={loadCostHistory}
        agencyBranding={agencyBranding}
        setAgencyBranding={setAgencyBranding}
        handleGenerateUtility={handleGenerateUtility}
        handleSaveUtility={handleSaveUtility}
      />

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
