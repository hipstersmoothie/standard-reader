import type { RateLimitResult } from "./rate-limit";
import { getClientIp, rateLimiter } from "./rate-limit";

const MINUTE = 60_000;

/**
 * Rate-limit budgets for the public HTTP surfaces.
 *
 * These are abuse ceilings, not usage quotas — they sit well above what a
 * reader's own client, the extension, or a well-behaved third-party integration
 * does in normal use, and exist so one caller can't exhaust the read model, the
 * PDS calls a write fans out into, or the auth path's network round trips.
 *
 * The limiter is in-memory (see `rate-limit.ts`), so each web replica enforces
 * its own copy: with N replicas behind the load balancer the effective ceiling
 * is N× these numbers. That is fine for abuse control and deliberately simple —
 * a shared counter would put Redis (or a DB round trip) on every request.
 */
export const RATE_LIMITS = {
  /**
   * Coarse per-IP ceiling checked *before* any work on an XRPC request.
   * Deliberately above the per-subject budgets below so it only catches
   * genuine floods — its real job is protecting the auth path, which makes a
   * `getSession` call to the issuer PDS before we know who is calling.
   */
  xrpcIp: { limit: 900, windowMs: 5 * MINUTE },
  /** Per-caller budget for XRPC queries (read model only). */
  xrpcQuery: { limit: 600, windowMs: 5 * MINUTE },
  /**
   * Per-caller budget for XRPC procedures. An order of magnitude tighter than
   * reads because each one writes to the caller's PDS, and `markAllRead` can
   * fan out into a large batch.
   */
  xrpcProcedure: { limit: 120, windowMs: 5 * MINUTE },
  /**
   * Per-IP ceiling on `/mcp` before the token is looked up, mirroring
   * `xrpcIp`'s role: it protects the DB lookup that validation needs.
   */
  mcpIp: { limit: 300, windowMs: 5 * MINUTE },
  /**
   * Per-grant budget for `/mcp`. One tool call can fan out into several
   * in-process reads (`get_status` batches up to 25 subjects × 3 queries), so
   * this counts MCP requests, not the reads underneath.
   */
  mcpGrant: { limit: 300, windowMs: 5 * MINUTE },
  /** Token exchange + refresh, per IP. */
  oauthToken: { limit: 120, windowMs: 5 * MINUTE },
  /**
   * Dynamic client registration, per IP. The tightest budget here: it is
   * unauthenticated by design and each call writes a row.
   */
  oauthRegister: { limit: 20, windowMs: 60 * MINUTE },
} as const;

export type RateLimitPolicy = keyof typeof RATE_LIMITS;

/**
 * Apply a policy to a subject key.
 *
 * @param policy which budget to charge against
 * @param subject stable identity for the caller — a DID, a grant id, or an IP
 */
export function checkRateLimit(
  policy: RateLimitPolicy,
  subject: string,
): RateLimitResult {
  const { limit, windowMs } = RATE_LIMITS[policy];
  return rateLimiter.check(`${policy}:${subject}`, limit, windowMs);
}

/** Apply a policy keyed on the request's client IP. */
export function checkRateLimitByIp(
  policy: RateLimitPolicy,
  request: Request,
): RateLimitResult {
  return checkRateLimit(policy, `ip:${getClientIp(request)}`);
}
