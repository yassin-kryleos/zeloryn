import { create } from 'zustand';
import type { AcceptanceCriterion, CriterionResult, DriftClassification, ExecutionTrace, ProjectTask, PlanWorkspaceItem } from '../backend/db';

export interface WhatsLeftReport {
  generatedAt: string;
  items: Array<any>;
  total: number;
  usedLlm: boolean;
  truncated: boolean;
}

export interface DriftItem {
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

interface PlanningState {
  inputText: string;
  setInputText: (val: string | ((prev: string) => string)) => void;
  rightView: 'draft' | 'loop' | 'docs' | 'cost' | 'utilities';
  setRightView: (val: 'draft' | 'loop' | 'docs' | 'cost' | 'utilities' | ((prev: 'draft' | 'loop' | 'docs' | 'cost' | 'utilities') => 'draft' | 'loop' | 'docs' | 'cost' | 'utilities')) => void;
  generatingUtility: boolean;
  setGeneratingUtility: (val: boolean | ((prev: boolean) => boolean)) => void;
  utilityContent: string;
  setUtilityContent: (val: string | ((prev: string) => string)) => void;
  utilitySavePath: string;
  setUtilitySavePath: (val: string | ((prev: string) => string)) => void;
  customUtilityPrompt: string;
  setCustomUtilityPrompt: (val: string | ((prev: string) => string)) => void;
  savingUtility: boolean;
  setSavingUtility: (val: boolean | ((prev: boolean) => boolean)) => void;
  currentCost: number;
  setCurrentCost: (val: number | ((prev: number) => number)) => void;
  currentInputTokens: number;
  setCurrentInputTokens: (val: number | ((prev: number) => number)) => void;
  currentOutputTokens: number;
  setCurrentOutputTokens: (val: number | ((prev: number) => number)) => void;
  currentSavings: number;
  setCurrentSavings: (val: number | ((prev: number) => number)) => void;
  sessionCost: number;
  setSessionCost: (val: number | ((prev: number) => number)) => void;
  sessionTokens: number;
  setSessionTokens: (val: number | ((prev: number) => number)) => void;
  sessionSavings: number;
  setSessionSavings: (val: number | ((prev: number) => number)) => void;
  costHistory: any[];
  setCostHistory: (val: any[] | ((prev: any[]) => any[])) => void;
  costRestricted: boolean;
  setCostRestricted: (val: boolean | ((prev: boolean) => boolean)) => void;
  costHistoryLoading: boolean;
  setCostHistoryLoading: (val: boolean | ((prev: boolean) => boolean)) => void;
  driftItems: DriftItem[];
  setDriftItems: (val: DriftItem[] | ((prev: DriftItem[]) => DriftItem[])) => void;
  loopLoading: boolean;
  setLoopLoading: (val: boolean | ((prev: boolean) => boolean)) => void;
  enriching: boolean;
  setEnriching: (val: boolean | ((prev: boolean) => boolean)) => void;
  enrichDismissed: boolean;
  setEnrichDismissed: (val: boolean | ((prev: boolean) => boolean)) => void;
  confirmingId: string | null;
  setConfirmingId: (val: string | null | ((prev: string | null) => string | null)) => void;
  whatsLeft: WhatsLeftReport | null;
  setWhatsLeft: (val: WhatsLeftReport | null | ((prev: WhatsLeftReport | null) => WhatsLeftReport | null)) => void;
  whatsLeftLoading: boolean;
  setWhatsLeftLoading: (val: boolean | ((prev: boolean) => boolean)) => void;
  whatsLeftExport: boolean;
  setWhatsLeftExport: (val: boolean | ((prev: boolean) => boolean)) => void;
  showRepoManager: boolean;
  setShowRepoManager: (val: boolean | ((prev: boolean) => boolean)) => void;
  newRepoPath: string;
  setNewRepoPath: (val: string | ((prev: string) => string)) => void;
  workspaceItems: PlanWorkspaceItem[];
  setWorkspaceItems: (val: PlanWorkspaceItem[] | ((prev: PlanWorkspaceItem[]) => PlanWorkspaceItem[])) => void;
  feasibilityVerdicts: { [id: string]: { verdict: string; reason: string; loading?: boolean } };
  setFeasibilityVerdicts: (val: { [id: string]: { verdict: string; reason: string; loading?: boolean } } | ((prev: { [id: string]: { verdict: string; reason: string; loading?: boolean } }) => { [id: string]: { verdict: string; reason: string; loading?: boolean } })) => void;
  isExtractModalOpen: boolean;
  setIsExtractModalOpen: (val: boolean | ((prev: boolean) => boolean)) => void;
  extractedDrafts: PlanWorkspaceItem[];
  setExtractedDrafts: (val: PlanWorkspaceItem[] | ((prev: PlanWorkspaceItem[]) => PlanWorkspaceItem[])) => void;
  isExtracting: boolean;
  setIsExtracting: (val: boolean | ((prev: boolean) => boolean)) => void;
  isEditModalOpen: boolean;
  setIsEditModalOpen: (val: boolean | ((prev: boolean) => boolean)) => void;
  editingItem: PlanWorkspaceItem | null;
  setEditingItem: (val: PlanWorkspaceItem | null | ((prev: PlanWorkspaceItem | null) => PlanWorkspaceItem | null)) => void;
  isPushDiffModalOpen: boolean;
  setIsPushDiffModalOpen: (val: boolean | ((prev: boolean) => boolean)) => void;
  isPushing: boolean;
  setIsPushing: (val: boolean | ((prev: boolean) => boolean)) => void;
  isGithubModalOpen: boolean;
  setIsGithubModalOpen: (val: boolean | ((prev: boolean) => boolean)) => void;
  gitIssues: any[];
  setGitIssues: (val: any[] | ((prev: any[]) => any[])) => void;
  fetchingIssues: boolean;
  setFetchingIssues: (val: boolean | ((prev: boolean) => boolean)) => void;
  importingIssues: boolean;
  setImportingIssues: (val: boolean | ((prev: boolean) => boolean)) => void;
  gitIssuesSearch: string;
  setGitIssuesSearch: (val: string | ((prev: string) => string)) => void;
  docTemplates: any[];
  setDocTemplates: (val: any[] | ((prev: any[]) => any[])) => void;
  selectedTemplateId: string;
  setSelectedTemplateId: (val: string | ((prev: string) => string)) => void;
  docsTargetFolder: string;
  setDocsTargetFolder: (val: string | ((prev: string) => string)) => void;
  generatingDoc: boolean;
  setGeneratingDoc: (val: boolean | ((prev: boolean) => boolean)) => void;
  patchingDoc: boolean;
  setPatchingDoc: (val: boolean | ((prev: boolean) => boolean)) => void;
  savingDoc: boolean;
  setSavingDoc: (val: boolean | ((prev: boolean) => boolean)) => void;
  docContent: string;
  setDocContent: (val: string | ((prev: string) => string)) => void;
  docPathsList: string[];
  setDocPathsList: (val: string[] | ((prev: string[]) => string[])) => void;
  selectedDocPath: string;
  setSelectedDocPath: (val: string | ((prev: string) => string)) => void;
}

export const usePlanningStore = create<PlanningState>((set) => ({
  inputText: '',
  rightView: 'draft',
  generatingUtility: false,
  utilityContent: '',
  utilitySavePath: '',
  customUtilityPrompt: '',
  savingUtility: false,
  currentCost: 0,
  currentInputTokens: 0,
  currentOutputTokens: 0,
  currentSavings: 0,
  sessionCost: 0,
  sessionTokens: 0,
  sessionSavings: 0,
  costHistory: [],
  costRestricted: false,
  costHistoryLoading: false,
  driftItems: [],
  loopLoading: false,
  enriching: false,
  enrichDismissed: false,
  confirmingId: null,
  whatsLeft: null,
  whatsLeftLoading: false,
  whatsLeftExport: false,
  showRepoManager: false,
  newRepoPath: '',
  workspaceItems: [],
  feasibilityVerdicts: {},
  isExtractModalOpen: false,
  extractedDrafts: [],
  isExtracting: false,
  isEditModalOpen: false,
  editingItem: null,
  isPushDiffModalOpen: false,
  isPushing: false,
  isGithubModalOpen: false,
  gitIssues: [],
  fetchingIssues: false,
  importingIssues: false,
  gitIssuesSearch: '',
  docTemplates: [],
  selectedTemplateId: '',
  docsTargetFolder: '.kryleos/docs',
  generatingDoc: false,
  patchingDoc: false,
  savingDoc: false,
  docContent: '',
  docPathsList: [],
  selectedDocPath: '',
  setInputText: (val) => set((state) => ({ inputText: typeof val === 'function' ? (val as any)(state.inputText) : val })),
  setRightView: (val) => set((state) => ({ rightView: typeof val === 'function' ? (val as any)(state.rightView) : val })),
  setGeneratingUtility: (val) => set((state) => ({ generatingUtility: typeof val === 'function' ? (val as any)(state.generatingUtility) : val })),
  setUtilityContent: (val) => set((state) => ({ utilityContent: typeof val === 'function' ? (val as any)(state.utilityContent) : val })),
  setUtilitySavePath: (val) => set((state) => ({ utilitySavePath: typeof val === 'function' ? (val as any)(state.utilitySavePath) : val })),
  setCustomUtilityPrompt: (val) => set((state) => ({ customUtilityPrompt: typeof val === 'function' ? (val as any)(state.customUtilityPrompt) : val })),
  setSavingUtility: (val) => set((state) => ({ savingUtility: typeof val === 'function' ? (val as any)(state.savingUtility) : val })),
  setCurrentCost: (val) => set((state) => ({ currentCost: typeof val === 'function' ? (val as any)(state.currentCost) : val })),
  setCurrentInputTokens: (val) => set((state) => ({ currentInputTokens: typeof val === 'function' ? (val as any)(state.currentInputTokens) : val })),
  setCurrentOutputTokens: (val) => set((state) => ({ currentOutputTokens: typeof val === 'function' ? (val as any)(state.currentOutputTokens) : val })),
  setCurrentSavings: (val) => set((state) => ({ currentSavings: typeof val === 'function' ? (val as any)(state.currentSavings) : val })),
  setSessionCost: (val) => set((state) => ({ sessionCost: typeof val === 'function' ? (val as any)(state.sessionCost) : val })),
  setSessionTokens: (val) => set((state) => ({ sessionTokens: typeof val === 'function' ? (val as any)(state.sessionTokens) : val })),
  setSessionSavings: (val) => set((state) => ({ sessionSavings: typeof val === 'function' ? (val as any)(state.sessionSavings) : val })),
  setCostHistory: (val) => set((state) => ({ costHistory: typeof val === 'function' ? (val as any)(state.costHistory) : val })),
  setCostRestricted: (val) => set((state) => ({ costRestricted: typeof val === 'function' ? (val as any)(state.costRestricted) : val })),
  setCostHistoryLoading: (val) => set((state) => ({ costHistoryLoading: typeof val === 'function' ? (val as any)(state.costHistoryLoading) : val })),
  setDriftItems: (val) => set((state) => ({ driftItems: typeof val === 'function' ? (val as any)(state.driftItems) : val })),
  setLoopLoading: (val) => set((state) => ({ loopLoading: typeof val === 'function' ? (val as any)(state.loopLoading) : val })),
  setEnriching: (val) => set((state) => ({ enriching: typeof val === 'function' ? (val as any)(state.enriching) : val })),
  setEnrichDismissed: (val) => set((state) => ({ enrichDismissed: typeof val === 'function' ? (val as any)(state.enrichDismissed) : val })),
  setConfirmingId: (val) => set((state) => ({ confirmingId: typeof val === 'function' ? (val as any)(state.confirmingId) : val })),
  setWhatsLeft: (val) => set((state) => ({ whatsLeft: typeof val === 'function' ? (val as any)(state.whatsLeft) : val })),
  setWhatsLeftLoading: (val) => set((state) => ({ whatsLeftLoading: typeof val === 'function' ? (val as any)(state.whatsLeftLoading) : val })),
  setWhatsLeftExport: (val) => set((state) => ({ whatsLeftExport: typeof val === 'function' ? (val as any)(state.whatsLeftExport) : val })),
  setShowRepoManager: (val) => set((state) => ({ showRepoManager: typeof val === 'function' ? (val as any)(state.showRepoManager) : val })),
  setNewRepoPath: (val) => set((state) => ({ newRepoPath: typeof val === 'function' ? (val as any)(state.newRepoPath) : val })),
  setWorkspaceItems: (val) => set((state) => ({ workspaceItems: typeof val === 'function' ? (val as any)(state.workspaceItems) : val })),
  setFeasibilityVerdicts: (val) => set((state) => ({ feasibilityVerdicts: typeof val === 'function' ? (val as any)(state.feasibilityVerdicts) : val })),
  setIsExtractModalOpen: (val) => set((state) => ({ isExtractModalOpen: typeof val === 'function' ? (val as any)(state.isExtractModalOpen) : val })),
  setExtractedDrafts: (val) => set((state) => ({ extractedDrafts: typeof val === 'function' ? (val as any)(state.extractedDrafts) : val })),
  setIsExtracting: (val) => set((state) => ({ isExtracting: typeof val === 'function' ? (val as any)(state.isExtracting) : val })),
  setIsEditModalOpen: (val) => set((state) => ({ isEditModalOpen: typeof val === 'function' ? (val as any)(state.isEditModalOpen) : val })),
  setEditingItem: (val) => set((state) => ({ editingItem: typeof val === 'function' ? (val as any)(state.editingItem) : val })),
  setIsPushDiffModalOpen: (val) => set((state) => ({ isPushDiffModalOpen: typeof val === 'function' ? (val as any)(state.isPushDiffModalOpen) : val })),
  setIsPushing: (val) => set((state) => ({ isPushing: typeof val === 'function' ? (val as any)(state.isPushing) : val })),
  setIsGithubModalOpen: (val) => set((state) => ({ isGithubModalOpen: typeof val === 'function' ? (val as any)(state.isGithubModalOpen) : val })),
  setGitIssues: (val) => set((state) => ({ gitIssues: typeof val === 'function' ? (val as any)(state.gitIssues) : val })),
  setFetchingIssues: (val) => set((state) => ({ fetchingIssues: typeof val === 'function' ? (val as any)(state.fetchingIssues) : val })),
  setImportingIssues: (val) => set((state) => ({ importingIssues: typeof val === 'function' ? (val as any)(state.importingIssues) : val })),
  setGitIssuesSearch: (val) => set((state) => ({ gitIssuesSearch: typeof val === 'function' ? (val as any)(state.gitIssuesSearch) : val })),
  setDocTemplates: (val) => set((state) => ({ docTemplates: typeof val === 'function' ? (val as any)(state.docTemplates) : val })),
  setSelectedTemplateId: (val) => set((state) => ({ selectedTemplateId: typeof val === 'function' ? (val as any)(state.selectedTemplateId) : val })),
  setDocsTargetFolder: (val) => set((state) => ({ docsTargetFolder: typeof val === 'function' ? (val as any)(state.docsTargetFolder) : val })),
  setGeneratingDoc: (val) => set((state) => ({ generatingDoc: typeof val === 'function' ? (val as any)(state.generatingDoc) : val })),
  setPatchingDoc: (val) => set((state) => ({ patchingDoc: typeof val === 'function' ? (val as any)(state.patchingDoc) : val })),
  setSavingDoc: (val) => set((state) => ({ savingDoc: typeof val === 'function' ? (val as any)(state.savingDoc) : val })),
  setDocContent: (val) => set((state) => ({ docContent: typeof val === 'function' ? (val as any)(state.docContent) : val })),
  setDocPathsList: (val) => set((state) => ({ docPathsList: typeof val === 'function' ? (val as any)(state.docPathsList) : val })),
  setSelectedDocPath: (val) => set((state) => ({ selectedDocPath: typeof val === 'function' ? (val as any)(state.selectedDocPath) : val })),
}));
