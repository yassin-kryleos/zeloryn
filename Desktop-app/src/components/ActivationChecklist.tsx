import React, { useState } from 'react';
import { CheckCircle, Circle, X } from 'lucide-react';

export interface ActivationChecklistProps {
  hasModel: boolean;
  isDemoDone: boolean;
  isRepoDone: boolean;
  onConnectModel: () => void;
  onRunDemo: () => void;
  onPointAtRepo: () => void;
}

export const ActivationChecklist: React.FC<ActivationChecklistProps> = ({
  hasModel,
  isDemoDone,
  isRepoDone,
  onConnectModel,
  onRunDemo,
  onPointAtRepo
}) => {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('matrix_activation_checklist_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  const steps = [
    {
      id: 'model',
      label: 'Connect model',
      done: hasModel,
      actionLabel: 'CONNECT',
      action: onConnectModel
    },
    {
      id: 'demo',
      label: 'Run demo trace',
      done: isDemoDone,
      actionLabel: 'RUN DEMO',
      action: onRunDemo
    },
    {
      id: 'repo',
      label: 'Point at repo',
      done: isRepoDone,
      actionLabel: 'ADD REPO',
      action: onPointAtRepo
    }
  ];

  if (steps.every(step => step.done)) {
    return null;
  }

  const completedCount = steps.filter(s => s.done).length;

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => {
          setDismissed(false);
          try {
            localStorage.removeItem('matrix_activation_checklist_dismissed');
          } catch {
            // ignore
          }
        }}
        className="fixed bottom-3 right-3 z-40 border border-forge-neon/50 bg-forge-panel-bg hover:bg-forge-neon/15 text-forge-neon shadow-lg rounded-md px-2.5 py-1.5 font-mono text-[10px] font-bold flex items-center gap-1.5 cursor-pointer pointer-events-auto transition-all select-none"
        style={{ bottom: '0.75rem', right: '0.75rem' }}
        title="Expand activation checklist"
        aria-label="Expand activation checklist"
      >
        <CheckCircle size={12} className="text-forge-neon" />
        <span>ACTIVATION ({completedCount}/3)</span>
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-3 right-3 z-40 w-72 border border-forge-neon/40 bg-forge-panel-bg shadow-xl rounded-md p-3 font-mono text-[10px] space-y-2 pointer-events-auto backdrop-blur-sm select-none"
      style={{ bottom: '0.75rem', right: '0.75rem' }}
      role="region"
      aria-label="Activation checklist"
    >
      <div className="flex items-center justify-between border-b border-forge-dark pb-1.5">
        <div className="flex items-center gap-1.5 text-forge-neon uppercase font-bold text-[11px]">
          <span>Activation checklist</span>
          <span className="text-[9px] text-forge-dim font-normal">({completedCount}/3)</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem('matrix_activation_checklist_dismissed', 'true');
            } catch {
              // ignore
            }
          }}
          className="text-forge-dim hover:text-white cursor-pointer px-1 py-0.5 rounded hover:bg-white/10 transition-colors text-[10px] font-bold bg-transparent border-0 outline-none flex items-center justify-center"
          title="Minimize checklist"
          aria-label="Minimize activation checklist"
        >
          <X size={12} />
        </button>
      </div>

      <div className="space-y-1.5">
        {steps.map(step => (
          <div
            key={step.id}
            onClick={step.action}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                step.action();
              }
            }}
            className={`flex items-center justify-between p-1.5 rounded border transition-all cursor-pointer ${
              step.done
                ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10'
                : 'border-forge-dark bg-black/30 text-forge-text hover:border-forge-neon hover:bg-forge-neon/10'
            }`}
            title={step.done ? `${step.label} (Done)` : `Click to ${step.label.toLowerCase()}`}
          >
            <div className="flex items-center gap-1.5">
              {step.done ? (
                <CheckCircle size={12} className="text-emerald-400 shrink-0" />
              ) : (
                <Circle size={12} className="text-forge-dim shrink-0" />
              )}
              <span className={step.done ? 'line-through text-emerald-400/80 font-medium' : 'text-forge-text font-semibold'}>
                {step.label}
              </span>
            </div>
            {step.done ? (
              <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">
                DONE
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step.action();
                }}
                className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase transition-colors cursor-pointer ${
                  step.id === 'demo' ? 'forge-btn' : 'forge-secondary-button'
                }`}
              >
                {step.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
