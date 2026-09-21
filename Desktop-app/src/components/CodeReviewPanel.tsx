import { API_BASE_URL } from '../api/client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, FileDiff, GitBranch, RefreshCw, RotateCcw, ShieldAlert, Terminal, XCircle } from 'lucide-react';
import type { AgentLog } from '../backend/agents';

interface CodeReviewPanelProps {
  logs: AgentLog[];
  onOpenFilePreview: (path: string) => void;
  onNotify?: (message: string, kind?: 'success' | 'error' | 'warning' | 'info') => void;
}

type ReviewStatus = 'pending' | 'accepted' | 'rejected' | 'reverted' | 'staged';

interface ReviewFileFromApi {
  id: string;
  file: string;
  state: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  hasWorkingChanges: boolean;
  hasStagedChanges: boolean;
  reviewStatus: ReviewStatus;
  diff: string;
  stagedDiff: string;
  riskNotes: string[];
  updatedAt: string;
}

interface ReviewStateResponse {
  success: boolean;
  currentBranch: string;
  files: ReviewFileFromApi[];
  message?: string;
}

interface ChangeRecord {
  id: string;
  filePath: string;
  header: string;
  diffLines: string[];
  stagedDiffLines: string[];
  risks: string[];
  reviewStatus: ReviewStatus;
  source: 'git' | 'log';
  state: string;
  hasWorkingChanges: boolean;
  hasStagedChanges: boolean;
}

interface EvidenceRecord {
  id: string;
  timestamp: string;
  message: string;
  level: 'info' | 'error';
}

interface CcDeviationRecord {
  id: string;
  snapshotId: string;
  file: string;
  action: 'modified' | 'created' | 'deleted';
  diff: string;
  planItemId?: string;
  status: 'pending' | 'accepted' | 'rejected';
  riskNotes: string[];
  createdAt: string;
  updatedAt: string;
}

const diffStartMarker = '--- DIFF CONTENT ---';
const diffEndMarker = '--------------------';

const extractFilePath = (header: string): string => {
  const quoted = header.match(/"(.*?)"/);
  if (quoted?.[1]) return quoted[1];

  const changed = header.match(/Successfully\s+(?:modified|wrote|created|updated)\s+(?:file\s+)?([a-zA-Z0-9_\-./\\~]+)/i);
  return changed?.[1] || 'unknown file';
};

const detectLogRisks = (filePath: string, diffLines: string[]): string[] => {
  const risks: string[] = [];
  const lowerPath = filePath.toLowerCase();
  const removedCount = diffLines.filter(line => line.startsWith('-')).length;
  const addedCount = diffLines.filter(line => line.startsWith('+')).length;
  const diffText = diffLines.join('\n').toLowerCase();

  if (/\b(env|secret|token|api[_-]?key|password|credential|\.pem)\b/.test(lowerPath) || /\b(secret|token|api[_-]?key|password|credential)\b/.test(diffText)) {
    risks.push('Sensitive config or credential-like text changed');
  }

  if (/(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|vite\.config|tsconfig|electron|server\.ts)$/.test(lowerPath)) {
    risks.push('Build, dependency, or runtime configuration touched');
  }

  if (removedCount >= 20 || addedCount >= 40) {
    risks.push('Large change; inspect before accepting');
  }

  if (diffLines.some(line => line.startsWith('-') && /auth|billing|sync|permission|sandbox|delete|remove/i.test(line))) {
    risks.push('Security, billing, sync, or deletion behavior may be affected');
  }

  return risks;
};

const parseLogChanges = (logs: AgentLog[]): ChangeRecord[] => {
  return logs.flatMap((log, index) => {
    if (log.type !== 'result' || !log.message.includes(diffStartMarker)) return [];

    const [headerPart, diffPart] = log.message.split(diffStartMarker);
    const diffBlock = diffPart?.split(diffEndMarker)[0]?.trim();
    if (!diffBlock) return [];

    const header = headerPart.trim();
    const filePath = extractFilePath(header);
    const diffLines = diffBlock.split('\n');

    return [{
      id: `log-${index}-${filePath}`,
      filePath,
      header,
      diffLines,
      stagedDiffLines: [],
      risks: detectLogRisks(filePath, diffLines),
      reviewStatus: 'pending' as const,
      source: 'log' as const,
      state: 'session-diff',
      hasWorkingChanges: true,
      hasStagedChanges: false
    }];
  });
};

const parseEvidence = (logs: AgentLog[]): EvidenceRecord[] => {
  return logs.flatMap((log, index) => {
    const lower = log.message.toLowerCase();
    const isTerminal = log.sender.toLowerCase() === 'terminal';
    const looksLikeVerification = lower.includes('npm run') ||
      lower.includes('vitest') ||
      lower.includes('test') ||
      lower.includes('lint') ||
      lower.includes('build') ||
      lower.includes('completed with code') ||
      lower.includes('integrity check') ||
      lower.includes('remote container') ||
      lower.includes('local host execution');

    if (!isTerminal && !looksLikeVerification) return [];

    return [{
      id: `${index}-${log.timestamp}`,
      timestamp: log.timestamp,
      message: log.message.trim(),
      level: log.type === 'error' ? 'error' as const : 'info' as const
    }];
  }).slice(-8);
};

const mapApiFile = (file: ReviewFileFromApi): ChangeRecord => ({
  id: `git-${file.id}`,
  filePath: file.file,
  header: `${file.state.toUpperCase()} | ${file.hasStagedChanges ? 'staged' : 'unstaged'}${file.hasWorkingChanges ? ' + working' : ''}`,
  diffLines: file.diff ? file.diff.split('\n') : [],
  stagedDiffLines: file.stagedDiff ? file.stagedDiff.split('\n') : [],
  risks: file.riskNotes,
  reviewStatus: file.reviewStatus,
  source: 'git',
  state: file.state,
  hasWorkingChanges: file.hasWorkingChanges,
  hasStagedChanges: file.hasStagedChanges
});

const diffLineClass = (line: string): string => {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git') || line.startsWith('@@')) {
    return 'text-cyan-300 opacity-90';
  }
  if (line.startsWith('+')) return 'diff-add font-bold';
  if (line.startsWith('-')) return 'diff-remove font-bold';
  return 'text-forge-dim opacity-75';
};

export const CodeReviewPanel: React.FC<CodeReviewPanelProps> = ({ logs, onOpenFilePreview, onNotify }) => {
  const [reviewState, setReviewState] = useState<ReviewStateResponse | null>(null);
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<Record<string, ReviewStatus | 'REVERTING' | 'ERROR'>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [pendingRevertId, setPendingRevertId] = useState<string | null>(null);

  // CC deviation state
  const [ccDeviations, setCcDeviations] = useState<CcDeviationRecord[]>([]);
  const [ccLoading, setCcLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'changes' | 'cc-deviation'>('changes');

  const evidence = useMemo(() => parseEvidence(logs), [logs]);
  const logChanges = useMemo(() => parseLogChanges(logs), [logs]);
  const gitChanges = useMemo(() => reviewState?.success ? reviewState.files.map(mapApiFile) : [], [reviewState]);
  const changes = gitChanges.length > 0 ? gitChanges : logChanges;
  const selectedChange = changes.find(change => change.id === selectedChangeId) || changes[0] || null;
  const riskCount = changes.reduce((count, change) => count + change.risks.length, 0);
  const gitEnabled = Boolean(reviewState?.success);

  // ── CC Deviation helpers ─────────────────────────────────────────────────────
  const refreshCcDeviations = useCallback(async () => {
    try {
      setCcLoading(true);
      const res = await fetch(`${API_BASE_URL}/cc-deviations`);
      const data = await res.json() as { success: boolean; records: CcDeviationRecord[] };
      if (data.success) setCcDeviations(data.records);
    } catch {
      // Non-critical — CC deviation may not be available
    } finally {
      setCcLoading(false);
    }
  }, []);

  const updateCcDeviationStatus = useCallback(async (id: string, status: 'accepted' | 'rejected') => {
    setCcDeviations(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    try {
      await fetch(`${API_BASE_URL}/cc-deviations/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      onNotify?.(`CC deviation ${status}.`, status === 'rejected' ? 'warning' : 'success');
    } catch {
      onNotify?.('Failed to update CC deviation status.', 'error');
    }
  }, [onNotify]);

  useEffect(() => {
    refreshCcDeviations();
  }, [logs.length, refreshCcDeviations]);

  const refreshReview = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/review/current`);
      const data = await response.json() as ReviewStateResponse;
      setReviewState(data);
    } catch {
      setReviewState({ success: false, currentBranch: 'offline', files: [], message: 'Review backend is unavailable.' });
      onNotify?.('Review backend is unavailable. Falling back to session diffs if available.', 'warning');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    refreshReview();
  }, [logs.length, refreshReview]);

  useEffect(() => {
    if (!selectedChangeId && changes.length > 0) {
      setSelectedChangeId(changes[0].id);
    }
  }, [changes, selectedChangeId]);

  const updateStatus = async (change: ChangeRecord, status: ReviewStatus) => {
    setLocalStatus(prev => ({ ...prev, [change.id]: status }));
    if (change.source === 'git') {
      await fetch(`${API_BASE_URL}/review/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: change.filePath, status })
      });
      await refreshReview();
      onNotify?.(`${change.filePath} marked ${status}.`, status === 'rejected' ? 'warning' : 'success');
    } else {
      onNotify?.(`${change.filePath} marked ${status} for this session.`, status === 'rejected' ? 'warning' : 'success');
    }
  };

  const stageChange = async (change: ChangeRecord, staged: boolean) => {
    if (change.source !== 'git') return;
    setLocalStatus(prev => ({ ...prev, [change.id]: staged ? 'staged' : 'pending' }));
    const response = await fetch(`${API_BASE_URL}/review/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: change.filePath, staged })
    });
    const data = await response.json();
    onNotify?.(data.message || `${staged ? 'Staged' : 'Unstaged'} ${change.filePath}.`, data.success ? 'success' : 'error');
    await refreshReview();
  };

  const revertChange = async (change: ChangeRecord) => {
    try {
      setLocalStatus(prev => ({ ...prev, [change.id]: 'REVERTING' }));
      const endpoint = change.source === 'git' ? '/api/review/revert' : '/api/workspace/revert';
      const response = await fetch(`http://localhost:3001${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: change.filePath })
      });
      const data = await response.json();
      setLocalStatus(prev => ({ ...prev, [change.id]: data.success ? 'reverted' : 'ERROR' }));
      setPendingRevertId(null);
      onNotify?.(data.message || (data.success ? `Reverted ${change.filePath}.` : `Unable to revert ${change.filePath}.`), data.success ? 'success' : 'error');
      await refreshReview();
    } catch {
      setLocalStatus(prev => ({ ...prev, [change.id]: 'ERROR' }));
      onNotify?.(`Unable to revert ${change.filePath}.`, 'error');
    }
  };

  const renderDiffLines = (change: ChangeRecord) => {
    const sections: Array<{ label: string; lines: string[] }> = [];
    if (change.stagedDiffLines.length > 0) sections.push({ label: 'STAGED DIFF', lines: change.stagedDiffLines });
    if (change.diffLines.length > 0) sections.push({ label: change.source === 'git' ? 'WORKING DIFF' : 'SESSION DIFF', lines: change.diffLines });

    if (sections.length === 0) {
      return <div className="p-2 text-[10px] text-forge-dim">No diff content available for this file.</div>;
    }

    return sections.map(section => (
      <div key={`${change.id}-${section.label}`}>
        <div className="sticky top-0 bg-forge-panel-bg border-y border-forge-dark px-2 py-1 text-[9px] text-cyan-300 font-bold">
          {section.label}
        </div>
        {section.lines.map((line, index) => (
          <div key={`${change.id}-${section.label}-${index}`} className={`${diffLineClass(line)} whitespace-pre-wrap px-2 py-0.5`}>
            {line}
          </div>
        ))}
      </div>
    ));
  };

  // ── Tab bar ──────────────────────────────────────────────────────────────────
  const pendingCcCount = ccDeviations.filter(d => d.status === 'pending').length;

  const tabBar = (
    <div className="flex gap-0 border-b border-forge-dark">
      <button
        onClick={() => setActiveTab('changes')}
        className={`px-3 py-1.5 text-[10px] font-bold tracking-widest inline-flex items-center gap-1.5 ${activeTab === 'changes' ? 'text-forge-neon border-b-2 border-forge-neon' : 'text-forge-dim hover:text-forge-text'}`}
        type="button"
      >
        <FileDiff size={12} />
        CHANGES
        {changes.length > 0 && <span className="text-[9px] opacity-70">({changes.length})</span>}
      </button>
      <button
        onClick={() => { setActiveTab('cc-deviation'); if (ccDeviations.length === 0) refreshCcDeviations(); }}
        className={`px-3 py-1.5 text-[10px] font-bold tracking-widest inline-flex items-center gap-1.5 ${activeTab === 'cc-deviation' ? 'text-cyan-300 border-b-2 border-cyan-300' : 'text-forge-dim hover:text-forge-text'}`}
        type="button"
      >
        <Terminal size={12} />
        CC DEVIATION
        {pendingCcCount > 0 && <span className="bg-red-500 text-white rounded-full px-1.5 text-[8px]">{pendingCcCount}</span>}
      </button>
    </div>
  );

  // ── CC Deviation view ──────────────────────────────────────────────────────
  const renderCcDeviations = () => {
    if (ccLoading) {
      return <div className="p-3 text-[10px] text-forge-dim">Loading CC deviations...</div>;
    }
    if (ccDeviations.length === 0) {
      return (
        <div className="p-3 text-[10px] text-forge-dim">
          No CC deviation records found. Deviations are generated when a Claude Code CLI run completes — its workspace diff is compared against the pre-run snapshot.
        </div>
      );
    }

    return (
      <div className="flex gap-2 min-h-0 flex-1">
        <div className="w-[42%] overflow-auto border border-forge-dark rounded bg-forge-very-dark bg-opacity-25">
          {ccDeviations.map(record => {
            const diffLines = record.diff ? record.diff.split('\n') : [];
            const added = diffLines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
            const removed = diffLines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;
            const riskCount = record.riskNotes.length;
            const isPending = record.status === 'pending';
            return (
              <div
                key={record.id}
                className={`border-b border-forge-dark p-2 text-[10px] ${isPending ? 'text-forge-text' : 'text-forge-dim opacity-60'}`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="truncate">{record.file.replace(/\\/g, '/').split('/').pop()}</span>
                </div>
                <div className="mt-0.5 text-[9px] text-forge-dim">
                  {record.action} | +{added} / -{removed} | {record.status.toUpperCase()}
                </div>
                {riskCount > 0 && (
                  <div className="mt-0.5 text-[9px] text-red-300">
                    {record.riskNotes.length} risk{riskCount > 1 ? 's' : ''}
                  </div>
                )}
                <div className="flex gap-1.5 mt-1.5">
                  <button
                    onClick={() => updateCcDeviationStatus(record.id, 'accepted')}
                    className="text-[8px] text-forge-neon hover:text-white border border-forge-dark rounded px-1.5 py-0.5"
                    type="button"
                  >
                    ACCEPT
                  </button>
                  <button
                    onClick={() => updateCcDeviationStatus(record.id, 'rejected')}
                    className="text-[8px] text-red-300 hover:text-white border border-red-950 rounded px-1.5 py-0.5"
                    type="button"
                  >
                    REJECT
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex-1 min-w-0 overflow-auto border border-forge-dark rounded bg-forge-very-dark bg-opacity-35">
          {ccDeviations.length > 0 && (
            <>
              <div className="border-b border-forge-dark p-2 text-[10px] text-cyan-300 font-bold">
                DIFF: {ccDeviations[0].file}
              </div>
              {ccDeviations[0].diff ? (
                ccDeviations[0].diff.split('\n').map((line, i) => (
                  <div key={i} className={`${diffLineClass(line)} whitespace-pre-wrap px-2 py-0.5`}>
                    {line}
                  </div>
                ))
              ) : (
                <div className="p-2 text-[9px] text-forge-dim">
                  No git diff available — CC reported changes but no on-disk diff was detected.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  // ── Empty state ───────────────────────────────────────────────────────────
  if (changes.length === 0 && ccDeviations.length === 0) {
    return (
      <div className="flex-1 border border-forge-dark bg-forge-very-dark bg-opacity-20 p-3 font-mono text-xs overflow-auto">
        <div className="flex items-center justify-between gap-2 text-forge-neon font-bold tracking-widest mb-3">
          <span className="inline-flex items-center gap-2">
            <FileDiff size={14} />
            REVIEW
          </span>
          <div className="flex gap-1.5">
            <button onClick={() => refreshCcDeviations()} className="forge-btn text-[9px] inline-flex items-center gap-1" type="button" title="Refresh CC deviations">
              <Terminal size={11} />
              CC DEV
            </button>
            <button onClick={refreshReview} className="forge-btn text-[9px] inline-flex items-center gap-1" type="button">
              <RefreshCw size={11} />
              REFRESH
            </button>
          </div>
        </div>
        {tabBar}
        {activeTab === 'cc-deviation' ? renderCcDeviations() : (
          <p className="text-forge-dim leading-relaxed mt-3">
            Git working/staged changes will appear here. If this is not a Git workspace, session-level agent diffs will appear after Forge modifies files.
          </p>
        )}
        <div className="mt-4 border border-forge-dark rounded p-2 text-[10px] text-forge-dim bg-forge-very-dark bg-opacity-50">
          STATUS: {loading ? 'Refreshing review state...' : reviewState?.message || 'No changed files detected.'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col gap-2 font-mono text-xs">
      {tabBar}

      {activeTab === 'cc-deviation' ? renderCcDeviations() : (
        <>
      <div className="grid grid-cols-4 gap-1.5 text-[9px]">
        <div className="border border-forge-dark rounded p-1.5 bg-forge-very-dark bg-opacity-25">
          <div className="text-forge-dim">CHANGES</div>
          <div className="text-forge-neon font-bold text-sm">{changes.length}</div>
        </div>
        <div className="border border-forge-dark rounded p-1.5 bg-forge-very-dark bg-opacity-25">
          <div className="text-forge-dim">EVIDENCE</div>
          <div className="text-cyan-300 font-bold text-sm">{evidence.length}</div>
        </div>
        <div className="border border-forge-dark rounded p-1.5 bg-forge-very-dark bg-opacity-25">
          <div className="text-forge-dim">RISKS</div>
          <div className={riskCount > 0 ? 'text-red-400 font-bold text-sm' : 'text-forge-neon font-bold text-sm'}>{riskCount}</div>
        </div>
        <div className="border border-forge-dark rounded p-1.5 bg-forge-very-dark bg-opacity-25">
          <div className="text-forge-dim">SOURCE</div>
          <div className="text-cyan-300 font-bold text-[10px] truncate">{gitEnabled ? reviewState?.currentBranch : 'LOGS'}</div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-forge-dim">
        <span className="inline-flex items-center gap-1.5">
          <GitBranch size={11} />
          {gitEnabled ? 'Git-backed persistent review' : 'Session-log fallback review'}
        </span>
        <button onClick={refreshReview} className="text-cyan-300 hover:text-white inline-flex items-center gap-1" type="button">
          <RefreshCw size={11} />
          {loading ? 'REFRESHING' : 'REFRESH'}
        </button>
      </div>

      <div className="flex gap-2 min-h-0 flex-1">
        <div className="w-[42%] overflow-auto border border-forge-dark rounded bg-forge-very-dark bg-opacity-25">
          {changes.map(change => {
            const isSelected = selectedChange?.id === change.id;
            const status = localStatus[change.id] || change.reviewStatus;
            const added = [...change.stagedDiffLines, ...change.diffLines].filter(line => line.startsWith('+') && !line.startsWith('+++')).length;
            const removed = [...change.stagedDiffLines, ...change.diffLines].filter(line => line.startsWith('-') && !line.startsWith('---')).length;
            return (
              <button
                key={change.id}
                onClick={() => setSelectedChangeId(change.id)}
                className={`w-full text-left border-b border-forge-dark p-2 cursor-pointer ${isSelected ? 'bg-forge-very-dark text-forge-neon border border-forge-neon border-opacity-30' : 'text-forge-text hover:bg-forge-very-dark'}`}
                type="button"
              >
                <div className="flex items-center gap-1.5 text-[10px] font-bold">
                  <FileDiff size={12} />
                  <span className="truncate">{change.filePath}</span>
                </div>
                <div className="mt-1 text-[9px] text-forge-dim">
                  {change.state} | +{added} / -{removed}
                </div>
                <div className="mt-1 text-[9px] text-cyan-300">[{String(status).toUpperCase()}]</div>
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-w-0 overflow-hidden flex flex-col border border-forge-dark rounded bg-forge-very-dark bg-opacity-35">
          {selectedChange && (
            <>
              <div className="border-b border-forge-dark p-2">
                <div className="text-forge-neon font-bold truncate">{selectedChange.filePath}</div>
                <div className="text-[9px] text-forge-dim truncate mt-0.5">{selectedChange.header}</div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    onClick={() => updateStatus(selectedChange, 'accepted')}
                    className="forge-btn text-[9px] py-1 px-2 inline-flex items-center gap-1"
                    type="button"
                    title="Persist this change as reviewed and accepted"
                  >
                    <CheckCircle2 size={11} />
                    ACCEPT
                  </button>
                  <button
                    onClick={() => updateStatus(selectedChange, 'rejected')}
                    className="border border-red-950 text-red-300 hover:text-white hover:border-red-500 rounded px-2 py-1 text-[9px] font-bold"
                    type="button"
                    title="Persist this change as rejected without reverting it"
                  >
                    REJECT
                  </button>
                  {selectedChange.source === 'git' && (
                    <button
                      onClick={() => stageChange(selectedChange, !selectedChange.hasStagedChanges)}
                      className="border border-forge-dark text-cyan-300 hover:text-white hover:border-cyan-400 rounded px-2 py-1 text-[9px] font-bold"
                      type="button"
                      title={selectedChange.hasStagedChanges ? 'Unstage this file' : 'Stage this file'}
                    >
                      {selectedChange.hasStagedChanges ? 'UNSTAGE' : 'STAGE'}
                    </button>
                  )}
                  <button
                    onClick={() => setPendingRevertId(selectedChange.id)}
                    className="border border-red-500 text-red-400 hover:text-white bg-forge-very-dark rounded px-2 py-1 text-[9px] font-bold inline-flex items-center gap-1"
                    type="button"
                    title={selectedChange.source === 'git' ? 'Restore tracked files from Git or move untracked files to .kryleos/reverted' : 'Restore the last in-memory snapshot for this file'}
                  >
                    <RotateCcw size={11} />
                    REVERT
                  </button>
                  <button
                    onClick={() => onOpenFilePreview(selectedChange.filePath)}
                    className="border border-forge-dark text-cyan-300 hover:text-white hover:border-cyan-400 rounded px-2 py-1 text-[9px] font-bold inline-flex items-center gap-1"
                    type="button"
                    title="Open current file content preview"
                  >
                    <ExternalLink size={11} />
                    OPEN
                  </button>
                </div>
              </div>

              {pendingRevertId === selectedChange.id && (
                <div className="border-b border-red-500 bg-forge-very-dark p-2 text-[10px] text-red-200">
                  <div className="font-bold mb-1">CONFIRM REVERT</div>
                  <div className="leading-relaxed">
                    This will restore tracked Git changes or move untracked files into `.kryleos/reverted/`. Review the diff before continuing.
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => revertChange(selectedChange)}
                      className="border border-red-500 text-red-200 hover:text-white rounded px-2 py-1 text-[9px] font-bold"
                      type="button"
                    >
                      CONFIRM REVERT
                    </button>
                    <button
                      onClick={() => setPendingRevertId(null)}
                      className="border border-forge-dark text-forge-dim hover:text-white rounded px-2 py-1 text-[9px] font-bold"
                      type="button"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}

              {selectedChange.risks.length > 0 && (
                <div className="border-b border-red-500 bg-forge-very-dark p-2 text-[10px] text-red-300">
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <ShieldAlert size={12} />
                    RISK NOTES
                  </div>
                  {selectedChange.risks.map(risk => (
                    <div key={risk}>- {risk}</div>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-auto text-[10px]">
                {renderDiffLines(selectedChange)}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="max-h-[120px] overflow-auto border border-forge-dark rounded bg-forge-very-dark bg-opacity-25">
        <div className="sticky top-0 bg-forge-panel-bg border-b border-forge-dark p-1.5 flex items-center gap-1.5 text-[10px] text-cyan-300 font-bold">
          <Terminal size={12} />
          COMMAND AND TEST EVIDENCE
        </div>
        {evidence.length === 0 ? (
          <div className="p-2 text-[10px] text-forge-dim">No command, lint, build, or test evidence found in this session yet.</div>
        ) : evidence.map(item => (
          <pre key={item.id} className={`m-0 border-0 border-b border-forge-dark rounded-none max-h-none text-[9px] whitespace-pre-wrap ${item.level === 'error' ? 'text-red-300' : 'text-cyan-200'}`}>
            {item.message.slice(0, 700)}
          </pre>
        ))}
      </div>
      </>
      )}
    </div>
  );
};
