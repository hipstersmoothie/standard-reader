/**
 * Server-only ingestion configuration, read from environment. None of these are
 * `VITE_`-prefixed, so they never reach the browser.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export const ingestConfig = {
  /**
   * Shared secret for the ingest worker's admin endpoints
   * (`INGEST_WEBHOOK_SECRET`).
   */
  get webhookSecret(): string | null {
    return process.env.INGEST_WEBHOOK_SECRET ?? null;
  },

  /** Jetstream v2 instance to consume (`JETSTREAM_SERVICE`). */
  get jetstreamService(): string {
    return (
      process.env.JETSTREAM_SERVICE ?? "https://jetstream.us-east.bsky.network"
    );
  },

  /**
   * API key for Jetstream's archive endpoints (`JETSTREAM_API_KEY`, from
   * https://bsky.network/account). The live tail needs no auth; only replaying
   * history does, so an unset key degrades to "live tail only" rather than
   * failing outright.
   */
  get jetstreamApiKey(): string | null {
    return process.env.JETSTREAM_API_KEY ?? null;
  },

  /**
   * Concurrent archive block downloads (`JETSTREAM_BLOCK_CONCURRENCY`).
   * Throughput plateaus around 16–32 against the public instance and 64 gets
   * nearly every request 429'd, so 16 is the safe shoulder.
   */
  get jetstreamBlockConcurrency(): number {
    const value = Number(process.env.JETSTREAM_BLOCK_CONCURRENCY);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 16;
  },
} as const;

export { required as requiredEnv };
