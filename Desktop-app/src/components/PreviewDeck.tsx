import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, FolderOpen, GitBranch, Globe, MessageSquare, RefreshCw, Terminal } from 'lucide-react';
import type { AgentLog } from '../backend/agents';
import { FileBrowser } from './FileBrowser';
import { CodebaseGraph } from './CodebaseGraph';
import { CodeReviewPanel } from './CodeReviewPanel';
import { FeatureBadge } from './FeatureBadge';

type PreviewTab = 'files' | 'live' | 'terminal' | 'sidechat' | 'artifacts' | 'review';

interface ArtifactItem {
  path: string;
  name: string;
  type: string;
  size: number;
}

interface PreviewDeckProps {
  workspaceRoot: string;
  logs: AgentLog[];
  isStreaming: boolean;
  commandPendingApproval?: { tool: string; command: string; commandId?: string } | null;
  onUpdateWorkspaceRoot?: (newRoot: string) => void;
  onOpenFilePreview: (path: string) => void;
  onPinFile: (path: string) => void;
  onNotify?: (message: string, kind?: 'success' | 'error' | 'warning' | 'info') => void;
  onSendQuery: (query: string) => void;
}

const tabs: Array<{ id: PreviewTab; label: string; status: 'production' | 'preview' | 'planned' }> = [
  { id: 'files', label: 'Files', status: 'production' },
  { id: 'live', label: 'Live Preview', status: 'preview' },
  { id: 'terminal', label: 'Terminal', status: 'preview' },
  { id: 'sidechat', label: 'Side Chat', status: 'preview' },
  { id: 'artifacts', label: 'Artifacts', status: 'preview' },
  { id: 'review', label: 'Review', status: 'production' },
];

export const PreviewDeck: React.FC<PreviewDeckProps> = ({
  workspaceRoot,
  logs,
  isStreaming,
  commandPendingApproval,
  onUpdateWorkspaceRoot,
  onOpenFilePreview,
  onPinFile,
  onNotify,
  onSendQuery
}) => {
  const [activeTab, setActiveTab] = useState<PreviewTab>('files');
  const [previewUrl, setPreviewUrl] = useState('http://localhost:5173');
  const [previewKey, setPreviewKey] = useState(0);
  const [filesMode, setFilesMode] = useState<'browser' | 'visualizer'>('browser');
  const [sideInput, setSideInput] = useState('');
  const [sideMessages, setSideMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: 'Ask a context-only question here. This pane does not write files or run commands.' }
  ]);
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactItem | null>(null);
  const [artifactContent, setArtifactContent] = useState('');

  const terminalLogs = useMemo(() => {
    return logs.filter(log => {
      const sender = String(log.sender || '').toLowerCase();
      const message = String(log.message || '').toLowerCase();
      return sender.includes('terminal') || sender.includes('tool') || message.includes('command') || message.includes('stdout') || message.includes('stderr');
    }).slice(-30);
  }, [logs]);

  const reviewSummary = useMemo(() => {
    const diffMentions = logs.filter(log => String(log.message || '').includes('--- DIFF CONTENT ---')).length;
    const commandMentions = terminalLogs.length;
    const riskMentions = logs.filter(log => /risk|security|secret|dependency|config/i.test(String(log.message || ''))).length;
    return { diffMentions, commandMentions, riskMentions };
  }, [logs, terminalLogs.length]);

  const loadArtifacts = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3001/api/artifacts');
      if (!res.ok) throw new Error('artifact route unavailable');
      const data = await res.json();
      setArtifacts(data.artifacts || []);
    } catch (err: any) {
      onNotify?.(`Could not load artifacts: ${err.message}`, 'warning');
    }
  }, [onNotify]);

  const loadArtifactContent = async (artifact: ArtifactItem) => {
    setSelectedArtifact(artifact);
    try {
      const res = await fetch(`http://localhost:3001/api/artifacts/content?path=${encodeURIComponent(artifact.path)}`);
      if (!res.ok) throw new Error('artifact preview unavailable');
      const data = await res.json();
      setArtifactContent(data.content || '');
    } catch (err: any) {
      setArtifactContent(`Unable to preview artifact: ${err.message}`);
    }
  };

  useEffect(() => {
    if (activeTab === 'artifacts') {
      loadArtifacts();
    }
  }, [activeTab, loadArtifacts]);

  const handleSideQuestion = () => {
    const clean = sideInput.trim();
    if (!clean) return;
    setSideMessages(prev => [
      ...prev,
      { role: 'user', content: clean },
      {
        role: 'assistant',
        content: `Context note queued locally. For workspace-changing work, send it through the main FORGE agent so command approvals and review still apply.\n\nQuestion: ${clean}`
      }
    ]);
    setSideInput('');
  };

  return (
    <aside className="border-l border-forge-dark bg-forge-panel-bg overflow-hidden flex flex-col w-[420px] min-w-[360px]">
      <div className="forge-panel-header">
        <div className="flex items-center justify-between mb-2">
          <span className="forge-panel-title">Preview deck</span>
          <FeatureBadge status="preview" label="Preview" compact />
        </div>
        <div className="grid grid-cols-3 gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border rounded px-1.5 py-1 text-[9px] font-bold ${
                activeTab === tab.id
                  ? 'border-forge-neon bg-forge-very-dark text-forge-neon'
                  : 'border-forge-dark text-forge-dim hover:text-white'
              }`}
              title={`${tab.label} (${tab.status})`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'files' && (
          <div className="h-full p-2 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 forge-panel-title">
                <FolderOpen size={12} />
                <span>Workspace Files</span>
                <FeatureBadge status="production" compact />
              </div>
              <div className="flex border border-forge-dark rounded text-[8px] font-bold">
                <button
                  type="button"
                  onClick={() => setFilesMode('browser')}
                  className={`px-1.5 py-0.5 ${filesMode === 'browser' ? 'bg-forge-neon text-black' : 'text-forge-dim hover:text-white'}`}
                >
                  Explorer
                </button>
                <button
                  type="button"
                  onClick={() => setFilesMode('visualizer')}
                  className={`px-1.5 py-0.5 ${filesMode === 'visualizer' ? 'bg-forge-neon text-black' : 'text-forge-dim hover:text-white'}`}
                >
                  Visualizer
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden border border-forge-dark rounded">
              {filesMode === 'browser' ? (
                <FileBrowser workspaceRoot={workspaceRoot} onUpdateWorkspaceRoot={onUpdateWorkspaceRoot} onNotify={onNotify} />
              ) : (
                <CodebaseGraph onOpenFilePreview={onOpenFilePreview} onPinFile={onPinFile} />
              )}
            </div>
          </div>
        )}

        {activeTab === 'live' && (
          <div className="h-full p-2 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 forge-panel-title">
              <Globe size={12} />
              <span>Live Preview</span>
              <FeatureBadge status="preview" compact />
            </div>
            <div className="flex gap-1">
              <input
                value={previewUrl}
                onChange={(e) => setPreviewUrl(e.target.value)}
                className="forge-input flex-1 text-[10px]"
                placeholder="http://localhost:5173"
              />
              <button type="button" onClick={() => setPreviewKey(prev => prev + 1)} className="forge-btn px-2" title="Refresh preview">
                <RefreshCw size={11} />
              </button>
              <button type="button" onClick={() => window.open(previewUrl, '_blank')} className="forge-btn px-2" title="Open externally">
                <ExternalLink size={11} />
              </button>
            </div>
            <div className="text-[9px] text-forge-dim border border-forge-dark bg-black bg-opacity-30 rounded p-1.5">
              Local/user-entered URLs only. Preview pages are treated as untrusted and cannot bypass command approvals.
            </div>
            <iframe
              key={previewKey}
              src={previewUrl}
              className="flex-1 w-full bg-white border border-forge-dark rounded"
              title="Kryleos Forge Live Preview"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          </div>
        )}

        {activeTab === 'terminal' && (
          <div className="h-full p-2 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 forge-panel-title">
              <Terminal size={12} />
              <span>Terminal Evidence</span>
              <FeatureBadge status="preview" compact />
            </div>
            {commandPendingApproval && (
              <div className="border border-amber-500/30 bg-amber-500/10 text-amber-500 rounded p-2 text-[10px]">
                <div className="font-bold uppercase mb-1">Command waiting for approval</div>
                <code className="text-forge-text break-all">{commandPendingApproval.command}</code>
              </div>
            )}
            {isStreaming && (
              <div className="forge-status-chip forge-status-chip-success animate-pulse">
                Forge run is active. Execution traces will update after completion.
              </div>
            )}
            <div className="flex-1 overflow-y-auto border border-forge-dark rounded bg-black bg-opacity-40 p-2 text-[9px] space-y-2">
              {terminalLogs.length === 0 ? (
                <div className="text-forge-dim italic text-center py-8">No command evidence in this session yet.</div>
              ) : (
                terminalLogs.map((log, idx) => (
                  <div key={`${log.timestamp || idx}-${idx}`} className="border-b border-forge-dark pb-1.5 last:border-b-0">
                    <div className="text-forge-dim uppercase font-bold">{log.sender}</div>
                    <pre className="whitespace-pre-wrap text-[9px] max-h-32 overflow-y-auto">{log.message}</pre>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'sidechat' && (
          <div className="h-full p-2 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 forge-panel-title">
              <MessageSquare size={12} />
              <span>Side Chat</span>
              <FeatureBadge status="preview" compact />
            </div>
            <div className="flex-1 overflow-y-auto border border-forge-dark rounded bg-black bg-opacity-40 p-2 text-[10px] space-y-2">
              {sideMessages.map((msg, idx) => (
                <div key={idx} className={`p-2 rounded border ${msg.role === 'user' ? 'ml-6 border-forge-dark text-forge-text' : 'mr-6 border-forge-neon border-opacity-30 text-forge-text'}`}>
                  <div className="text-[8px] text-forge-dim font-bold uppercase mb-1">{msg.role}</div>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-1">
              <input
                value={sideInput}
                onChange={(e) => setSideInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSideQuestion()}
                className="forge-input flex-1 text-[10px]"
                placeholder="Ask without changing files..."
              />
              <button type="button" onClick={handleSideQuestion} className="forge-btn text-[9px] font-bold">Ask</button>
            </div>
            <button
              type="button"
              onClick={() => onSendQuery(`[SIDE CHAT PROMOTED TO FORGE]\n${sideMessages.map(m => `${m.role}: ${m.content}`).join('\n')}`)}
              className="forge-secondary-button"
            >
              Send side context to Forge
            </button>
          </div>
        )}

        {activeTab === 'artifacts' && (
          <div className="h-full p-2 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 forge-panel-title">
                <FileText size={12} />
                <span>Artifacts</span>
                <FeatureBadge status="preview" compact />
              </div>
              <button type="button" onClick={loadArtifacts} className="forge-secondary-button">Refresh</button>
            </div>
            <div className="grid grid-cols-[150px_1fr] gap-2 flex-1 overflow-hidden">
              <div className="border border-forge-dark rounded bg-black bg-opacity-30 overflow-y-auto text-[9px]">
                {artifacts.length === 0 ? (
                  <div className="p-2 text-forge-dim italic">No artifacts found.</div>
                ) : artifacts.map(artifact => (
                  <button
                    key={artifact.path}
                    type="button"
                    onClick={() => loadArtifactContent(artifact)}
                    className={`w-full text-left p-2 border-b border-forge-dark hover:bg-forge-very-dark ${selectedArtifact?.path === artifact.path ? 'text-forge-neon' : 'text-forge-text'}`}
                  >
                    <div className="font-bold truncate">{artifact.name}</div>
                    <div className="text-[8px] text-forge-dim uppercase">{artifact.type}</div>
                  </button>
                ))}
              </div>
              <pre className="m-0 overflow-auto text-[9px] whitespace-pre-wrap">
                {artifactContent || 'Select a Markdown, text, or HTML artifact to preview.'}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'review' && (
          <div className="h-full p-2 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 forge-panel-title">
                <GitBranch size={12} />
                <span>Review Summary</span>
                <FeatureBadge status="production" compact />
              </div>
              <div className="text-[8px] text-forge-dim">
                diffs {reviewSummary.diffMentions} / commands {reviewSummary.commandMentions} / risks {reviewSummary.riskMentions}
              </div>
            </div>
            <div className="flex-1 overflow-hidden border border-forge-dark rounded">
              <CodeReviewPanel logs={logs} onOpenFilePreview={onOpenFilePreview} onNotify={onNotify} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
