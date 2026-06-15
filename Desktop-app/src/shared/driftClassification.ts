import type { DriftClassification } from '../backend/db';

export function driftClass(status?: DriftClassification) {
  switch (status) {
    case 'complete':
      return 'border-forge-neon text-forge-neon';
    case 'in_progress':
      return 'border-cyan-600 text-cyan-300';
    case 'blocked':
      return 'border-red-700 text-red-300';
    case 'needs_review':
    case 'diverged':
      return 'border-amber-600 text-amber-300';
    default:
      return 'border-forge-dark text-forge-dim';
  }
}
