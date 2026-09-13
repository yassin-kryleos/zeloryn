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

/** Check if a task has all its dependency cards resolved (completed/done). */
export function isTaskUnblocked(task: ProjectTask, allTasks: ProjectTask[]): boolean {
  return unresolvedBlockers(allTasks, task.id).length === 0;
}

/** Given a newly completed task id, returns all tasks that were previously waiting
 *  on it and are now completely unblocked (all prerequisites are 'done'). */
export function findUnblockedTasks(tasks: ProjectTask[], completedTaskId: string): ProjectTask[] {
  const byId = new Map(tasks.map(t => [t.id, t]));
  // Only tasks that directly depended on completedTaskId and are not already done
  return tasks.filter(task => {
    if (task.status === 'done') return false;
    const deps = task.blockedBy || [];
    if (!deps.includes(completedTaskId)) return false;
    // Check if ALL deps are now done
    return deps.every(depId => byId.get(depId)?.status === 'done');
  });
}

/** Returns the next schedulable task: an incomplete task (todo / not_started) whose
 *  dependencies are completely satisfied, prioritized by order in list or priority. */
export function getNextSchedulableTask(tasks: ProjectTask[]): ProjectTask | null {
  for (const task of tasks) {
    if (task.status === 'done' || task.status === 'in_progress') continue;
    if (isTaskUnblocked(task, tasks)) {
      return task;
    }
  }
  return null;
}
