/**
 * Re-apply a closed window of the Jetstream archive, without touching the live
 * cursor.
 *
 *   pnpm jetstream:replay-window --from=2026-09-11T20:00:00Z --to=2026-09-13T06:00:00Z
 *   pnpm jetstream:replay-window --from=… --to=… --dry-run
 *
 * **Why this exists.** The ingest worker heals its own gaps: the stored cursor
 * is the resume point, so a crash or an upstream outage replays from wherever
 * it stopped. That only works forwards. A gap the cursor has already moved past
 * is invisible to it, and — worse — invisible to the reconcile sweep too: that
 * sweep compares each repo's PDS head rev against `last_seen_rev`, so once any
 * later event from the same repo advances the rev, a hole in the middle is
 * indistinguishable from a healthy repo. That is exactly how one reader's
 * 2026-09-11 post stayed missing for a week while their 09-13 post arrived
 * fine, and how ~15k documents from the 2026-09-12 outage went unnoticed.
 *
 * Rewinding `ingest_state` would also repair it, and is the wrong tool: the
 * live channel would then replay every event between the old gap and now before
 * it could tail again, so today's posts would stop arriving until it caught up.
 * This runs beside the channel instead, over a bounded window, and writes
 * nothing to `ingest_state`.
 *
 * Safe to run more than once, and safe to run while ingest is live: every
 * handler is an idempotent upsert keyed by URI, which is the same property the
 * channel's own at-least-once redelivery relies on.
 */
import { Jetstream } from "@bsky/jetstream";
import type { CursorStore } from "@bsky/jetstream";

import { ingestConfig } from "../src/server/ingest/config.ts";
import { handleRecord } from "../src/server/ingest/consumer.ts";
import { resolveJetstreamService } from "../src/server/ingest/jetstream-endpoint.ts";
import {
  INGESTED_COLLECTIONS,
  toIngestRecordPayload,
} from "../src/server/ingest/jetstream-event.ts";
import {
  listSegments,
  seqAt,
  seqUntil,
} from "../src/server/ingest/jetstream-segments.ts";
import { logEvent } from "../src/server/observability/log.ts";

function flag(name: string): string | null {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function instant(name: string): number {
  const raw = flag(name);
  if (!raw) throw new Error(`--${name} is required (an ISO instant)`);
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms))
    throw new TypeError(`could not parse --${name}="${raw}"`);
  return ms;
}

const dryRun = process.argv.includes("--dry-run");
const fromMs = instant("from");
const toMs = instant("to");
if (toMs <= fromMs) {
  throw new Error("--to must be after --from");
}

console.info(
  `[replay-window] ${new Date(fromMs).toISOString()} → ${new Date(toMs).toISOString()}`,
);

const segments = await listSegments();
console.info(`[replay-window] ${segments.length} sealed segments`);

const start = seqAt(segments, fromMs);
if (!start) {
  throw new Error(
    "no sealed segment covers --from — it is newer than the sealed tip; widen the window",
  );
}
const end = seqUntil(segments, toMs);
if (!end) {
  throw new Error(
    "no sealed segment starts at or before --to; widen the window",
  );
}
// Both bounds deliberately overshoot outward (see `seqAt` / `seqUntil`): the
// window is a superset of what was asked for, never a subset.
const fromSeq = start.minSeq;
const toSeq = end.maxSeq;
console.info(
  `[replay-window] seq ${fromSeq} → ${toSeq} (${(toSeq - fromSeq).toLocaleString()} events of headroom)`,
);

if (dryRun) {
  console.info("\n(dry run — pass without --dry-run to apply)");
  // oxlint-disable-next-line unicorn/no-process-exit
  process.exit(0);
}

const service = await resolveJetstreamService(ingestConfig.jetstreamServices);
const jetstream = new Jetstream({
  ...(ingestConfig.jetstreamApiKey
    ? { apiKey: ingestConfig.jetstreamApiKey }
    : {}),
  blockConcurrency: ingestConfig.jetstreamBlockConcurrency,
  service,
});

let seen = 0;
let applied = 0;
let failed = 0;
let lastSeq = fromSeq;
const startedAt = Date.now();

function progress(): void {
  const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  const done = Math.min(1, (lastSeq - fromSeq) / Math.max(1, toSeq - fromSeq));
  console.info(
    `[replay-window] seq=${lastSeq} ${(done * 100).toFixed(1)}% seen=${seen} applied=${applied} failed=${failed} elapsed=${elapsed}s`,
  );
}
const ticker = setInterval(progress, 15_000);
ticker.unref?.();

/**
 * Starts at the window and remembers nothing. `save` is deliberately a no-op:
 * this process must not move the live channel's resume point, and it has no
 * resume point of its own — a re-run just replays the window again, which the
 * idempotent handlers make free.
 */
const cursor: CursorStore = {
  load: async () => fromSeq,
  save: async () => {},
};

for await (const batch of jetstream.replayRawBatches({
  collections: INGESTED_COLLECTIONS,
  cursor,
  kinds: ["commit"],
  onError: (error) => {
    failed += 1;
    console.warn("[replay-window]", error.message);
  },
})) {
  let past = false;
  for (const event of batch.events) {
    lastSeq = event.seq;
    // The window's far end. `replayRawBatches` streams to the live tip, so the
    // only thing that stops it is us.
    if (event.seq > toSeq) {
      past = true;
      break;
    }
    // `live: false` — these are historical events being re-applied, and the
    // handlers use that to skip work that only makes sense for a fresh record
    // (notifications, feed churn).
    const payload = toIngestRecordPayload(event, { live: false });
    if (!payload) continue;
    seen += 1;
    try {
      await handleRecord(payload);
      applied += 1;
    } catch (error: unknown) {
      failed += 1;
      logEvent("ingest.replayWindowFailed", {
        collection: payload.collection,
        did: payload.did,
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        rkey: payload.rkey,
      });
    }
  }
  if (past) break;
}

clearInterval(ticker);
progress();
console.info(
  `[replay-window] done: ${applied} applied, ${failed} failed, ${seen} in-window events`,
);
logEvent("ingest.replayWindow", {
  applied,
  failed,
  fromSeq,
  ok: failed === 0,
  seen,
  toSeq,
});
// oxlint-disable-next-line unicorn/no-process-exit
process.exit(failed > 0 ? 1 : 0);
