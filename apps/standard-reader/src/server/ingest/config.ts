/**
 * Server-only ingestion configuration, read from environment. None of these are
 * `VITE_`-prefixed, so they never reach the browser.
 */
import { DEFAULT_JETSTREAM_SERVICES } from "./jetstream-endpoint.ts";

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

  /**
   * Jetstream v2 hosts to consume, in preference order (`JETSTREAM_SERVICE`,
   * comma-separated). The first one that answers is used; see
   * `./jetstream-endpoint.ts` for why there is more than one.
   */
  get jetstreamServices(): Array<string> {
    const configured = (process.env.JETSTREAM_SERVICE ?? "")
      .split(",")
      .map((value) => value.trim().replace(/\/+$/, ""))
      .filter(Boolean);
    return configured.length > 0 ? configured : DEFAULT_JETSTREAM_SERVICES;
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
   * That shoulder is only real with jittered retries. Some 429s are expected
   * here and always were — what matters is whether a retry backs off. When the
   * channel honoured the archive's `Retry-After: 1` verbatim, every 429 retried
   * on a flat one-second tick and the shoulder vanished: 16 wedged the channel
   * outright, and dialling down to 4 and then 1 did not recover it either,
   * because the retry rate never decayed. Do not read this number as the fix
   * for a 429 storm — see `retryAfterStrippingFetch` in `jetstream-channel.ts`.
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
