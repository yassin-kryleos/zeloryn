import React from "react";
import { AlertTriangle, X } from "lucide-react";

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

export interface ConfirmationModalProps {
  confirmDialog: ConfirmDialogState | null;
  onClose: () => void;
}

export function ConfirmationModal({ confirmDialog, onClose }: ConfirmationModalProps) {
  if (!confirmDialog || !confirmDialog.isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-mono select-none">
      <div className="w-full max-w-sm border border-red-800 rounded bg-forge-panel-bg p-5 flex flex-col">
        <div className="flex justify-between items-center border-b border-forge-dark pb-2 mb-3">
          <span className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle size={14} /> {confirmDialog.title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-forge-dim hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="text-[10px] text-forge-dim leading-relaxed mb-4">
          {confirmDialog.message}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-forge-dark">
          <button
            type="button"
            onClick={onClose}
            className="forge-secondary-button text-[10px] py-1.5 px-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              confirmDialog.onConfirm();
              onClose();
            }}
            className="forge-btn text-[10px] py-1.5 px-4 font-bold bg-red-950 border-red-700 text-red-200 hover:bg-red-900"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
