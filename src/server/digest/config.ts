/**
 * Server-only weekly-digest configuration, read from environment. None of these
 * are `VITE_`-prefixed, so they never reach the browser. Mirrors the pattern in
 * `src/server/ingest/config.ts`.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export const digestConfig = {
  /** comail send endpoint (override for testing); defaults to the hosted API. */
  get comailSendUrl(): string {
    return process.env.COMAIL_SEND_URL ?? "https://smtp.atmos.email/v1/send";
  },

  /** Sending account DID (comail `X-Atmos-DID`). */
  get comailDid(): string {
    return required("COMAIL_DID");
  },

  /** comail API key (`Authorization: Bearer <key>`). */
  get comailApiKey(): string {
    return required("COMAIL_API_KEY");
  },

  /** From address on the enrolled sending domain (e.g. `digest@standard-reader.app`). */
  get comailFrom(): string {
    return required("COMAIL_FROM");
  },

  /** HMAC key for one-click unsubscribe tokens. Required in production; in dev
   * it falls back to a static placeholder so the digest preview tool works
   * without extra setup (preview tokens are never acted on). */
  get unsubscribeSecret(): string {
    const value = process.env.DIGEST_UNSUBSCRIBE_SECRET;
    if (value) return value;
    if (process.env.NODE_ENV !== "production") return "dev-preview-secret";
    throw new Error("DIGEST_UNSUBSCRIBE_SECRET is not set");
  },

  /**
   * Max digests to send per invocation. comail's account ceiling is 50–100/hr
   * and 500–1000/day; the runner sends sequentially and stops at this cap so a
   * single weekly run can't blow the hourly limit. Unsent readers are picked up
   * next run because their `weeklyDigestLastSentAt` stays stale.
   */
  get maxPerRun(): number {
    const raw = process.env.DIGEST_MAX_PER_RUN;
    const n = raw ? Number.parseInt(raw, 10) : 90;
    return Number.isFinite(n) && n > 0 ? n : 90;
  },

  /** Milliseconds to wait between sends (throttle under the hourly ceiling). */
  get sendDelayMs(): number {
    const raw = process.env.DIGEST_SEND_DELAY_MS;
    const n = raw ? Number.parseInt(raw, 10) : 1500;
    return Number.isFinite(n) && n >= 0 ? n : 1500;
  },
} as const;

/** Number of "best of your follows" articles to include. */
export const DIGEST_ARTICLE_LIMIT = 5;
/** Number of network-wide "top this week" articles to include. */
export const DIGEST_NETWORK_ARTICLE_LIMIT = 5;
/** Number of unfollowed publication recommendations to include. */
export const DIGEST_RECOMMENDATION_LIMIT = 2;
/** Only articles published within this many days are eligible for the digest. */
export const DIGEST_WINDOW_DAYS = 7;
/** Skip a reader who already received a digest within this many days (idempotency). */
export const DIGEST_MIN_INTERVAL_DAYS = 6;

export { required as requiredEnv };
