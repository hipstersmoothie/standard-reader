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

export interface RateLimitResult {
  allowed: boolean;
  /** How long until the window resets. `0` when the request was allowed. */
  retryAfterMs: number;
  /** The ceiling this key was measured against. */
  limit: number;
  /** Requests left in the current window. */
  remaining: number;
  /** Epoch ms at which the window resets. */
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
  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      const resetAt = now + windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        retryAfterMs: 0,
        limit,
        remaining: limit - 1,
        resetAt,
      };
    }
    if (bucket.count >= limit) {
      return {
        allowed: false,
        retryAfterMs: bucket.resetAt - now,
        limit,
        remaining: 0,
        resetAt: bucket.resetAt,
      };
    }
    bucket.count += 1;
    return {
      allowed: true,
      retryAfterMs: 0,
      limit,
      remaining: limit - bucket.count,
      resetAt: bucket.resetAt,
    };
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

/**
 * `RateLimit-*` headers for an HTTP surface, per the IETF draft that most
 * clients now read. Emitted on every response, not just rejections, so a
 * well-behaved client can pace itself instead of discovering the ceiling by
 * hitting it.
 */
export function rateLimitHeaders(
  result: RateLimitResult,
): Record<string, string> {
  const resetSeconds = Math.max(
    0,
    Math.ceil((result.resetAt - Date.now()) / 1000),
  );
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(resetSeconds),
  };
  if (!result.allowed) {
    headers["Retry-After"] = String(Math.ceil(result.retryAfterMs / 1000));
  }
  return headers;
}
