import React from "react";
import { X } from "lucide-react";
import { usePlanningStore } from "../../../store/usePlanningStore";

export interface EditItemModalProps {
  handleSaveEdit: () => void;
}

export function EditItemModal({ handleSaveEdit }: EditItemModalProps) {
  const {
    isEditModalOpen,
    setIsEditModalOpen,
    editingItem,
    setEditingItem
  } = usePlanningStore();

  if (!isEditModalOpen || !editingItem) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono select-none">
      <div className="w-full max-w-md border border-forge-dim rounded bg-forge-panel-bg p-5 flex flex-col">
        <div className="flex justify-between items-center border-b border-forge-dark pb-2">
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            Edit Workspace Item
          </span>
          <button
            type="button"
            onClick={() => setIsEditModalOpen(false)}
            className="text-forge-dim hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="my-4 space-y-3">
          <div className="flex flex-col gap-0.5">
            <label className="text-[8px] text-forge-dim uppercase">Title</label>
            <input
              type="text"
              value={editingItem.title}
              onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
              className="forge-input text-[11px] px-2.5 py-1.5"
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[8px] text-forge-dim uppercase">Category</label>
            <select
              value={editingItem.category}
              onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value as any })}
              className="bg-black border border-forge-dark text-[10px] text-forge-neon p-1.5 rounded font-mono w-full"
            >
              <option value="frontend">Frontend</option>
              <option value="backend">Backend</option>
              <option value="testing">Testing</option>
              <option value="security">Security</option>
              <option value="docs">Docs</option>
              <option value="infra">Infra</option>
            </select>
          </div>

          <div className="flex flex-col gap-0.5">
            <label className="text-[8px] text-forge-dim uppercase">Description</label>
            <textarea
              value={editingItem.description}
              onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
              rows={3}
              className="forge-input text-[11px] px-2.5 py-1.5 resize-none animate-none w-full"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-forge-dark pt-3">
          <button
            type="button"
            onClick={() => setIsEditModalOpen(false)}
            className="forge-secondary-button text-[10px] py-1.5 px-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveEdit}
            className="forge-btn text-[10px] py-1.5 px-4 font-bold"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
