import React from 'react';
import { Terminal, Shield, ShieldAlert, ArrowRight, Zap, RefreshCw, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../../api/client';

export interface CostHistoryProps {
  activeModel?: string;
  zeroEgressMode?: boolean;
  currentCost: number;
  currentInputTokens: number;
  currentOutputTokens: number;
  sessionCost: number;
  sessionTokens: number;
  sessionSavings: number;
  currentSavings: number;
  costRestricted: boolean;
  setCostRestricted: (val: boolean) => void;
  costHistory: any[];
  costHistoryLoading: boolean;
  loadCostHistory: () => void;
}

export const CostHistory: React.FC<CostHistoryProps> = ({
  currentCost,
  currentInputTokens,
  currentOutputTokens,
  sessionCost,
  sessionTokens,
  sessionSavings,
  currentSavings,
  costRestricted,
  setCostRestricted,
  costHistory,
  costHistoryLoading,
  loadCostHistory,
  activeModel = "Unknown",
  zeroEgressMode = false,
}) => {
  const toggleSpendCap = async () => {
    try {
      await fetch(`${API_BASE_URL}/cost/spend-cap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restricted: !costRestricted })
      });
      setCostRestricted(!costRestricted);
    } catch (e) {}
  };

  return (
    <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-4 font-mono select-none">
            {/* Header */}
            <div className="p-3 border border-forge-dark bg-black/40 rounded flex flex-col gap-1.5 font-mono">
              <span className="text-xs font-bold text-forge-neon uppercase tracking-wider flex items-center gap-1.5">
                <Terminal size={12} /> Cost Guard Dashboard
              </span>
              <p className="text-[10px] text-forge-dim leading-relaxed">
                Monitor token usage, estimate transaction costs, and track context savings in real-time.
              </p>
            </div>

            {/* Stats Cards Grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="border border-forge-dark bg-black/20 p-2.5 rounded flex flex-col gap-0.5">
                <span className="text-[9px] text-forge-dim uppercase">Current Message</span>
                <span className="text-xs font-bold text-forge-neon">${currentCost.toFixed(5)}</span>
                <span className="text-[8px] text-forge-dim">In: {currentInputTokens} | Out: {currentOutputTokens} tkn</span>
              </div>
              <div className="border border-forge-dark bg-black/20 p-2.5 rounded flex flex-col gap-0.5">
                <span className="text-[9px] text-forge-dim uppercase">Session Total</span>
                <span className="text-xs font-bold text-forge-neon">${sessionCost.toFixed(5)}</span>
                <span className="text-[8px] text-forge-dim">Total: {sessionTokens} tkn</span>
              </div>
              <div className="border border-forge-dark bg-black/20 p-2.5 rounded flex flex-col gap-0.5">
                <span className="text-[9px] text-forge-dim uppercase">Token Savings</span>
                <span className="text-xs font-bold text-forge-neon">~{sessionSavings} tkn</span>
                <span className="text-[8px] text-forge-dim">Concise/Minimal mode</span>
              </div>
            </div>

            {/* Model Breakdown */}
            <div className="border border-forge-dark bg-black/20 p-3 rounded space-y-2">
              <span className="text-[10px] font-bold text-forge-text uppercase tracking-wider">Active Configuration</span>
              <div className="flex justify-between text-[10px] py-0.5 border-b border-forge-very-dark">
                <span className="text-forge-dim">Active Model:</span>
                <span className="text-forge-text font-bold">{activeModel}</span>
              </div>
              <div className="flex justify-between text-[10px] py-0.5 border-b border-forge-very-dark">
                <span className="text-forge-dim">Zero Egress Mode:</span>
                <span className={`font-bold ${zeroEgressMode ? 'text-forge-neon' : 'text-forge-dim'}`}>
                  {zeroEgressMode ? 'ENABLED (Local Only)' : 'DISABLED (External Allowed)'}
                </span>
              </div>
            </div>

            {/* Context Size Warning Threshold */}
            <div className="border border-forge-dark bg-black/20 p-3 rounded space-y-2">
              <span className="text-[10px] font-bold text-forge-text uppercase tracking-wider">Context Window Helper</span>
              <p className="text-[9px] text-forge-dim leading-relaxed">
                Large request warning threshold: <strong>15,000 characters (~4,000 tokens)</strong>.
                If text payload exceeds this, a truncation and optimization warning is surfaced before API calls.
              </p>
            </div>

            {/* Cost History */}
            <div className="border border-forge-dark bg-black/20 p-3 rounded space-y-2 flex-1 flex flex-col min-h-[200px]">
              <span className="text-[10px] font-bold text-forge-text uppercase tracking-wider flex justify-between items-center">
                <span>Cost Log History</span>
                {costRestricted && (
                  <span className="text-[8px] bg-amber-950 border border-amber-500 text-amber-100 px-1 py-0.2 rounded font-bold uppercase">
                    Solo Plus & Above
                  </span>
                )}
              </span>

              {costHistoryLoading ? (
                <div className="flex-1 flex items-center justify-center text-[10px] text-forge-dim">
                  Loading history...
                </div>
              ) : costRestricted ? (
                <div className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-forge-dark rounded bg-black/40 text-center gap-1.5">
                  <AlertCircle size={16} className="text-amber-500" />
                  <span className="text-[10px] text-forge-text font-bold">Cost Log Gated</span>
                  <p className="text-[9px] text-forge-dim max-w-[200px] leading-relaxed">
                    Persistent Cost Guard history is available for **Solo Plus** and higher plans.
                  </p>
                </div>
              ) : costHistory.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[10px] text-forge-dim border border-dashed border-forge-dark rounded bg-black/40">
                  No records in this workspace yet.
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[220px] border border-forge-dark rounded bg-black/40 flex flex-col">
                  {costHistory.map((h, i) => (
                    <div
                      key={h.id || i}
                      className="p-2 border-b border-forge-very-dark flex justify-between items-center text-[9px] hover:bg-black/30 transition-colors"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-forge-text font-bold">{h.model}</span>
                        <span className="text-forge-dim text-[8px]">
                          {new Date(h.timestamp).toLocaleTimeString()} · In: {h.inputTokens} | Out: {h.outputTokens} tkn
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-forge-neon font-bold">${h.cost.toFixed(5)}</span>
                        {h.tokenSavings > 0 && (
                          <span className="text-forge-dim text-[8px]">Saved ~{h.tokenSavings} tkn</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
  );
};
