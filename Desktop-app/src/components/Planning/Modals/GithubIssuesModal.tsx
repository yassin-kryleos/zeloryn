import React from "react";
import { Globe, X } from "lucide-react";
import { usePlanningStore } from "../../../store/usePlanningStore";

export interface GithubIssuesModalProps {
  gitTokenInput: string;
  setGitTokenInput: (val: string) => void;
  gitRepoInput: string;
  setGitRepoInput: (val: string) => void;
  selectedGitIssueIds: Set<number>;
  setSelectedGitIssueIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  handleFetchGithubIssues: () => void;
  handleImportGithubIssues: () => void;
}

export function GithubIssuesModal({
  gitTokenInput,
  setGitTokenInput,
  gitRepoInput,
  setGitRepoInput,
  selectedGitIssueIds,
  setSelectedGitIssueIds,
  handleFetchGithubIssues,
  handleImportGithubIssues
}: GithubIssuesModalProps) {
  const {
    isGithubModalOpen,
    setIsGithubModalOpen,
    gitIssues,
    fetchingIssues,
    importingIssues,
    gitIssuesSearch,
    setGitIssuesSearch
  } = usePlanningStore();

  if (!isGithubModalOpen) return null;

  return (
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
                {fetchingIssues ? "FETCHING..." : "FETCH"}
              </button>
            </div>
          </div>
        </div>

        {/* Issues checklist */}
        <div className="flex-1 overflow-y-auto min-h-[160px] border border-forge-dark rounded bg-black/40 p-2.5 space-y-2">
          {gitIssues.length === 0 ? (
            <div className="h-full flex items-center justify-center text-forge-dim text-[10px] italic py-8">
              {fetchingIssues ? "Connecting to GitHub API..." : "No issues loaded. Connect repository and click Fetch."}
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
                    const s = (gitIssuesSearch || "").toLowerCase();
                    return String(issue.number || "").includes(s) || (issue.title || "").toLowerCase().includes(s);
                  })
                  .map(issue => {
                    const isSelected = selectedGitIssueIds.has(issue.id);
                    return (
                      <label
                        key={issue.id}
                        className={`flex items-start gap-2.5 p-2 rounded border transition-all cursor-pointer ${
                          isSelected ? "border-forge-neon bg-forge-dark/25" : "border-forge-very-dark bg-black/20 hover:border-forge-dark"
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
              {importingIssues ? "IMPORTING..." : `IMPORT SELECTED (${selectedGitIssueIds.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
