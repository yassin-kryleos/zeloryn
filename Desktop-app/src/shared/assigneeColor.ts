// Color for an assignee's role label. Covers both the PLAN role set
// (planner/builder/analyst/reviewer) and the CREW role set
// (coordinator/developer/researcher/debugger) — same color per position.
export function getAssigneeColor(assignee?: string) {
  switch (assignee?.toLowerCase()) {
    case 'planner':
    case 'coordinator':
      return 'text-forge-neon';
    case 'builder':
    case 'developer':
      return 'text-cyan-400';
    case 'analyst':
    case 'researcher':
      return 'text-purple-400';
    case 'reviewer':
    case 'debugger':
      return 'text-amber-400';
    case 'security auditor':
    case 'risk identifier':
      return 'text-rose-400';
    case 'test writer':
      return 'text-emerald-400';
    case 'react expert':
      return 'text-cyan-300';
    case 'documentation writer':
      return 'text-amber-300';
    case 'technical reviewer':
    case 'scope guard':
    case 'post-execution reviewer':
      return 'text-purple-300';
    default:
      return 'text-forge-text';
  }
}
