import React from 'react';
import { getFeatureStatus, type FeatureStatus, type FeatureStatusId } from '../shared/featureStatus';

interface FeatureBadgeProps {
  id?: FeatureStatusId;
  status?: FeatureStatus;
  label?: string;
  compact?: boolean;
}

const statusClass: Record<FeatureStatus, string> = {
  production: 'border-emerald-500/30 text-emerald-500 bg-emerald-500/10',
  preview: 'border-cyan-500/30 text-cyan-500 bg-cyan-500/10',
  simulator: 'border-amber-500/30 text-amber-500 bg-amber-500/10',
  mock: 'border-purple-500/30 text-purple-500 bg-purple-500/10',
  planned: 'border-zinc-500/30 text-zinc-500 bg-zinc-500/10'
};

export const FeatureBadge: React.FC<FeatureBadgeProps> = ({ id, status, label, compact = false }) => {
  const definition = id ? getFeatureStatus(id) : null;
  const resolvedStatus = status || definition?.status || 'planned';
  const resolvedLabel = label || definition?.status || resolvedStatus;
  const title = definition ? `${definition.label}: ${definition.description}` : resolvedStatus;

  return (
    <span
      className={`inline-flex items-center border rounded font-bold uppercase ${statusClass[resolvedStatus]} ${compact ? 'text-[7px] px-1 py-0' : 'text-[8px] px-1.5 py-0.5'}`}
      title={title}
    >
      {resolvedLabel}
    </span>
  );
};
