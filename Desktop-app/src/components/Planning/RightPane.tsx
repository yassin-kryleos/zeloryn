import React from "react";
import {
  AlertTriangle,
  FileText,
  GitBranch,
  Terminal, FileCode,
  Globe,
  Download,
  RefreshCw,
  AlertCircle,
  Edit,
  Trash2,
  ChevronUp,
  ChevronDown,
  Layers,
  X,
  CheckCircle
} from "lucide-react";
import { usePlanningStore } from "../../store/usePlanningStore";
import { CostHistory } from "./CostHistory";
import { driftClass } from "../../shared/driftClassification";
import type {
  AcceptanceCriterion,
  CriterionResult,
  DriftClassification,
  ExecutionTrace,
  ProjectTask,
  PlanWorkspaceItem
} from "../../backend/db";

function criterionStatusClass(status?: "pass" | "fail" | "unknown") {
  switch (status) {
    case "pass":
      return "text-forge-neon";
    case "fail":
      return "text-forge-red";
    default:
      return "text-forge-dim";
  }
}

function isLowCapacityModel(modelName: string): boolean {
  const m = (modelName || "").toLowerCase();
  if (m.startsWith("ollama:") || m === "llama3" || m === "qwen2.5-coder") return true;
  if (m === "gpt-4o-mini" || m.startsWith("claude-3-5-haiku") || m === "gemini-2.5-flash") return true;
  return false;
}

const getCategoryColor = (cat: string) => {
  switch ((cat || "").toLowerCase()) {
    case "frontend": return "border-cyan-800 text-cyan-300 bg-cyan-950/40";
    case "backend": return "border-purple-800 text-purple-300 bg-purple-950/40";
    case "testing": return "border-green-800 text-green-300 bg-green-950/40";
    case "security": return "border-red-800 text-red-300 bg-red-950/40";
    case "docs": return "border-amber-800 text-amber-300 bg-amber-950/40";
    case "infra": return "border-blue-800 text-blue-300 bg-blue-950/40";
    default: return "border-forge-dark text-forge-dim bg-forge-very-dark";
  }
};

const getFeasibilityVerdictClass = (verd: string) => {
  switch (verd) {
    case "feasible": return "border-forge-neon text-forge-neon bg-green-950/20";
    case "needs_clarification": return "border-amber-600 text-amber-300 bg-amber-950/20";
    case "potential_conflict": return "border-red-600 text-red-400 bg-red-950/20";
    default: return "border-forge-dark text-forge-dim";
  }
};

export interface RightPaneProps {
  workspaceRoot: string;
  workspacePaths?: string[];
  onUpdateWorkspacePaths?: (paths: string[]) => void;
  activeModel?: string;
  tasks?: ProjectTask[];
  onConfirmComplete?: (taskId: string) => Promise<void> | void;
  // Modals & triggers
  onOpenGithubModal?: () => void;
  handlePushToCrewTrigger: () => void;
  openEditModal: (item: PlanWorkspaceItem) => void;
  deleteWorkspaceItem: (id: string) => void;
  // Workspace selection & state
  selectedItemIds: Set<string>;
  toggleSelectAll: () => void;
  toggleSelectItem: (id: string) => void;
  toggleItemStatus: (item: PlanWorkspaceItem) => void;
  checkFeasibility: (item: PlanWorkspaceItem) => void;
  expandedContextIds: Set<string>;
  toggleExpandContext: (id: string) => void;
  activeTargets: string[];
  setActiveTargets: React.Dispatch<React.SetStateAction<string[]>>;
  // Build loop
  runWhatsLeft: () => void;
  exportWhatsLeftMarkdown: () => void;
  loadBuildLoop: () => Promise<void>;
  runEnrichment: () => void;
  enrichDiff: Array<{ taskId: string; title: string; added: AcceptanceCriterion[] }>;
  setEnrichDiff: React.Dispatch<React.SetStateAction<Array<{ taskId: string; title: string; added: AcceptanceCriterion[] }>>>;
  discardEnrichedCriterion: (taskId: string, criterionId: string) => void;
  confirmComplete: (taskId: string) => void;
  // Docs Autopilot
  handleGenerateDoc: () => void;
  handlePatchDoc: () => void;
  handleSaveDoc: () => void;
  // Cost Guard
  loadCostHistory: () => Promise<void>;
  // Founder & Agency Utilities
  agencyBranding: { agencyName: string; logoUrl: string; primaryColor: string };
  setAgencyBranding: React.Dispatch<React.SetStateAction<{ agencyName: string; logoUrl: string; primaryColor: string }>>;
  handleGenerateUtility: (workflowType: "founder" | "agency", workflowId: string) => void;
  handleSaveUtility: () => void;
}

export function RightPane({
  workspaceRoot,
  workspacePaths = [],
  onUpdateWorkspacePaths,
  activeModel = "deepseek-chat",
  tasks = [],
  onConfirmComplete,
  onOpenGithubModal,
  handlePushToCrewTrigger,
  openEditModal,
  deleteWorkspaceItem,
  selectedItemIds,
  toggleSelectAll,
  toggleSelectItem,
  toggleItemStatus,
  checkFeasibility,
  expandedContextIds,
  toggleExpandContext,
  activeTargets,
  setActiveTargets,
  runWhatsLeft,
  exportWhatsLeftMarkdown,
  loadBuildLoop,
  runEnrichment,
  enrichDiff,
  setEnrichDiff,
  discardEnrichedCriterion,
  confirmComplete,
  handleGenerateDoc,
  handlePatchDoc,
  handleSaveDoc,
  loadCostHistory,
  agencyBranding,
  setAgencyBranding,
  handleGenerateUtility,
  handleSaveUtility
}: RightPaneProps) {
  const {
    rightView,
    setRightView,
    generatingUtility,
    utilityContent,
    setUtilityContent,
    utilitySavePath,
    setUtilitySavePath,
    customUtilityPrompt,
    setCustomUtilityPrompt,
    savingUtility,
    currentCost,
    currentInputTokens,
    currentOutputTokens,
    currentSavings,
    sessionCost,
    sessionTokens,
    sessionSavings,
    costHistory,
    costRestricted,
    setCostRestricted,
    costHistoryLoading,
    driftItems,
    loopLoading,
    enriching,
    enrichDismissed,
    setEnrichDismissed,
    confirmingId,
    whatsLeft,
    whatsLeftLoading,
    whatsLeftExport,
    showRepoManager,
    setShowRepoManager,
    newRepoPath,
    setNewRepoPath,
    workspaceItems,
    feasibilityVerdicts,
    setIsGithubModalOpen,
    docTemplates,
    selectedTemplateId,
    setSelectedTemplateId,
    docsTargetFolder,
    setDocsTargetFolder,
    generatingDoc,
    patchingDoc,
    savingDoc,
    docContent,
    setDocContent,
    docPathsList,
    selectedDocPath,
    setSelectedDocPath
  } = usePlanningStore();

  const enrichCandidates = driftItems.filter(
    item => item.results.length > 0 && !item.results.some(r => r.type === "file_exists")
  );

  const tracedItems = driftItems.filter(item => item.latestTrace);

  return (
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
          <CostHistory 
            currentCost={currentCost}
            currentInputTokens={currentInputTokens}
            currentOutputTokens={currentOutputTokens}
            sessionCost={sessionCost}
            sessionTokens={sessionTokens}
            sessionSavings={sessionSavings}
            currentSavings={currentSavings}
            costRestricted={costRestricted}
            setCostRestricted={setCostRestricted}
            costHistory={costHistory}
            costHistoryLoading={costHistoryLoading}
            loadCostHistory={loadCostHistory}
            activeModel="Custom Model"
            zeroEgressMode={false}
          />
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
  );
}
