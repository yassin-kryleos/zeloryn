import React, { useEffect, useState } from 'react';
import { Rocket, FolderOpen, Sparkles, Database, GitBranch, FlaskConical, AlertTriangle } from 'lucide-react';

interface WorkspaceFingerprint {
  isExistingCodebase: boolean;
  hasReadme: boolean;
  hasGit: boolean;
  hasTests: boolean;
  packageManagers: string[];
  languages: string[];
  fileCount: number;
}

interface ProjectSetupScreenProps {
  defaultWorkspace: string;
  hasProvider: boolean;
  onStart: (payload: { projectName: string; workspaceFolder: string; description: string }) => void;
  onUpdateWorkspaceRoot?: (path: string) => void;
  onOpenConfig?: () => void;
}

export function ProjectSetupScreen({
  defaultWorkspace,
  hasProvider,
  onStart,
  onUpdateWorkspaceRoot,
  onOpenConfig
}: ProjectSetupScreenProps) {
  const [projectName, setProjectName] = useState('');
  const [workspaceFolder, setWorkspaceFolder] = useState(defaultWorkspace);
  const [description, setDescription] = useState('');
  const [fingerprint, setFingerprint] = useState<WorkspaceFingerprint | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(() => localStorage.getItem('legal_terms_accepted') === 'true');

  useEffect(() => { setWorkspaceFolder(defaultWorkspace); }, [defaultWorkspace]);

  const scanWorkspace = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch('http://localhost:3001/api/plan/bootstrap');
      const data = await res.json();
      if (res.ok && data.success) setFingerprint(data.fingerprint as WorkspaceFingerprint);
      else throw new Error(data.error || `Scan failed (HTTP ${res.status})`);
    } catch (err: any) {
      setFingerprint(null);
      setScanError(
        /failed to fetch/i.test(err.message)
          ? 'Could not reach the Forge backend on port 3001. Is it running?'
          : err.message
      );
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => { scanWorkspace(); }, []);

  const canStart = workspaceFolder.trim().length > 0 && termsAccepted;

  const handleAcceptToggle = (checked: boolean) => {
    setTermsAccepted(checked);
    if (checked) localStorage.setItem('legal_terms_accepted', 'true');
    else localStorage.removeItem('legal_terms_accepted');
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-forge-bg text-forge-text p-6 overflow-auto">
      <div className="w-full max-w-xl border border-color rounded bg-secondary p-6 space-y-4 shadow-lg">
        <div className="text-center space-y-1">
          <div className="text-[15px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 text-forge-text">
            <Rocket size={16} /> Set Up Your Project
          </div>
          <div className="text-[10px] text-forge-dim">Four fields. Then start building in PLAN.</div>
        </div>

        <div className="space-y-1 flex flex-col">
          <label className="text-[10px] text-forge-dim uppercase font-bold">Project name</label>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="My App"
            className="forge-input text-[12px] px-2.5 py-1.5"
          />
        </div>

        <div className="space-y-1 flex flex-col">
          <label className="text-[10px] text-forge-dim uppercase font-bold flex items-center gap-1"><FolderOpen size={11} /> Workspace folder</label>
          <div className="flex gap-2">
            <input
              value={workspaceFolder}
              onChange={(e) => setWorkspaceFolder(e.target.value)}
              placeholder="Absolute path to your project folder"
              className="flex-1 forge-input text-[12px] px-2.5 py-1.5"
            />
            <button
              type="button"
              onClick={() => { onUpdateWorkspaceRoot?.(workspaceFolder.trim()); scanWorkspace(); }}
              className="forge-btn text-[10px] px-2.5"
            >
              SCAN
            </button>
          </div>
        </div>

        {/* Existing-codebase fingerprint */}
        {scanError && !scanning && (
          <div className="border border-amber-500/30 bg-amber-500/10 rounded px-3 py-2 text-[10px] text-amber-500 flex items-center gap-1.5">
            <AlertTriangle size={11} /> {scanError}
          </div>
        )}
        {scanning ? (
          <div className="text-[10px] text-forge-dim animate-pulse">Scanning workspace…</div>
        ) : fingerprint?.isExistingCodebase && (
          <div className="border border-cyan-500/30 bg-cyan-500/10 rounded px-3 py-2 text-[10px] space-y-1 text-cyan-600 dark:text-cyan-400">
            <div className="text-cyan-500 font-bold uppercase">Existing codebase detected</div>
            <div className="flex flex-wrap gap-1.5 text-[9px]">
              {fingerprint.languages.map(lang => <span key={lang} className="border border-cyan-500/30 text-cyan-500 rounded px-1.5 py-0.5">{lang}</span>)}
              {fingerprint.packageManagers.map(pm => <span key={pm} className="border border-forge-dark text-forge-dim rounded px-1.5 py-0.5 flex items-center gap-1"><Database size={8} />{pm}</span>)}
              {fingerprint.hasGit && <span className="border border-forge-dark text-forge-dim rounded px-1.5 py-0.5 flex items-center gap-1"><GitBranch size={8} />git</span>}
              {fingerprint.hasTests && <span className="border border-forge-dark text-forge-dim rounded px-1.5 py-0.5 flex items-center gap-1"><FlaskConical size={8} />tests</span>}
              <span className="text-forge-dim">{fingerprint.fileCount}+ files</span>
            </div>
            <div className="text-forge-dim">Describe what you're building or improving — PLAN will scope it against this code.</div>
          </div>
        )}

        <div className="space-y-1 flex flex-col">
          <label className="text-[10px] text-forge-dim uppercase font-bold flex items-center gap-1"><Sparkles size={11} className="text-purple-400" /> What are you building?</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short description of the app, feature, or change you want to build…"
            rows={4}
            className="forge-input text-[12px] px-2.5 py-1.5 resize-none"
          />
        </div>

        {!hasProvider && (
          <div className="border border-amber-500/30 bg-amber-500/10 rounded px-3 py-2 text-[10px] text-amber-500 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5"><AlertTriangle size={11} /> No model provider configured yet.</span>
            {onOpenConfig && (
              <button type="button" onClick={onOpenConfig} className="text-[9px] border border-amber-500/30 rounded px-2 py-0.5 hover:bg-amber-500/20">
                CONFIGURE
              </button>
            )}
          </div>
        )}

        <label className="flex items-start gap-2 text-[10px] text-forge-dim cursor-pointer">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => handleAcceptToggle(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I agree to the{' '}
            <a href="https://kryleos.com/terms" target="_blank" rel="noopener noreferrer" className="text-forge-text underline hover:text-forge-neon">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="https://kryleos.com/privacy" target="_blank" rel="noopener noreferrer" className="text-forge-text underline hover:text-forge-neon">
              Privacy Policy
            </a>, and understand that agents will run shell commands and modify files in this workspace.
          </span>
        </label>

        <button
          type="button"
          disabled={!canStart}
          onClick={() => onStart({ projectName: projectName.trim(), workspaceFolder: workspaceFolder.trim(), description: description.trim() })}
          className="w-full forge-btn text-[12px] py-2 font-bold flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Rocket size={13} /> START BUILDING
        </button>
      </div>
    </div>
  );
}
