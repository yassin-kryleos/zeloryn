import type { ProjectTask } from '../backend/db';

export const TODAY_DAY_MS = 24 * 60 * 60 * 1000;

export interface TodayScored {
  task: ProjectTask;
  score: number;
  blocked: boolean;
}

// Best-effort creation timestamp: task ids embed Date.now() (e.g. `task_1700000000000`,
// `plan_task_1700000000000_2`); fall back to lastModified, then `now`.
export function creationTime(task: ProjectTask, now: number): number {
  const match = task.id.match(/(\d{13})/);
  if (match) return Number(match[1]);
  if (task.lastModified) {
    const parsed = Date.parse(task.lastModified);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return now;
}

// FLOW Today priority scoring — deterministic, no AI call.
//   +10  in-progress with an active trace
//   +5   a blocking dependency completed in the last 24h
//   +3 × number of tasks that depend on this one (fan-out)
//   +1 × days since creation (capped at 7)
// Returns the top 5 non-done tasks, highest score first (oldest wins ties).
export function scoreTodayTasks(tasks: ProjectTask[], now: number): TodayScored[] {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const dependentsOf = (taskId: string) =>
    tasks.filter(candidate => (candidate.blockedBy || []).includes(taskId)).length;

  return tasks
    .filter(task => task.status !== 'done')
    .map(task => {
      let score = 0;
      if (task.status === 'in_progress' && task.latestTraceId) score += 10;
      const recentlyUnblocked = (task.blockedBy || []).some(id => {
        const blocker = byId.get(id);
        if (!blocker || blocker.status !== 'done' || !blocker.lastModified) return false;
        const closedAt = Date.parse(blocker.lastModified);
        return !Number.isNaN(closedAt) && now - closedAt <= TODAY_DAY_MS;
      });
      if (recentlyUnblocked) score += 5;
      score += 3 * dependentsOf(task.id);
      const days = Math.min(7, Math.max(0, Math.floor((now - creationTime(task, now)) / TODAY_DAY_MS)));
      score += days;
      const blocked = (task.blockedBy || []).some(id => byId.get(id)?.status !== 'done');
      return { task, score, blocked };
    })
    .sort((a, b) => (b.score - a.score) || (creationTime(a.task, now) - creationTime(b.task, now)))
    .slice(0, 5);
}
