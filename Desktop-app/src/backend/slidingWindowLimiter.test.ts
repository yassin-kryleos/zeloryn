import { describe, expect, it } from 'vitest';
import { SlidingWindowLimiter } from './slidingWindowLimiter';

describe('SlidingWindowLimiter', () => {
  it('limits each key independently and resets after the window', () => {
    const limiter = new SlidingWindowLimiter(2, 1000);
    expect(limiter.consume('a', 1000)).toBe(true);
    expect(limiter.consume('a', 1100)).toBe(true);
    expect(limiter.consume('a', 1200)).toBe(false);
    expect(limiter.consume('b', 1200)).toBe(true);
    expect(limiter.consume('a', 2101)).toBe(true);
  });

  it('gc removes stale entries', () => {
    const limiter = new SlidingWindowLimiter(5, 1000);
    limiter.consume('alpha', 1000);
    limiter.consume('bravo', 1000);
    expect(limiter.size).toBe(2);

    const pruned = limiter.gc(3000);
    expect(pruned).toBe(2);
    expect(limiter.size).toBe(0);
  });

  it('gc keeps entries still inside the window', () => {
    const limiter = new SlidingWindowLimiter(5, 2000);
    limiter.consume('keep', 1500);
    limiter.consume('keep', 2500);
    limiter.consume('stale', 1000);

    // At t=4000: cutoff = 2000. 'keep' at 2500 is inside; 'keep' at 1500 is stale. 'stale' at 1000 stale.
    // Only 'stale' key is fully pruned; 'keep' survives with [2500].
    const pruned = limiter.gc(4000);
    expect(pruned).toBe(1);
    expect(limiter.size).toBe(1);
  });

  it('clear removes a specific key', () => {
    const limiter = new SlidingWindowLimiter(5, 1000);
    limiter.consume('a', 1000);
    limiter.consume('b', 1000);
    limiter.clear('a');
    expect(limiter.size).toBe(1);
  });
});
