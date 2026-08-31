import type express from 'express';

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export class FixedWindowRateCounter {
  private readonly clients = new Map<string, { count: number; resetAt: number }>();
  private operations = 0;
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    if (limit <= 0 || windowMs <= 0) throw new RangeError('Rate limit and window must be positive');
    this.limit = limit;
    this.windowMs = windowMs;
  }

  consume(key: string, now = Date.now()): RateLimitResult {
    this.operations += 1;
    if (this.operations % 100 === 0) this.prune(now);

    const existing = this.clients.get(key);
    const entry = !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + this.windowMs }
      : existing;
    entry.count += 1;
    this.clients.set(key, entry);

    return {
      allowed: entry.count <= this.limit,
      remaining: Math.max(0, this.limit - entry.count),
      resetAt: entry.resetAt,
    };
  }

  prune(now = Date.now()) {
    for (const [key, entry] of this.clients) {
      if (entry.resetAt <= now) this.clients.delete(key);
    }
  }

  get size() {
    return this.clients.size;
  }
}

export function createRateLimiter(limit: number, windowMs: number) {
  const counter = new FixedWindowRateCounter(limit, windowMs);
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const result = counter.consume(req.ip || 'unknown');
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(result.remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
    if (!result.allowed) {
      return res.status(429).json({ error: 'Too many EPUB requests; please try again later' });
    }
    next();
  };
}
