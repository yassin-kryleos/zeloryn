import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  RotateCcw,
  CheckCircle2,
  FileCode,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';

export interface DiffSafetyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify?: (message: string, kind?: 'success' | 'error' | 'warning' | 'info') => void;
}

interface GitReviewFile {
  filePath: string;
  state: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  workingDiff?: string;
  stagedDiff?: string;
  status?: 'pending' | 'accepted' | 'rejected' | 'reverted' | 'staged';
}

export const DiffSafetyDrawer: React.FC<DiffSafetyDrawerProps> = ({
  isOpen,
  onClose,
  onNotify
}) => {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<GitReviewFile[]>([]);
  const [currentBranch, setCurrentBranch] = useState('main');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [confirmRevertFile, setConfirmRevertFile] = useState<string | null>(null);

  const fetchDiffStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/review/current');
      if (res.ok) {
        const data = await res.json();
        if (data.success !== false) {
          setFiles(data.files || []);
          setCurrentBranch(data.currentBranch || 'main');
          if (data.files && data.files.length > 0 && !selectedFile) {
            setSelectedFile(data.files[0].filePath);
          }
        }
      }
    } catch {
      // Backend may not be reachable or outside git repo
    } finally {
      setLoading(false);
    }
  }, [selectedFile]);

  useEffect(() => {
    if (isOpen) {
      fetchDiffStatus();
    }
  }, [isOpen, fetchDiffStatus]);

  if (!isOpen) return null;

  const handleAcceptFile = async (filePath: string) => {
    try {
      const res = await fetch('http://localhost:3001/api/review/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, status: 'accepted' })
      });
      if (res.ok) {
        onNotify?.(`Accepted changes in ${filePath}`, 'success');
        await fetchDiffStatus();
      }
    } catch (err: any) {
      onNotify?.(`Failed to accept changes: ${err.message}`, 'error');
    }
  };

  const handleDiscardFile = async (filePath: string) => {
    try {
      const res = await fetch('http://localhost:3001/api/review/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      });
      if (res.ok) {
        onNotify?.(`Discarded changes in ${filePath}`, 'info');
        setConfirmRevertFile(null);
        await fetchDiffStatus();
      }
    } catch (err: any) {
      onNotify?.(`Failed to discard changes: ${err.message}`, 'error');
    }
  };

  const toggleExpand = (filePath: string) => {
    setExpandedFiles(prev => ({ ...prev, [filePath]: !prev[filePath] }));
  };

  const totalModified = files.length;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/60 backdrop-blur-xs font-mono select-none">
      <div className="w-full max-w-2xl bg-zinc-950 border-l border-zinc-800 shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-amber-400" />
            <div>
              <span className="text-sm font-bold text-zinc-100 block">Diff &amp; Undo Safety Drawer</span>
              <span className="text-[10px] text-zinc-400">
                Branch: <code className="text-emerald-400 font-semibold">{currentBranch}</code> • {totalModified} modified file(s)
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchDiffStatus}
              disabled={loading}
              title="Refresh working changes"
              className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {totalModified === 0 ? (
            <div className="text-center py-16 flex flex-col items-center gap-2">
              <CheckCircle2 size={32} className="text-emerald-400 opacity-60" />
              <span className="text-sm font-bold text-zinc-200">Working Tree Clean</span>
              <p className="text-xs text-zinc-500 max-w-sm">
                No uncommitted changes detected. When AI agents modify your codebase, you can review and safely undo every line here.
              </p>
            </div>
          ) : (
            files.map(f => {
              const diffText = f.workingDiff || f.stagedDiff || '';
              const isExpanded = Boolean(expandedFiles[f.filePath]);
              const isConfirming = confirmRevertFile === f.filePath;

              const stateColor =
                f.state === 'added' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' :
                f.state === 'deleted' ? 'text-red-400 border-red-500/30 bg-red-500/10' :
                f.state === 'untracked' ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' :
                'text-amber-400 border-amber-500/30 bg-amber-500/10';

              return (
                <div
                  key={f.filePath}
                  className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/30"
                >
                  {/* File Bar */}
                  <div className="px-3 py-2.5 flex items-center justify-between gap-2 bg-zinc-900/70 border-b border-zinc-800">
                    <button
                      type="button"
                      onClick={() => toggleExpand(f.filePath)}
                      className="flex items-center gap-2 text-left min-w-0 flex-1 hover:text-white transition-colors cursor-pointer"
                    >
                      {isExpanded ? <ChevronDown size={14} className="text-zinc-400 shrink-0" /> : <ChevronRight size={14} className="text-zinc-400 shrink-0" />}
                      <FileCode size={14} className="text-zinc-400 shrink-0" />
                      <span className="text-xs font-semibold text-zinc-200 truncate">{f.filePath}</span>
                      <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded border ${stateColor} font-bold`}>
                        {f.state}
                      </span>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isConfirming ? (
                        <div className="flex items-center gap-1 bg-red-950/70 border border-red-800 px-2 py-0.5 rounded">
                          <span className="text-[10px] text-red-300">Confirm discard?</span>
                          <button
                            type="button"
                            onClick={() => handleDiscardFile(f.filePath)}
                            className="text-[9px] bg-red-600 hover:bg-red-500 text-white font-bold px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            Yes, Undo
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRevertFile(null)}
                            className="text-[9px] text-zinc-400 hover:text-white px-1"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setConfirmRevertFile(f.filePath)}
                            title="Discard changes in this file (git checkout)"
                            className="text-[10px] font-bold text-red-400 hover:text-red-300 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-2 py-1 rounded flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <RotateCcw size={11} />
                            <span>Discard (Undo)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAcceptFile(f.filePath)}
                            title="Accept and stage changes in this file"
                            className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <CheckCircle2 size={11} />
                            <span>Accept</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Diff Viewer Body */}
                  {isExpanded && (
                    <div className="p-2 bg-black text-[11px] overflow-x-auto font-mono max-h-72">
                      {diffText ? (
                        <pre className="leading-tight m-0">
                          {diffText.split('\n').map((line, idx) => {
                            let lineClass = 'text-zinc-400';
                            if (line.startsWith('+') && !line.startsWith('+++')) lineClass = 'text-emerald-400 bg-emerald-950/20';
                            else if (line.startsWith('-') && !line.startsWith('---')) lineClass = 'text-red-400 bg-red-950/20';
                            else if (line.startsWith('@@')) lineClass = 'text-cyan-400 font-bold';
                            return (
                              <div key={idx} className={`${lineClass} px-1 whitespace-pre`}>
                                {line}
                              </div>
                            );
                          })}
                        </pre>
                      ) : (
                        <div className="text-zinc-500 italic p-2">No textual diff available for this file.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-900/40 flex items-center justify-between text-[11px] text-zinc-400">
          <span>Safe Undo Protection: All changes can be reverted anytime</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
