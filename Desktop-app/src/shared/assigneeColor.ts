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
      return 'neon-amber';
    default:
      return 'text-forge-text';
  }
}
