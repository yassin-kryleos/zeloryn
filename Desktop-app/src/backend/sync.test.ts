import { describe, it, expect } from 'vitest';
import { mergeTasks } from './sync';

describe('LWW-CRDT checklist tasks merging', () => {
  it('should return empty array if both lists are empty', () => {
    expect(mergeTasks([], [])).toEqual([]);
  });

  it('should keep incoming task if it has a newer timestamp', () => {
    const stored = [
      { id: '1', title: 'Task A', status: 'pending', lastModified: '2026-06-05T10:00:00.000Z' }
    ];
    const incoming = [
      { id: '1', title: 'Task A', status: 'done', lastModified: '2026-06-05T11:00:00.000Z' }
    ];
    const merged = mergeTasks(incoming, stored);
    expect(merged.length).toBe(1);
    expect(merged[0].status).toBe('done');
  });

  it('should keep stored task if it has a newer timestamp', () => {
    const stored = [
      { id: '1', title: 'Task A', status: 'done', lastModified: '2026-06-05T12:00:00.000Z' }
    ];
    const incoming = [
      { id: '1', title: 'Task A', status: 'pending', lastModified: '2026-06-05T11:00:00.000Z' }
    ];
    const merged = mergeTasks(incoming, stored);
    expect(merged.length).toBe(1);
    expect(merged[0].status).toBe('done');
  });

  it('should union tasks that exist only in stored or incoming', () => {
    const stored = [
      { id: '1', title: 'Task A', status: 'pending', lastModified: '2026-06-05T10:00:00.000Z' }
    ];
    const incoming = [
      { id: '2', title: 'Task B', status: 'done', lastModified: '2026-06-05T11:00:00.000Z' }
    ];
    const merged = mergeTasks(incoming, stored);
    expect(merged.length).toBe(2);
    expect(merged.find(t => t.id === '1')?.title).toBe('Task A');
    expect(merged.find(t => t.id === '2')?.title).toBe('Task B');
  });
});
