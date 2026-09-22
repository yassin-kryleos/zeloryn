import React from "react";
import { X } from "lucide-react";
import { usePlanningStore } from "../../../store/usePlanningStore";
import { getCategoryColor } from "../RightPane";

export interface PushToCrewModalProps {
  selectedItemIds: Set<string>;
  executePushToCrew: () => void;
}

export function PushToCrewModal({ selectedItemIds, executePushToCrew }: PushToCrewModalProps) {
  const {
    isPushDiffModalOpen,
    setIsPushDiffModalOpen,
    isPushing,
    workspaceItems
  } = usePlanningStore();

  if (!isPushDiffModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono select-none">
      <div className="w-full max-w-lg border border-forge-neon rounded bg-forge-panel-bg p-5 flex flex-col max-h-[80vh]">
        <div className="flex justify-between items-center border-b border-forge-dark pb-2">
          <span className="text-xs font-bold text-forge-neon uppercase tracking-wider">
            Staged Crew Sync Review ({selectedItemIds.size} items)
          </span>
          <button
            type="button"
            onClick={() => setIsPushDiffModalOpen(false)}
            className="text-forge-dim hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto my-3 space-y-2 pr-1">
          <div className="text-[10px] text-forge-dim leading-relaxed mb-2">
            The following plan items will be injected into the system prompt context of the CREW agents (Technical Reviewer, etc.) during co-working.
          </div>
          {workspaceItems.filter(it => selectedItemIds.has(it.id)).map(item => (
            <div key={item.id} className="border border-forge-dark rounded p-2.5 bg-black/30">
              <div className="flex justify-between">
                <span className="text-xs font-bold text-white truncate">{item.title}</span>
                <span className={`text-[8px] uppercase border px-1 rounded font-bold ${getCategoryColor(item.category)}`}>
                  {item.category}
                </span>
              </div>
              <div className="text-[10px] text-forge-dim mt-1 line-clamp-2">{item.description}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-forge-dark pt-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsPushDiffModalOpen(false)}
            className="forge-secondary-button text-[10px] py-1.5 px-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={executePushToCrew}
            disabled={isPushing}
            className="forge-btn text-[10px] py-1.5 px-4 font-bold disabled:opacity-40"
          >
            {isPushing ? "Syncing..." : "Confirm Sync to CREW"}
          </button>
        </div>
      </div>
    </div>
  );
}
