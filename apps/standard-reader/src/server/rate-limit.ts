/**
 * Simple in-memory fixed-window rate limiter.
 *
 * Keys are arbitrary strings (e.g. `"quote-share:user:did:plc:..."` or
 * `"quote-share:ip:1.2.3.4"`). Intended for single-process server functions —
 * sufficient for the Railway Node deployment. Expired buckets are swept
 * periodically to avoid unbounded memory growth.
 */

interface RateBucket {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private buckets = new Map<string, RateBucket>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(sweepIntervalMs = 5 * 60_000) {
    this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs);
    // Don't keep the process alive just for the sweep timer.
    this.sweepTimer.unref?.();
  }

  /**
   * Returns `{ allowed: true }` if under the limit (and increments the
   * counter), or `{ allowed: false, retryAfterMs }` when exceeded.
   */
  check(
    key: string,
    limit: number,
    windowMs: number,
  ): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (bucket.count >= limit) {
      return { allowed: false, retryAfterMs: bucket.resetAt - now };
    }
    bucket.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}

export const rateLimiter = new RateLimiter();

/**
 * Best-effort client IP extraction from request headers. Reads the first
 * `x-forwarded-for` entry (standard behind Railway / proxies), falling back to
 * `x-real-ip`. Returns `"unknown"` when no header is present (e.g. local dev).
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() ?? "unknown";
}
