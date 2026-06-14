import type { ProjectTask } from '../backend/db';

// True if making `candidateId` a blocker of `taskId` would create a dependency
// cycle — i.e. `candidateId` already (transitively) depends on `taskId` through
// existing blockedBy edges. Pure and side-effect free.
// Blocker ids on `taskId` whose blocking task is not done. A blocker id that no
// longer resolves to a task still counts as unresolved, so a stale reference
// blocks execution rather than silently passing. Pure and side-effect free.
export function unresolvedBlockers(tasks: ProjectTask[], taskId: string): string[] {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const task = byId.get(taskId);
  return (task?.blockedBy || []).filter(id => byId.get(id)?.status !== 'done');
}

export function wouldCreateDependencyCycle(
  tasks: ProjectTask[],
  taskId: string,
  candidateId: string
): boolean {
  if (taskId === candidateId) return true;
  const byId = new Map(tasks.map(task => [task.id, task]));
  const seen = new Set<string>();
  const stack = [candidateId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const dep of byId.get(current)?.blockedBy || []) stack.push(dep);
  }
  return false;
}
