import { describe, expect, it } from 'vitest';
import { unresolvedBlockers, wouldCreateDependencyCycle } from './dependencies';
import type { ProjectTask } from '../backend/db';

function task(id: string, blockedBy: string[] = [], status: ProjectTask['status'] = 'todo'): ProjectTask {
  return { id, title: id, status, blockedBy };
}

describe('unresolvedBlockers', () => {
  it('returns empty for a task with no blockers', () => {
    expect(unresolvedBlockers([task('a')], 'a')).toEqual([]);
  });

  it('returns empty for an unknown task id', () => {
    expect(unresolvedBlockers([task('a')], 'missing')).toEqual([]);
  });

  it('reports blockers that are not done', () => {
    const tasks = [task('a', ['b', 'c']), task('b'), task('c', [], 'in_progress')];
    expect(unresolvedBlockers(tasks, 'a')).toEqual(['b', 'c']);
  });

  it('excludes completed blockers', () => {
    const tasks = [task('a', ['b', 'c']), task('b', [], 'done'), task('c')];
    expect(unresolvedBlockers(tasks, 'a')).toEqual(['c']);
  });

  it('treats a blocker id with no matching task as unresolved', () => {
    const tasks = [task('a', ['ghost'])];
    expect(unresolvedBlockers(tasks, 'a')).toEqual(['ghost']);
  });
});

describe('wouldCreateDependencyCycle', () => {
  it('flags self-dependency', () => {
    expect(wouldCreateDependencyCycle([task('a')], 'a', 'a')).toBe(true);
  });

  it('allows an independent blocker', () => {
    const tasks = [task('a'), task('b')];
    expect(wouldCreateDependencyCycle(tasks, 'a', 'b')).toBe(false);
  });

  it('detects a direct 2-cycle', () => {
    // b already depends on a; making a depend on b closes the loop.
    const tasks = [task('a'), task('b', ['a'])];
    expect(wouldCreateDependencyCycle(tasks, 'a', 'b')).toBe(true);
  });

  it('detects a transitive cycle', () => {
    // c -> b -> a; making a depend on c would cycle a->c->b->a.
    const tasks = [task('a'), task('b', ['a']), task('c', ['b'])];
    expect(wouldCreateDependencyCycle(tasks, 'a', 'c')).toBe(true);
  });

  it('allows a diamond (no cycle)', () => {
    // d depends on b and c, both depend on a. Adding e (independent) to d is fine.
    const tasks = [task('a'), task('b', ['a']), task('c', ['a']), task('d', ['b', 'c']), task('e')];
    expect(wouldCreateDependencyCycle(tasks, 'd', 'e')).toBe(false);
  });

  it('terminates on pre-existing cycles in the data', () => {
    const tasks = [task('a', ['b']), task('b', ['a'])];
    // Should not infinite-loop; a already reachable from b.
    expect(wouldCreateDependencyCycle(tasks, 'c', 'a')).toBe(false);
  });
});
