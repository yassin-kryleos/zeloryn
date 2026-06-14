import { describe, expect, it } from 'vitest';
import { scoreTodayTasks, TODAY_DAY_MS } from './todayScore';
import type { ProjectTask } from '../backend/db';

const NOW = 1_800_000_000_000; // fixed reference time

function task(partial: Partial<ProjectTask> & { id: string; title: string }): ProjectTask {
  return { status: 'todo', ...partial };
}

describe('scoreTodayTasks', () => {
  it('excludes done tasks and caps the list at 5', () => {
    const tasks = Array.from({ length: 8 }, (_, i) =>
      task({ id: `task_${NOW - i * TODAY_DAY_MS}`, title: `t${i}` })
    );
    tasks.push(task({ id: 'task_done', title: 'done', status: 'done' }));
    const result = scoreTodayTasks(tasks, NOW);
    expect(result).toHaveLength(5);
    expect(result.some(r => r.task.status === 'done')).toBe(false);
  });

  it('awards +10 for in-progress with an active trace', () => {
    const tasks = [
      task({ id: 'task_a', title: 'plain', status: 'in_progress' }),
      task({ id: 'task_b', title: 'traced', status: 'in_progress', latestTraceId: 'trace_1' })
    ];
    const result = scoreTodayTasks(tasks, NOW);
    const traced = result.find(r => r.task.id === 'task_b')!;
    const plain = result.find(r => r.task.id === 'task_a')!;
    expect(traced.score - plain.score).toBe(10);
  });

  it('awards +5 when a blocker completed within 24h and +3 per dependent', () => {
    const blocker = task({
      id: 'task_blocker',
      title: 'blocker',
      status: 'done',
      lastModified: new Date(NOW - TODAY_DAY_MS / 2).toISOString()
    });
    const dependent = task({ id: 'task_dep', title: 'dep', blockedBy: ['task_blocker'] });
    // task_blocker has one dependent (task_dep): fan-out +3, plus done tasks are excluded anyway.
    const result = scoreTodayTasks([blocker, dependent], NOW);
    const dep = result.find(r => r.task.id === 'task_dep')!;
    // +5 recently-unblocked, +0 fan-out (nothing depends on dep), days≈0 → 5. Not blocked (blocker done).
    expect(dep.score).toBe(5);
    expect(dep.blocked).toBe(false);
  });

  it('marks items blocked when a dependency is unfinished and does not award the 24h bonus', () => {
    const blocker = task({ id: 'task_open', title: 'open', status: 'in_progress' });
    const dependent = task({ id: 'task_dep', title: 'dep', blockedBy: ['task_open'] });
    const result = scoreTodayTasks([blocker, dependent], NOW);
    const dep = result.find(r => r.task.id === 'task_dep')!;
    expect(dep.blocked).toBe(true);
    // +3 because task_open depends on nothing but task_dep depends on it → fan-out of task_open is 1.
    const open = result.find(r => r.task.id === 'task_open')!;
    expect(open.score).toBe(3);
  });

  it('caps the age bonus at 7 days', () => {
    const old = task({ id: `task_${NOW - 30 * TODAY_DAY_MS}`, title: 'ancient' });
    const fresh = task({ id: `task_${NOW}`, title: 'new' });
    const result = scoreTodayTasks([old, fresh], NOW);
    expect(result.find(r => r.task.id.includes(String(NOW - 30 * TODAY_DAY_MS)))!.score).toBe(7);
    expect(result.find(r => r.task.title === 'new')!.score).toBe(0);
  });

  it('is deterministic for the same input', () => {
    const tasks = [
      task({ id: 'task_1700000000000', title: 'a', status: 'in_progress', latestTraceId: 't' }),
      task({ id: 'task_1700000001000', title: 'b' })
    ];
    expect(scoreTodayTasks(tasks, NOW)).toEqual(scoreTodayTasks(tasks, NOW));
  });
});
