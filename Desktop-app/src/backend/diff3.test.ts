import { describe, it, expect } from 'vitest';
import { threeWayMerge } from './diff3';

describe('3-way merge algorithm (diff3)', () => {
  it('should return identical text if no changes were made', () => {
    const base = 'line 1\nline 2\nline 3';
    const result = threeWayMerge(base, base, base);
    expect(result.merged).toBe(base);
    expect(result.hasConflicts).toBe(false);
  });

  it('should cleanly apply changes from Ours only', () => {
    const base = 'line 1\nline 2\nline 3';
    const ours = 'line 1\nline 2 modified\nline 3';
    const result = threeWayMerge(base, ours, base);
    expect(result.merged).toBe(ours);
    expect(result.hasConflicts).toBe(false);
  });

  it('should cleanly apply changes from Theirs only', () => {
    const base = 'line 1\nline 2\nline 3';
    const theirs = 'line 1\nline 2\nline 3\nline 4 added';
    const result = threeWayMerge(base, base, theirs);
    expect(result.merged).toBe(theirs);
    expect(result.hasConflicts).toBe(false);
  });

  it('should cleanly merge non-overlapping changes from both sides', () => {
    const base = 'line 1\nline 2\nline 3';
    const ours = 'line 1 modified\nline 2\nline 3';
    const theirs = 'line 1\nline 2\nline 3\nline 4 added';
    const expected = 'line 1 modified\nline 2\nline 3\nline 4 added';
    const result = threeWayMerge(base, ours, theirs);
    expect(result.merged).toBe(expected);
    expect(result.hasConflicts).toBe(false);
  });

  it('should detect conflicts for overlapping changes on the same line', () => {
    const base = 'line 1\nline 2\nline 3';
    const ours = 'line 1\nline 2 ours\nline 3';
    const theirs = 'line 1\nline 2 theirs\nline 3';
    const result = threeWayMerge(base, ours, theirs);
    expect(result.hasConflicts).toBe(true);
    expect(result.merged).toContain('<<<<<<< CLIENT (OURS)');
    expect(result.merged).toContain('line 2 ours');
    expect(result.merged).toContain('=======');
    expect(result.merged).toContain('line 2 theirs');
    expect(result.merged).toContain('>>>>>>> SERVER (THEIRS)');
  });
});
