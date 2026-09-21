import { API_BASE_URL } from '../api/client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, FolderOpen, GitBranch, Globe, Monitor, RefreshCw, Smartphone, Tablet, Terminal } from 'lucide-react';
import type { AgentLog } from '../backend/agents';
import { FileBrowser } from './FileBrowser';
import { CodebaseGraph } from './CodebaseGraph';
import { CodeReviewPanel } from './CodeReviewPanel';
import { FeatureBadge } from './FeatureBadge';
import { InteractiveTerminal } from './InteractiveTerminal';

type PreviewTab = 'files' | 'live' | 'terminal' | 'artifacts' | 'review';
type ViewportMode = 'desktop' | 'tablet' | 'mobile';

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
  ws: WebSocket | null;
  isConnected: boolean;
  commandPendingApproval?: { tool: string; command: string; commandId?: string } | null;
  onUpdateWorkspaceRoot?: (newRoot: string) => void;
  onOpenFilePreview: (path: string) => void;
  onPinFile: (path: string) => void;
  onNotify?: (message: string, kind?: 'success' | 'error' | 'warning' | 'info') => void;
}

const tabs: Array<{ id: PreviewTab; label: string; status: 'production' | 'preview' | 'planned' }> = [
  { id: 'files', label: 'Files', status: 'production' },
  { id: 'live', label: 'Live Preview', status: 'production' },
  { id: 'terminal', label: 'Terminal', status: 'production' },
  { id: 'artifacts', label: 'Artifacts', status: 'preview' },
  { id: 'review', label: 'Review', status: 'production' },
];

export const PreviewDeck: React.FC<PreviewDeckProps> = ({
  workspaceRoot,
  logs,
  isStreaming,
  ws,
  isConnected,
  commandPendingApproval,
  onUpdateWorkspaceRoot,
  onOpenFilePreview,
  onPinFile,
  onNotify
}) => {
  const [activeTab, setActiveTab] = useState<PreviewTab>('files');
  const [previewUrl, setPreviewUrl] = useState('http://localhost:5173');
  const [previewKey, setPreviewKey] = useState(0);
  const [viewportMode, setViewportMode] = useState<ViewportMode>('desktop');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filesMode, setFilesMode] = useState<'browser' | 'visualizer'>('browser');
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactItem | null>(null);
  const [artifactContent, setArtifactContent] = useState('');
  const [isExportingAudit, setIsExportingAudit] = useState(false);

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
      const res = await fetch(`${API_BASE_URL}/artifacts`);
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
      const res = await fetch(`${API_BASE_URL}/artifacts/content?path=${encodeURIComponent(artifact.path)}`);
      if (!res.ok) throw new Error('artifact preview unavailable');
      const data = await res.json();
      setArtifactContent(data.content || '');
    } catch (err: any) {
      setArtifactContent(`Unable to preview artifact: ${err.message}`);
    }
  };

  const handleExportAuditTrail = async () => {
    setIsExportingAudit(true);
    try {
      const res = await fetch(`${API_BASE_URL}/audit/export`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onNotify?.(`Audit trail exported to ${data.exportDir}`, 'success');
        if (activeTab === 'artifacts') loadArtifacts();
      } else {
        onNotify?.(`Export failed: ${data.error}`, 'error');
      }
    } catch (err: any) {
      onNotify?.(`Audit export unavailable: ${err.message}`, 'error');
    } finally {
      setIsExportingAudit(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'artifacts') {
      loadArtifacts();
    }
  }, [activeTab, loadArtifacts]);

  // Auto-refresh timer for live preview if enabled
  useEffect(() => {
    if (!autoRefresh || activeTab !== 'live') return;
    const interval = setInterval(() => {
      setPreviewKey(prev => prev + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, activeTab]);

  return (
    <aside className="border-l border-forge-dark bg-forge-panel-bg overflow-hidden flex flex-col w-[440px] min-w-[380px]">
      <div className="forge-panel-header">
        <div className="flex items-center justify-between mb-2">
          <span className="forge-panel-title">Preview deck</span>
          <FeatureBadge status="production" label="PM-Workflow" compact />
        </div>
        <div className="grid grid-cols-5 gap-1">
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 forge-panel-title">
                <Globe size={12} />
                <span>Live Preview</span>
                <FeatureBadge status="production" compact />
              </div>
              {/* Responsive Viewport Controls */}
              <div className="flex items-center gap-1 border border-forge-dark rounded p-0.5 bg-black/40">
                <button
                  type="button"
                  onClick={() => setViewportMode('desktop')}
                  className={`p-1 rounded ${viewportMode === 'desktop' ? 'bg-forge-neon text-black' : 'text-forge-dim hover:text-white'}`}
                  title="Desktop View (100%)"
                >
                  <Monitor size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewportMode('tablet')}
                  className={`p-1 rounded ${viewportMode === 'tablet' ? 'bg-forge-neon text-black' : 'text-forge-dim hover:text-white'}`}
                  title="Tablet View (768px)"
                >
                  <Tablet size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewportMode('mobile')}
                  className={`p-1 rounded ${viewportMode === 'mobile' ? 'bg-forge-neon text-black' : 'text-forge-dim hover:text-white'}`}
                  title="Mobile View (375px)"
                >
                  <Smartphone size={11} />
                </button>
              </div>
            </div>

            {/* URL Input and Presets */}
            <div className="flex flex-col gap-1">
              <div className="flex gap-1">
                <input
                  value={previewUrl}
                  onChange={(e) => setPreviewUrl(e.target.value)}
                  className="forge-input flex-1 text-[10px]"
                  placeholder="http://localhost:5173"
                />
                <button
                  type="button"
                  onClick={() => setPreviewKey(prev => prev + 1)}
                  className="forge-btn px-2"
                  title="Refresh preview"
                >
                  <RefreshCw size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => window.open(previewUrl, '_blank')}
                  className="forge-btn px-2"
                  title="Open externally"
                >
                  <ExternalLink size={11} />
                </button>
              </div>
              <div className="flex items-center justify-between text-[8px] text-forge-dim px-0.5">
                <div className="flex items-center gap-1">
                  <span>Presets:</span>
                  {['5173', '3000', '8080'].map(port => (
                    <button
                      key={port}
                      type="button"
                      onClick={() => setPreviewUrl(`http://localhost:${port}`)}
                      className="hover:text-forge-neon underline"
                    >
                      :{port}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="w-2.5 h-2.5 accent-forge-neon"
                  />
                  <span>Auto-refresh (5s)</span>
                </label>
              </div>
            </div>

            <div className="text-[9px] text-forge-dim border border-forge-dark bg-black bg-opacity-30 rounded p-1.5">
              Viewport: <span className="text-forge-neon font-bold uppercase">{viewportMode}</span>. Local URLs run sandboxed and isolated from command approvals.
            </div>

            {/* Preview Frame with Viewport Simulation */}
            <div className="flex-1 overflow-auto flex justify-center bg-black/40 border border-forge-dark rounded p-1">
              <iframe
                key={previewKey}
                src={previewUrl}
                className={`h-full bg-white border border-forge-dark rounded transition-all duration-200 ${
                  viewportMode === 'desktop'
                    ? 'w-full'
                    : viewportMode === 'tablet'
                      ? 'w-[768px] max-w-full shadow-lg'
                      : 'w-[375px] max-w-full shadow-lg'
                }`}
                title="Zeloryn Live Preview"
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
            </div>
          </div>
        )}

        {activeTab === 'terminal' && (
          <InteractiveTerminal ws={ws} isConnected={isConnected} />
        )}

        {activeTab === 'artifacts' && (
          <div className="h-full p-2 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 forge-panel-title">
                <FileText size={12} />
                <span>Artifacts & Compliance</span>
                <FeatureBadge status="production" compact />
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleExportAuditTrail}
                  disabled={isExportingAudit}
                  className="forge-btn text-[9px] px-2 py-0.5 flex items-center gap-1 border-forge-neon text-forge-neon"
                  title="Export full compliance audit package (Markdown, JSON, CSV)"
                >
                  <Download size={10} /> {isExportingAudit ? 'EXPORTING...' : 'AUDIT EXPORT'}
                </button>
                <button type="button" onClick={loadArtifacts} className="forge-secondary-button text-[9px] px-2 py-0.5">Refresh</button>
              </div>
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
                <span>Review & Compliance</span>
                <FeatureBadge status="production" compact />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-forge-dim">
                  diffs {reviewSummary.diffMentions} / cmds {reviewSummary.commandMentions}
                </span>
                <button
                  type="button"
                  onClick={handleExportAuditTrail}
                  disabled={isExportingAudit}
                  className="forge-btn text-[8px] px-1.5 py-0.5 border-forge-neon text-forge-neon flex items-center gap-1"
                  title="Generate Compliance Audit Trail"
                >
                  <Download size={9} /> Audit
                </button>
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
