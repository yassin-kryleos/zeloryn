export class SlidingWindowLimiter {
  private attempts = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private gcCounter = 0;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  consume(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const recent = (this.attempts.get(key) || []).filter(timestamp => timestamp > cutoff);
    if (recent.length >= this.limit) {
      this.attempts.set(key, recent);
      // Lazy GC: prune stale entries every 10th rate-limited call.
      if (++this.gcCounter % 10 === 0) this.gc(now);
      return false;
    }
    recent.push(now);
    this.attempts.set(key, recent);
    return true;
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }

  /** Remove entries with no timestamps inside the window. */
  gc(now = Date.now()): number {
    const cutoff = now - this.windowMs;
    let pruned = 0;
    for (const [key, timestamps] of this.attempts) {
      const recent = timestamps.filter(t => t > cutoff);
      if (recent.length === 0) {
        this.attempts.delete(key);
        pruned++;
      } else {
        this.attempts.set(key, recent);
      }
    }
    return pruned;
  }

  get size(): number {
    return this.attempts.size;
  }
}
