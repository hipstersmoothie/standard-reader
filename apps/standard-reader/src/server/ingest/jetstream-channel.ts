import { Jetstream } from "@bsky/jetstream";
import type { CollectionFilter, CursorStore, RawEvent } from "@bsky/jetstream";
import { eq, sql } from "drizzle-orm";

import { db } from "../../db/index.ts";
import { ingestState } from "../../db/schema.ts";
import type { IngestEvent } from "../atproto/types.ts";
import { logEvent } from "../observability/log.ts";
import { ingestConfig } from "./config.ts";
import type { ProcessResult } from "./consumer.ts";
import { processIngestEvent } from "./consumer.ts";
import { toIngestRecordPayload } from "./jetstream-event.ts";

/**
 * `ingest_state` row holding the Jetstream cursor. Deliberately its own row
 * rather than reusing tap's `"tap"`: the two streams numbered their events
 * independently, so a shared row would have been meaningless the moment either
 * side wrote to it. Keeping them apart also leaves tap's final high-water mark
 * intact as a record of where the old stream stopped.
 */
const STREAM_ID = "jetstream";

/**
 * How recently Jetstream must have witnessed an event for us to treat it as
 * live.
 *
 * `IngestRecordPayload.live` gates push notifications, so getting this wrong in
 * the permissive direction would notify every subscriber about the entire
 * history of the network. The SDK hands backfill and live events through one
 * iterator by design and does not label them, but it does not need to: `time`
 * is Jetstream's `witnessed_at`, which for an archived record is when Jetstream
 * bootstrapped it, not when the author wrote it. Anything witnessed inside this
 * window is the live tail or a short catch-up after a restart — and notifying
 * for posts missed during a restart is what we want.
 */
const LIVE_WINDOW_MS = 5 * 60 * 1000;

/** Collections `handleRecord` dispatches on, as Jetstream filters.
 *
 * Namespace wildcards rather than an exhaustive NSID list: the dispatcher's
 * `default` branch already reports anything it does not model, and a wildcard
 * means a new `app.standard-reader.*` record type starts flowing the moment its
 * handler lands instead of needing a filter edit deployed first.
 *
 * `app.bsky.actor.profile` is deliberately absent. Network-wide it is tens of
 * millions of records for the ~15k we mirror, and Jetstream's DID filter caps
 * at 10,000 — fewer than we track. Profiles are fetched and refreshed directly
 * instead (see `profile-refresh.ts`).
 */
const COLLECTIONS = [
  "site.standard.*",
  "app.standard-reader.*",
  "site.mochott.article",
] as const satisfies ReadonlyArray<CollectionFilter>;

/**
 * Concurrent block downloads during the archive phase. The SDK defaults to 4;
 * measured against the public instance throughput plateaus around 16–32 and 64
 * gets nearly every request 429'd, so 16 is the safe shoulder.
 */
const DEFAULT_BLOCK_CONCURRENCY = 16;

/** Events applied in parallel within one batch. */
const DEFAULT_APPLY_CONCURRENCY = 16;

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/**
 * The Jetstream cursor, persisted in `ingest_state`.
 *
 * Only ever written by {@link startJetstreamChannel} after a whole batch is
 * durably handled, so a crash resumes at the last fully-applied batch and
 * re-delivers its successor. That is at-least-once, which every handler is
 * already built for — the same property tap's redelivery relies on.
 */
function cursorStore(): CursorStore {
  return {
    async load() {
      const [row] = await db
        .select({ lastEventId: ingestState.lastEventId })
        .from(ingestState)
        .where(eq(ingestState.id, STREAM_ID))
        .limit(1);
      return row?.lastEventId ?? undefined;
    },
    async save(seq: number) {
      await db
        .insert(ingestState)
        .values({ id: STREAM_ID, lastEventAt: sql`now()`, lastEventId: seq })
        .onConflictDoUpdate({
          set: {
            lastEventAt: sql`now()`,
            // `greatest` rather than a plain assignment: the archive phase and
            // the live tail overlap by design at the cutover seam, and a batch
            // from behind the high-water mark must not rewind it.
            lastEventId: sql`greatest(coalesce(${ingestState.lastEventId}, 0), ${seq})`,
            updatedAt: sql`now()`,
          },
          target: ingestState.id,
        });
    },
  };
}

function toIngestEvent(event: RawEvent, now: number): IngestEvent | null {
  const live = now - Date.parse(event.time) < LIVE_WINDOW_MS;
  const record = toIngestRecordPayload(event, { live });
  if (!record) {
    return null;
  }
  // `id` is Jetstream's seq. `processIngestEvent` uses it for the high-water mark
  // and for the dead-letter row, both of which want the resume cursor.
  return { id: event.seq, record, type: "record" };
}

/**
 * Consume Jetstream v2 into the read-model: replay the sealed archive from the
 * stored cursor, then cut over to the live tail — one iterator, no seam to
 * manage here.
 *
 * This replaces the tap channels wholesale. What it does *not* need is the
 * shape of the difference: no admin API to register repos with, no ack per
 * event (and so no ack deadlock, no ack timeout, no patched SDK), no per-lane
 * concurrency split to keep a bridge backfill from starving publishers, and no
 * signal-collection seeding — a collection-filtered subscription already sees
 * every repo on the network that writes one of our records, including ones we
 * have never heard of.
 */
export function startJetstreamChannel(): { destroy: () => Promise<void> } {
  const service = ingestConfig.jetstreamService;
  const apiKey = ingestConfig.jetstreamApiKey;
  const blockConcurrency = envInt(
    "JETSTREAM_BLOCK_CONCURRENCY",
    DEFAULT_BLOCK_CONCURRENCY,
  );
  const applyConcurrency = envInt(
    "JETSTREAM_APPLY_CONCURRENCY",
    DEFAULT_APPLY_CONCURRENCY,
  );

  const jetstream = new Jetstream({
    // Absent is legal and only costs the archive: the live tail is
    // unauthenticated, so a worker with no key still tails correctly — it just
    // cannot replay history and will sit at the cursor's lookback floor.
    ...(apiKey ? { apiKey } : {}),
    blockConcurrency,
    service,
  });

  const stats = {
    applied: 0,
    deadLettered: 0,
    errors: 0,
    lastEventAt: 0,
    lastSeq: 0,
    startedAt: Date.now(),
    unhandled: 0,
  };

  const controller = new AbortController();
  const cursor = cursorStore();

  const heartbeat = setInterval(() => {
    const idleMs =
      stats.lastEventAt === 0 ? -1 : Date.now() - stats.lastEventAt;
    console.info(
      `[ingest:jetstream] heartbeat: applied=${stats.applied} deadLettered=${stats.deadLettered} unhandled=${stats.unhandled} errors=${stats.errors} lastSeq=${stats.lastSeq} idleMs=${idleMs}`,
    );
    logEvent("ingest.heartbeat", {
      applied: stats.applied,
      deadLettered: stats.deadLettered,
      errors: stats.errors,
      idleMs,
      lane: "jetstream",
      lastEventId: stats.lastSeq,
      ok: true,
      unhandled: stats.unhandled,
    });
  }, 10_000);
  heartbeat.unref?.();

  const running = (async () => {
    for await (const batch of jetstream.replayRawBatches({
      collections: COLLECTIONS,
      cursor,
      kinds: ["commit"],
      onError: (error) => {
        stats.errors += 1;
        console.warn("[ingest:jetstream]", error.message);
        logEvent("ingest.jetstreamError", {
          ok: false,
          reason: error.message,
        });
      },
      onInfo: (info) =>
        console.info(`[ingest:jetstream] ${info.name}: ${info.message ?? ""}`),
      // Raw, not typed: typed decode drops every record without a `$type`, and
      // on this network that is ~0.05% of standard.site records — live
      // publications and documents included. See `toIngestRecordPayload`.
      raw: true,
      signal: controller.signal,
    })) {
      const now = Date.now();
      let unhandled = false;

      let index = 0;
      await Promise.all(
        Array.from(
          { length: Math.min(applyConcurrency, batch.events.length) },
          async () => {
            for (;;) {
              const mine = index++;
              if (mine >= batch.events.length) return;
              const event = toIngestEvent(batch.events[mine], now);
              if (!event) continue;
              stats.lastSeq = Math.max(stats.lastSeq, event.id);
              stats.lastEventAt = Date.now();
              let result: ProcessResult = "unhandled";
              try {
                result = await processIngestEvent(event);
              } catch (error: unknown) {
                stats.errors += 1;
                console.error(
                  `[ingest:jetstream] failed to process seq ${event.id}`,
                  error,
                );
              }
              if (result === "applied") stats.applied += 1;
              else if (result === "dead-lettered") stats.deadLettered += 1;
              else {
                stats.unhandled += 1;
                unhandled = true;
              }
            }
          },
        ),
      );

      // An `unhandled` event means the apply *and* its dead-letter write both
      // failed — the DB is down or full. Holding the cursor is the whole
      // recovery mechanism: the batch replays from disk once the DB is back,
      // instead of being acked into oblivion the way a per-event ack would.
      if (!unhandled) {
        await cursor.save(batch.lastCursor);
      }
    }
  })().catch((error: unknown) => {
    if (controller.signal.aborted) return;
    console.error("[ingest:jetstream] channel stopped", error);
    process.exitCode = 1;
  });

  console.info(
    `[ingest:jetstream] consuming ${service} (blockConcurrency=${blockConcurrency}, applyConcurrency=${applyConcurrency}, apiKey=${apiKey ? "set" : "MISSING — live tail only"})`,
  );

  return {
    destroy: async () => {
      clearInterval(heartbeat);
      controller.abort();
      await running;
    },
  };
}
