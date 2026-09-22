import React from "react";
import { Sparkles, X, Plus } from "lucide-react";
import { usePlanningStore } from "../../../store/usePlanningStore";
import type { PlanWorkspaceItem } from "../../../backend/db";

export interface ExtractionModalProps {
  handleConfirmExtraction: () => void;
}

export function ExtractionModal({ handleConfirmExtraction }: ExtractionModalProps) {
  const {
    isExtractModalOpen,
    setIsExtractModalOpen,
    isExtracting,
    extractedDrafts,
    setExtractedDrafts
  } = usePlanningStore();

  if (!isExtractModalOpen) return null;

  return (
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
                    title: "New Scoped Item",
                    description: "Outline the objective here...",
                    category: "frontend",
                    status: "draft"
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
  );
}
