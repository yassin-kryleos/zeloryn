import React, { useState, useEffect } from 'react';
import { Folder, File, ArrowLeft, Eye } from 'lucide-react';

interface FileBrowserProps {
  workspaceRoot: string;
  onUpdateWorkspaceRoot?: (newRoot: string) => void;
  onNotify?: (message: string, kind?: 'success' | 'error' | 'warning' | 'info') => void;
}

interface FileEntry {
  name: string;
  isDirectory: boolean;
  size?: number;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({ workspaceRoot, onUpdateWorkspaceRoot, onNotify }) => {
  const [currentPath, setCurrentPath] = useState<string>('.');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [previewFile, setPreviewFile] = useState<{ name: string; content: string } | null>(null);
  const [workspaceInput, setWorkspaceInput] = useState<string>(workspaceRoot);

  const handleBrowseFolder = async () => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI) {
      try {
        const selectedPath = await electronAPI.selectDirectory();
        if (selectedPath) {
          setWorkspaceInput(selectedPath);
          onUpdateWorkspaceRoot?.(selectedPath);
        }
      } catch (err: any) {
        onNotify?.(`Failed to browse directory: ${err.message}`, 'error');
      }
    }
  };

  const [showCreateInput, setShowCreateInput] = useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = useState<string>('');

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    const relativePath = currentPath === '.' 
      ? newItemName.trim() 
      : `${currentPath}/${newItemName.trim()}`;

    try {
      const response = await fetch(`${API_BASE_URL}/files/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: relativePath,
          isDirectory: showCreateInput === 'folder'
        })
      });
      if (response.ok) {
        setNewItemName('');
        setShowCreateInput(null);
        fetchFiles(currentPath);
      } else {
        const data = await response.json();
        onNotify?.(`Failed to create item: ${data.error}`, 'error');
      }
    } catch (err: any) {
      onNotify?.(`Failed to create item: ${err.message}`, 'error');
    }
  };

  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedContent, setEditedContent] = useState<string>('');

  const handleSaveEditedFile = async () => {
    if (!previewFile) return;
    const filePath = currentPath === '.' ? previewFile.name : `${currentPath}/${previewFile.name}`;
    try {
      const response = await fetch(`${API_BASE_URL}/files/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: filePath,
          content: editedContent
        })
      });
      if (response.ok) {
        setIsEditing(false);
        setPreviewFile({ name: previewFile.name, content: editedContent });
        fetchFiles(currentPath);
      } else {
        const data = await response.json();
        onNotify?.(`Failed to save file: ${data.error}`, 'error');
      }
    } catch (err: any) {
      onNotify?.(`Failed to save file: ${err.message}`, 'error');
    }
  };

  const renderCsvTable = (csvContent: string) => {
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return <div className="text-forge-dim italic text-center py-4">Empty CSV</div>;

    const rows = lines.map(line => {
      return line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
    });

    const headers = rows[0];
    const dataRows = rows.slice(1);

    return (
      <div className="overflow-x-auto select-text">
        <table className="min-w-full border-collapse border border-forge-dark text-[10px] font-mono select-text">
          <thead>
            <tr className="bg-forge-very-dark border-b border-forge-dim">
              {headers.map((h, i) => (
                <th key={i} className="border border-forge-dark px-2 py-1 text-left text-forge-neon font-bold uppercase tracking-wider select-text">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-forge-very-dark hover:bg-forge-very-dark hover:bg-opacity-20 select-text">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="border border-forge-dark px-2 py-1 text-forge-text select-text">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Git Integration states
  const [gitActive, setGitActive] = useState<boolean>(false);
  const [gitBranch, setGitBranch] = useState<string>('detached');
  const [gitFiles, setGitFiles] = useState<Array<{ file: string; state: 'modified' | 'staged' | 'untracked' }>>([]);
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [gitLoading, setGitLoading] = useState<boolean>(false);
  const [gitSyncing, setGitSyncing] = useState<boolean>(false);

  const handleGitPush = async () => {
    try {
      setGitSyncing(true);
      const response = await fetch(`${API_BASE_URL}/git/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: gitBranch })
      });
      const data = await response.json() as any;
      setGitSyncing(false);
      onNotify?.(data.success ? 'Successfully pushed changes to upstream repository.' : `Push failed: ${data.output}`, data.success ? 'success' : 'error');
      fetchGitStatus();
    } catch (err: any) {
      setGitSyncing(false);
      onNotify?.(`Git push error: ${err.message}`, 'error');
    }
  };

  const handleGitPull = async () => {
    try {
      setGitSyncing(true);
      const response = await fetch(`${API_BASE_URL}/git/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: gitBranch })
      });
      const data = await response.json() as any;
      setGitSyncing(false);
      onNotify?.(data.success ? 'Successfully pulled latest changes from remote repository.' : `Pull failed: ${data.output}`, data.success ? 'success' : 'error');
      fetchGitStatus();
      fetchFiles(currentPath);
    } catch (err: any) {
      setGitSyncing(false);
      onNotify?.(`Git pull error: ${err.message}`, 'error');
    }
  };

  const fetchGitStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/git/status`);
      if (response.ok) {
        const data = await response.json();
        setGitActive(data.success);
        setGitBranch(data.currentBranch);
        setGitFiles(data.files);
      }
    } catch {
      setGitActive(false);
    }
  };

  const handleStageFile = async (filePath: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/git/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      });
      if (response.ok) {
        onNotify?.(`Staged ${filePath}`, 'success');
        fetchGitStatus();
      }
    } catch (err: any) {
      onNotify?.(`Staging failed: ${err.message}`, 'error');
    }
  };

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim()) return;
    setGitLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMessage.trim() })
      });
      const data = await response.json();
      onNotify?.(data.success === false ? `Commit failed: ${data.output}` : data.output || 'Commit complete.', data.success === false ? 'error' : 'success');
      setCommitMessage('');
      fetchGitStatus();
    } catch (err: any) {
      onNotify?.(`Commit error: ${err.message}`, 'error');
    } finally {
      setGitLoading(false);
    }
  };

  useEffect(() => {
    fetchGitStatus();
  }, [workspaceRoot, files]);

  useEffect(() => {
    setWorkspaceInput(workspaceRoot);
  }, [workspaceRoot]);

  const fetchFiles = async (dirPath: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/files?path=${encodeURIComponent(dirPath)}`);
      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }
      const data = await response.json();
      const sorted = (data as FileEntry[]).sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      setFiles(sorted);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath, workspaceRoot]);

  const handleDirectoryClick = (dirName: string) => {
    const nextPath = currentPath === '.' ? dirName : `${currentPath}/${dirName}`;
    setCurrentPath(nextPath);
  };

  const handleBackClick = () => {
    if (currentPath === '.' || currentPath === '') return;
    const parts = currentPath.split('/');
    parts.pop();
    const prevPath = parts.length === 0 ? '.' : parts.join('/');
    setCurrentPath(prevPath);
  };

  const handleFileClick = async (fileName: string) => {
    const filePath = currentPath === '.' ? fileName : `${currentPath}/${fileName}`;
    try {
      const response = await fetch(`${API_BASE_URL}/files/content?path=${encodeURIComponent(filePath)}`);
      if (!response.ok) {
        throw new Error('Failed to read file');
      }
      const data = await response.json();
      setPreviewFile({ name: fileName, content: data.content });
      setEditedContent(data.content);
      setIsEditing(false);
    } catch (err: any) {
      onNotify?.(`Error reading file: ${err.message}`, 'error');
    }
  };

  const handleImportFromDrive = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/google/import-folder`, { method: 'POST' });
      const data = await res.json() as any;
      onNotify?.(data.message || data.error || 'Import result resolved.', data.error ? 'error' : 'info');
      fetchFiles(currentPath);
    } catch (err: any) {
      onNotify?.(`Import error: ${err.message}`, 'error');
    }
  };

  const handlePublishGist = async () => {
    if (!previewFile) return;
    const filePath = currentPath === '.' ? previewFile.name : `${currentPath}/${previewFile.name}`;
    try {
      const response = await fetch(`${API_BASE_URL}/artifacts/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      });
      const data = await response.json() as any;
      if (data.url) {
        navigator.clipboard.writeText(data.url);
        onNotify?.(`Gist shared successfully. URL copied to clipboard: ${data.url}`, 'success');
      } else if (data.requiresBypass) {
        const proceed = window.confirm(`WARNING: Secrets detected in the file:\n${data.secrets.map((s: any) => `- ${s.secretType} (line ${s.line || 'unknown'})`).join('\n')}\n\nForce publish anyway?`);
        if (proceed) {
          const retryRes = await fetch(`${API_BASE_URL}/artifacts/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath, bypassSecrets: true })
          });
          const retryData = await retryRes.json() as any;
          if (retryData.url) {
            navigator.clipboard.writeText(retryData.url);
            onNotify?.(`Gist shared successfully with bypass. URL copied to clipboard: ${retryData.url}`, 'success');
            return;
          }
        }
        onNotify?.('Publish aborted: secrets detected.', 'error');
      } else {
        onNotify?.(data.error || 'Failed to share Gist.', 'error');
      }
    } catch (err: any) {
      onNotify?.(`Publish error: ${err.message}`, 'error');
    }
  };

  const handleDeployVercel = async () => {
    try {
      onNotify?.('Deployment in progress. This may take a few seconds.', 'info');
      const response = await fetch(`${API_BASE_URL}/artifacts/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'vercel' })
      });
      const data = await response.json() as any;
      if (data.success) {
        navigator.clipboard.writeText(data.url);
        onNotify?.(`Deploy successful. Live URL copied to clipboard: ${data.url}`, 'success');
      } else {
        onNotify?.(`Deploy failed: ${data.log}`, 'error');
      }
    } catch (err: any) {
      onNotify?.(`Deployment error: ${err.message}`, 'error');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-2 select-none">
      
      {/* Workspace path settings editor */}
      <div className="flex flex-col gap-1 mb-2 pb-2 border-b border-forge-dark">
        <span className="text-[9px] text-forge-dim tracking-widest font-mono font-bold">
          Workspace directory:
        </span>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={workspaceInput}
            onChange={(e) => setWorkspaceInput(e.target.value)}
            className="flex-1 bg-forge-very-dark border border-forge-dark text-[10px] text-forge-neon font-mono px-1 py-0.5 rounded outline-none"
            placeholder="Absolute folder path..."
          />
          {(window as any).electronAPI && (
            <button
              onClick={handleBrowseFolder}
              className="forge-btn text-[9px] px-1.5 py-0.5 font-bold font-mono"
              title="Browse workspace directory"
            >
              +
            </button>
          )}
          <button
            onClick={() => onUpdateWorkspaceRoot?.(workspaceInput)}
            className="forge-btn text-[9px] px-1.5 py-0.5 font-bold font-mono"
            title="Update workspace directory"
          >
            SET
          </button>
        </div>
      </div>

      {/* File Navigation Header */}
      <div className="flex items-center justify-between border-b border-forge-dark pb-1 mb-2">
        <span className="text-[10px] text-forge-dim tracking-wider font-bold font-mono">
          Workspace files
        </span>
        <div className="flex gap-1">
          <button
            onClick={handleImportFromDrive}
            className="text-[8px] border border-forge-dark px-1.5 py-0.5 rounded transition-colors font-mono font-bold bg-transparent text-forge-dim hover:text-forge-neon"
            title="Import files from Google Drive"
          >
            Import cloud
          </button>
          <button
            onClick={() => setShowCreateInput(showCreateInput === 'file' ? null : 'file')}
            className={`text-[8px] border px-1.5 py-0.5 rounded transition-colors font-mono font-bold ${showCreateInput === 'file' ? 'bg-forge-very-dark border-forge-neon text-forge-neon' : 'bg-transparent border-forge-dark text-forge-dim hover:text-forge-neon'}`}
            title="Create new file"
          >
            + File
          </button>
          <button
            onClick={() => setShowCreateInput(showCreateInput === 'folder' ? null : 'folder')}
            className={`text-[8px] border px-1.5 py-0.5 rounded transition-colors font-mono font-bold ${showCreateInput === 'folder' ? 'bg-forge-very-dark border-forge-neon text-forge-neon' : 'bg-transparent border-forge-dark text-forge-dim hover:text-forge-neon'}`}
            title="Create new folder"
          >
            + Folder
          </button>
        </div>
      </div>

      {/* Item Creator Form */}
      {showCreateInput && (
        <form onSubmit={handleCreateItem} className="flex gap-1 mb-2 bg-forge-very-dark bg-opacity-40 p-1.5 rounded border border-forge-neon">
          <input
            type="text"
            placeholder={showCreateInput === 'file' ? "New file name..." : "New folder name..."}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className="flex-1 bg-forge-very-dark border border-forge-dark outline-none text-[10px] text-forge-neon px-1.5 py-0.5 placeholder:text-forge-dark font-mono rounded"
            autoFocus
          />
          <button
            type="submit"
            className="forge-btn text-[9px] px-1.5 py-0.5 font-bold"
          >
            Create
          </button>
        </form>
      )}

      {/* Back to Parent Directory Button */}
      {currentPath !== '.' && (
        <button
          onClick={handleBackClick}
          className="flex items-center gap-1.5 text-[10px] text-forge-neon hover:text-white font-mono mb-2 pb-1 border-b border-forge-very-dark text-left"
        >
          <ArrowLeft size={10} />
          <span>[..] Back</span>
        </button>
      )}

      {/* Workspace files list */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px] space-y-0.5 pr-1">
        {loading ? (
          <div className="text-forge-dim animate-pulse">scanning...</div>
        ) : error ? (
          <div className="neon-red">error: {error}</div>
        ) : files.length === 0 ? (
          <div className="text-forge-dim italic">empty</div>
        ) : (
          files.map((file) => (
            <div
              key={file.name}
              className="flex items-center justify-between hover:bg-forge-very-dark hover:bg-opacity-50 p-0.5 rounded group cursor-pointer transition-colors duration-150"
            >
              {file.isDirectory ? (
                <div
                  onClick={() => handleDirectoryClick(file.name)}
                  className="flex items-center gap-1.5 text-forge-neon flex-1"
                >
                  <Folder size={12} className="text-forge-dim" />
                  <span className="truncate">{file.name}/</span>
                </div>
              ) : (
                <div
                  onClick={() => handleFileClick(file.name)}
                  className="flex items-center gap-1.5 text-forge-text flex-1"
                >
                  <File size={12} className="text-forge-dark group-hover:text-forge-text" />
                  <span className="truncate text-forge-text group-hover:text-white">{file.name}</span>
                </div>
              )}

              {!file.isDirectory && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFileClick(file.name);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-forge-neon hover:text-white px-1"
                  title="View Content"
                >
                  <Eye size={10} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Git Integration Panel */}
      {gitActive && (
        <div className="mt-3 pt-3 border-t border-forge-dark flex flex-col gap-2 bg-forge-very-dark/80 border border-forge-dark/50 p-2 rounded">
          <div className="flex items-center justify-between text-[9px] text-forge-neon tracking-widest font-bold font-mono">
            <span>Git branch // {gitBranch}</span>
            <div className="flex gap-2">
              <button onClick={handleGitPull} disabled={gitSyncing} className="hover:underline text-forge-dim cursor-pointer disabled:opacity-40">Pull</button>
              <button onClick={handleGitPush} disabled={gitSyncing} className="hover:underline text-forge-dim cursor-pointer disabled:opacity-40">Push</button>
              <button onClick={fetchGitStatus} className="hover:underline text-forge-dim cursor-pointer">Refresh</button>
            </div>
          </div>
          
          {gitFiles.length === 0 ? (
            <div className="text-[9px] text-forge-dim italic text-center py-1">Workspace clean</div>
          ) : (
            <div className="max-h-20 overflow-y-auto space-y-1 pr-1 text-[9px] font-mono">
              {gitFiles.map(gf => (
                <div key={gf.file} className="flex items-center justify-between gap-2 hover:bg-forge-very-dark p-0.5 rounded">
                  <span className="truncate text-forge-text" title={gf.file}>{gf.file}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[8px] uppercase font-bold px-1 border rounded ${gf.state === 'staged' ? 'text-emerald-400 border-emerald-800 bg-emerald-950/40' : gf.state === 'modified' ? 'text-amber-400 border-amber-800 bg-amber-950/40' : 'text-gray-400 border-gray-800'}`}>
                      {gf.state}
                    </span>
                    {gf.state !== 'staged' && (
                      <button
                        onClick={() => handleStageFile(gf.file)}
                        className="text-forge-neon border border-forge-dark hover:border-forge-neon rounded px-1 text-[8px] cursor-pointer"
                        title="Stage changes (git add)"
                      >
                        Stage
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleCommit} className="flex gap-1 pt-1 border-t border-forge-dark">
            <input
              type="text"
              placeholder="Commit message..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              disabled={gitLoading}
              className="flex-1 bg-forge-bg border border-forge-dark text-[9px] text-forge-text placeholder:text-forge-dim font-mono px-1.5 py-0.5 rounded outline-none"
            />
            <button
              type="submit"
              disabled={gitLoading || gitFiles.filter(f => f.state === 'staged').length === 0}
              className="forge-btn text-[8px] px-2 py-0.5 font-bold disabled:opacity-50 cursor-pointer"
            >
              Commit
            </button>
          </form>
        </div>
      )}

      {/* File Preview Terminal overlay modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4 backdrop-blur-sm select-text">
          <div className="w-full max-w-4xl h-[80vh] flex flex-col p-4 bg-forge-panel-bg border border-forge-neon rounded font-mono select-text">
            
            {/* Modal Title bar */}
            <div className="flex items-center justify-between border-b border-forge-neon pb-2 mb-3">
              <span className="text-xs font-bold text-forge-neon tracking-widest">
                {isEditing ? 'EDITING' : 'PREVIEW'} // {previewFile.name ? previewFile.name.toUpperCase() : ''}
              </span>
              <div className="flex gap-3">
                {!isEditing && (
                  <>
                    <button
                      onClick={handlePublishGist}
                      className="text-forge-neon hover:text-white text-xs border border-forge-dark px-2 py-0.5 rounded hover:border-forge-neon bg-forge-very-dark cursor-pointer font-bold"
                      title="Share Gist"
                    >
                      [SHARE GIST]
                    </button>
                    <button
                      onClick={handleDeployVercel}
                      className="text-forge-neon hover:text-white text-xs border border-forge-dark px-2 py-0.5 rounded hover:border-forge-neon bg-forge-very-dark cursor-pointer font-bold"
                      title="Deploy Static Web"
                    >
                      [DEPLOY WEB]
                    </button>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="text-forge-neon hover:text-white text-xs border border-forge-dark px-2 py-0.5 rounded hover:border-forge-neon bg-forge-very-dark cursor-pointer font-bold"
                    >
                      [EDIT]
                    </button>
                  </>
                )}
                {isEditing && (
                  <button
                    onClick={handleSaveEditedFile}
                    className="text-forge-neon hover:text-white text-xs border border-forge-neon px-2 py-0.5 rounded bg-forge-very-dark cursor-pointer font-bold animate-pulse"
                  >
                    [SAVE]
                  </button>
                )}
                <button
                  onClick={() => {
                    setPreviewFile(null);
                    setIsEditing(false);
                  }}
                  className="text-forge-neon hover:text-white cursor-pointer"
                >
                  [X]
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto bg-forge-very-dark border border-forge-dark p-3 rounded font-mono text-xs text-[#aeffc9] select-text">
              {isEditing ? (
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="w-full h-full bg-transparent border-0 outline-none text-[#aeffc9] font-mono text-xs resize-none select-text focus:ring-0"
                  autoFocus
                />
              ) : previewFile.name.toLowerCase().endsWith('.csv') ? (
                renderCsvTable(previewFile.content)
              ) : (
                <pre className="m-0 bg-transparent border-0 p-0 overflow-visible whitespace-pre-wrap select-text">
                  {previewFile.content || '// Empty file'}
                </pre>
              )}
            </div>

            {/* Close Button */}
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => {
                  setPreviewFile(null);
                  setIsEditing(false);
                }}
                className="forge-btn text-xs"
              >
                CLOSE PREVIEW
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
