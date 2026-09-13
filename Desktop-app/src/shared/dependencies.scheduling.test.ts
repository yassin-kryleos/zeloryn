import { describe, expect, it } from 'vitest';
import type { ProjectTask } from '../backend/db';
import {
  unresolvedBlockers,
  isTaskUnblocked,
  findUnblockedTasks,
  getNextSchedulableTask,
  wouldCreateDependencyCycle
} from './dependencies';

function makeTask(id: string, blockedBy: string[] = [], status: ProjectTask['status'] = 'todo'): ProjectTask {
  return { id, title: id, status, blockedBy };
}

describe('Dependency-aware scheduling (Phase 5)', () => {
  it('isTaskUnblocked returns true when all blockers are done', () => {
    const t1 = makeTask('t1', [], 'done');
    const t2 = makeTask('t2', ['t1'], 'todo');
    expect(isTaskUnblocked(t2, [t1, t2])).toBe(true);
  });

  it('isTaskUnblocked returns false when at least one blocker is pending', () => {
    const t1 = makeTask('t1', [], 'in_progress');
    const t2 = makeTask('t2', ['t1'], 'todo');
    expect(isTaskUnblocked(t2, [t1, t2])).toBe(false);
  });

  it('findUnblockedTasks identifies newly unblocked cards upon task completion', () => {
    const t1 = makeTask('t1', [], 'done');
    const t2 = makeTask('t2', ['t1'], 'todo');
    const t3 = makeTask('t3', ['t1', 't4'], 'todo'); // t4 not done
    const t4 = makeTask('t4', [], 'todo');
    const t5 = makeTask('t5', [], 'done');

    const unblocked = findUnblockedTasks([t1, t2, t3, t4, t5], 't1');
    expect(unblocked.map(t => t.id)).toEqual(['t2']);
  });

  it('findUnblockedTasks handles multi-blocker cards unblocking when last dependency finishes', () => {
    const t1 = makeTask('t1', [], 'done');
    const t2 = makeTask('t2', [], 'done');
    const t3 = makeTask('t3', ['t1', 't2'], 'todo');

    const unblocked = findUnblockedTasks([t1, t2, t3], 't2');
    expect(unblocked.map(t => t.id)).toEqual(['t3']);
  });

  it('getNextSchedulableTask returns the first ready card with resolved blockers', () => {
    const t1 = makeTask('t1', [], 'done');
    const t2 = makeTask('t2', ['t4'], 'todo'); // blocked by t4
    const t3 = makeTask('t3', ['t1'], 'todo'); // unblocked by t1
    const t4 = makeTask('t4', [], 'todo'); // unblocked

    const next = getNextSchedulableTask([t1, t2, t3, t4]);
    // t2 is blocked by t4, so it's skipped. t3 is unblocked!
    expect(next?.id).toBe('t3');
  });

  it('getNextSchedulableTask skips cards currently in progress', () => {
    const t1 = makeTask('t1', [], 'in_progress');
    const t2 = makeTask('t2', [], 'todo');
    expect(getNextSchedulableTask([t1, t2])?.id).toBe('t2');
  });

  it('getNextSchedulableTask returns null when all ready cards are done or in_progress', () => {
    const t1 = makeTask('t1', [], 'done');
    const t2 = makeTask('t2', [], 'in_progress');
    expect(getNextSchedulableTask([t1, t2])).toBeNull();
  });
});
