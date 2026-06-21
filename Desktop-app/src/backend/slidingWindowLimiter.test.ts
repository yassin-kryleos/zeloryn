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
});
