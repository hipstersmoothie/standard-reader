import { Jetstream } from "@bsky/jetstream";
import type { CursorStore, RawEvent } from "@bsky/jetstream";
import { eq, sql } from "drizzle-orm";

import { db } from "../../db/index.ts";
import { ingestState } from "../../db/schema.ts";
import type { IngestEvent } from "../atproto/types.ts";
import { logEvent } from "../observability/log.ts";
import { ingestConfig } from "./config.ts";
import type { ProcessResult } from "./consumer.ts";
import { processIngestEvent } from "./consumer.ts";
import {
  INGESTED_COLLECTIONS,
  toIngestRecordPayload,
} from "./jetstream-event.ts";

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

/** Events applied in parallel. */
const DEFAULT_APPLY_CONCURRENCY = 16;

/**
 * Depth of the queue between the read loop and the appliers.
 *
 * This is the backpressure budget Jetstream's guidance asks for: the read loop
 * only blocks when the queue is full, so a slow database costs memory here
 * rather than stalling the websocket (which the server answers by disconnecting
 * a `ConsumerTooSlow` consumer). Deep enough to absorb an archive burst, small
 * enough that a wedged applier surfaces as a full queue on the heartbeat
 * instead of an unbounded heap.
 */
const QUEUE_LIMIT = 2048;

/**
 * Attempts before an event is declared `unhandled`.
 *
 * Every `unhandled` observed in the soak was a dropped Neon connection that the
 * very next attempt would have survived, and the cost of conceding is a process
 * restart — so a couple of cheap retries here are worth far more than they cost.
 */
const UNHANDLED_RETRIES = 3;

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
  const blockConcurrency = ingestConfig.jetstreamBlockConcurrency;
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
  /** Set when a worker halts the channel; re-thrown so the process exits. */
  let fatal: Error | undefined;

  // --- Bounded queue between the read loop and the appliers ---------------
  //
  // Jetstream's guidance is explicit: do not await downstream work inside the
  // message-receive loop. A stalled read loop backpressures the socket, and the
  // server's answer to a slow consumer is to disconnect it (`ConsumerTooSlow`
  // is a terminal frame) — so blocking here to "slow down" actually costs the
  // connection and forces a replay. Applying one document is half a dozen
  // sequential round trips to Neon plus, sometimes, an external body fetch, so
  // awaiting it per event would stall the socket on database latency.
  //
  // Instead the loop only enqueues, and workers drain. The queue is bounded, so
  // a genuinely slower-than-the-firehose consumer still exerts backpressure —
  // but against a memory budget we chose rather than one round trip at a time,
  // and `queueDepth` on the heartbeat is the pressure gauge the docs ask for.
  interface PendingBatch {
    lastCursor: number;
    remaining: number;
    unhandled: boolean;
  }
  const queue: Array<{ batch: PendingBatch; event: IngestEvent }> = [];
  // In arrival (seq) order. The cursor may only advance past the head once the
  // head is fully applied — see `drainCommitted`.
  const inflight: Array<PendingBatch> = [];
  // Arrays, not single slots: every worker can be parked at once, and a lone
  // slot would drop all but the last waiter and deadlock the rest.
  const idleWorkers: Array<() => void> = [];
  const readerWaiters: Array<() => void> = [];
  let closed = false;

  function wakeWorker(): void {
    idleWorkers.shift()?.();
  }
  function wakeAllWorkers(): void {
    while (idleWorkers.length > 0) idleWorkers.shift()?.();
  }
  function wakeReader(): void {
    while (readerWaiters.length > 0) readerWaiters.shift()?.();
  }

  /**
   * Commit the cursor across every fully-applied batch at the head of the
   * queue.
   *
   * Batches complete out of order — workers run concurrently — so the cursor
   * tracks the *contiguous applied prefix*, never the highest finished batch. A
   * crash then resumes at the last seq for which everything before it is
   * durably in the read-model; at-least-once redelivery covers the rest.
   */
  async function drainCommitted(): Promise<void> {
    let commit: number | undefined;
    while (inflight.length > 0 && inflight[0].remaining === 0) {
      const head = inflight[0];
      // An `unhandled` event survived its retries: the apply *and* its
      // dead-letter write both failed, so the read-model has no record of it
      // anywhere. The cursor must not advance past it.
      //
      // Holding the cursor is necessary but *not* sufficient, and getting that
      // wrong wedged this channel in the soak. The batch is already consumed
      // from the stream, so nothing re-delivers it while the process lives:
      // the cursor stayed frozen at the failure while workers kept applying
      // later events, `inflight` grew without bound, and every event after the
      // failure would have been replayed on the eventual restart anyway.
      //
      // Restarting is the recovery. The stored cursor still points at the last
      // fully-applied batch, so a fresh process resumes exactly there and
      // at-least-once redelivery covers everything after it.
      if (head.unhandled) {
        throw new Error(
          `unhandled event at seq ${head.lastCursor}: apply and dead-letter both failed — ` +
            `restarting to resume from the last committed cursor`,
        );
      }
      inflight.shift();
      commit = head.lastCursor;
    }
    if (commit !== undefined) {
      await cursor.save(commit);
    }
  }

  async function worker(): Promise<void> {
    for (;;) {
      const item = queue.shift();
      if (!item) {
        if (closed) return;
        await new Promise<void>((resolve) => idleWorkers.push(resolve));
        continue;
      }
      wakeReader();

      const { batch, event } = item;
      stats.lastSeq = Math.max(stats.lastSeq, event.id);
      stats.lastEventAt = Date.now();

      // `unhandled` means the apply *and* its dead-letter write both failed —
      // in practice a dropped connection, which the next attempt usually
      // survives. Retry before conceding: conceding is expensive (see
      // `drainCommitted`), so it is worth a few hundred milliseconds first.
      let result: ProcessResult = "unhandled";
      for (let attempt = 1; attempt <= UNHANDLED_RETRIES; attempt++) {
        try {
          result = await processIngestEvent(event);
        } catch (error: unknown) {
          stats.errors += 1;
          console.error(
            `[ingest:jetstream] failed to process seq ${event.id}`,
            error,
          );
          result = "unhandled";
        }
        if (result !== "unhandled") break;
        if (attempt < UNHANDLED_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        }
      }

      if (result === "applied") stats.applied += 1;
      else if (result === "dead-lettered") stats.deadLettered += 1;
      else {
        stats.unhandled += 1;
        batch.unhandled = true;
      }

      batch.remaining -= 1;
      if (batch.remaining === 0) {
        try {
          await drainCommitted();
        } catch (error: unknown) {
          // An unhandled batch reached the head — the channel cannot make
          // durable progress, so stop it rather than keep consuming events the
          // cursor can never account for.
          stats.errors += 1;
          console.error("[ingest:jetstream] halting channel", error);
          fatal = error instanceof Error ? error : new Error(String(error));
          controller.abort();
          wakeReader();
          return;
        }
      }
    }
  }

  const workers = Array.from({ length: applyConcurrency }, () => worker());

  const heartbeat = setInterval(() => {
    const idleMs =
      stats.lastEventAt === 0 ? -1 : Date.now() - stats.lastEventAt;
    console.info(
      `[ingest:jetstream] heartbeat: applied=${stats.applied} deadLettered=${stats.deadLettered} unhandled=${stats.unhandled} errors=${stats.errors} queue=${queue.length}/${QUEUE_LIMIT} inflightBatches=${inflight.length} lastSeq=${stats.lastSeq} idleMs=${idleMs}`,
    );
    logEvent("ingest.heartbeat", {
      applied: stats.applied,
      deadLettered: stats.deadLettered,
      errors: stats.errors,
      idleMs,
      inflightBatches: inflight.length,
      lane: "jetstream",
      lastEventId: stats.lastSeq,
      ok: true,
      // The pressure gauge: a queue pinned at its limit means the appliers
      // cannot keep up and the read loop is being throttled on purpose.
      queueDepth: queue.length,
      queueLimit: QUEUE_LIMIT,
      unhandled: stats.unhandled,
    });
  }, 10_000);
  heartbeat.unref?.();

  const running = (async () => {
    try {
      for await (const raw of jetstream.replayRawBatches({
        collections: INGESTED_COLLECTIONS,
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
          console.info(
            `[ingest:jetstream] ${info.name}: ${info.message ?? ""}`,
          ),
        // Raw, not typed: typed decode drops every record without a `$type`, and
        // on this network that is ~0.05% of standard.site records — live
        // publications and documents included. See `toIngestRecordPayload`.
        raw: true,
        signal: controller.signal,
      })) {
        const now = Date.now();
        const events = raw.events
          .map((event) => toIngestEvent(event, now))
          .filter((event): event is IngestEvent => event !== null);

        const batch: PendingBatch = {
          lastCursor: raw.lastCursor,
          remaining: events.length,
          unhandled: false,
        };
        inflight.push(batch);

        // A batch whose events were all filtered out still carries the cursor
        // forward, or a stream of non-matching kinds would pin it forever.
        if (events.length === 0) {
          await drainCommitted();
          continue;
        }

        for (const event of events) {
          queue.push({ batch, event });
          wakeWorker();
        }

        // The only place the read loop waits: the queue is full. Bounded by
        // memory, not by per-event database latency.
        while (queue.length >= QUEUE_LIMIT && !controller.signal.aborted) {
          await new Promise<void>((resolve) => readerWaiters.push(resolve));
        }
      }
    } finally {
      closed = true;
      wakeAllWorkers();
    }
    await Promise.all(workers);
    if (fatal) throw fatal;
    // Anything that finished after the last worker's own drain.
    await drainCommitted();
  })().catch((error: unknown) => {
    // A deliberate halt aborts the signal itself, so it must still surface.
    if (controller.signal.aborted && !fatal) return;
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
