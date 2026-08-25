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
   * Concurrent archive block downloads **per fold**
   * (`JETSTREAM_BLOCK_CONCURRENCY`). Throughput plateaus around 16–32 against
   * the public instance and 64 gets nearly every request 429'd, so 16 is the
   * safe shoulder.
   *
   * Per fold, not per process — the SDK applies this inside one snapshot
   * iterator (`block-source.ts`), so N folds running at once are N × this many
   * requests in flight. {@link jetstreamFoldConcurrency} is what keeps that
   * product on the right side of the shoulder.
   */
  get jetstreamBlockConcurrency(): number {
    const value = Number(process.env.JETSTREAM_BLOCK_CONCURRENCY);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 16;
  },

  /**
   * Archive folds allowed to run at once, process-wide
   * (`JETSTREAM_FOLD_CONCURRENCY`).
   *
   * The number that was missing. The reconcile sweep repairs eight repos
   * concurrently and each fold downloads up to
   * {@link jetstreamBlockConcurrency} blocks at a time, so the sweep alone ran
   * 128 requests deep against an endpoint documented right above as 429ing
   * nearly everything at 64. It did — `ingest.repoReconcile` logged
   * `Upstream server responded with a 429 error` across thousands of repos,
   * which is how two thirds of the fleet ended up parked in reconcile backoff.
   *
   * Two folds × sixteen blocks lands on the 32 shoulder. Raise the block count
   * and lower this together, never one alone.
   */
  get jetstreamFoldConcurrency(): number {
    const value = Number(process.env.JETSTREAM_FOLD_CONCURRENCY);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2;
  },
} as const;

export { required as requiredEnv };
