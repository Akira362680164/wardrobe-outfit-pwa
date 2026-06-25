export interface RateLimitCheck {
  allowed: boolean;
  retryAfterSeconds?: number;
}

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(
    private readonly options: {
      maxAttempts: number;
      windowMs: number;
    },
  ) {}

  take(key: string, nowMs = Date.now()): RateLimitCheck {
    const current = this.buckets.get(key);

    if (!current || current.resetAtMs <= nowMs) {
      this.buckets.set(key, {
        count: 1,
        resetAtMs: nowMs + this.options.windowMs,
      });
      return { allowed: true };
    }

    if (current.count >= this.options.maxAttempts) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAtMs - nowMs) / 1000)),
      };
    }

    current.count += 1;
    return { allowed: true };
  }
}
