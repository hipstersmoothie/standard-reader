/**
 * Is the stream actually moving?
 *
 * Two ingest outages in September 2026 — 09-12 and a 29-hour one starting
 * 09-17 — were both found by a reader noticing their post was missing, days
 * later. Nothing in the system said anything, because nothing was watching the
 * one field that would have known.
 *
 * That field is `ingest_state.last_event_at`. The channel writes it after every
 * durably-handled batch (see `cursorStore` in `./jetstream-channel.ts`), so it
 * tracks the worker's pulse rather than the network's: it stays current during
 * an archive replay, and goes stale the moment the worker stops — whether it
 * crashed, wedged, or Railway stopped restarting it.
 *
 * What it is *not* is a count of rows. The tables lie about this. `reads`,
 * `recommends` and `subscriptions` have a direct app-side writer
 * (`src/server/reader/personal-state-mirror.ts`) and keep updating while the
 * stream is dead — they looked perfectly healthy all 29 hours. Only `documents`
 * and `publications` are stream-only, and a quiet hour is indistinguishable
 * from a dead one by row count alone. The cursor timestamp has no such
 * ambiguity.
 */
import { eq } from "drizzle-orm";

import { db } from "../../db/index.ts";
import { ingestState } from "../../db/schema.ts";

/** The `ingest_state` row the Jetstream channel owns. */
const STREAM_ID = "jetstream";

/**
 * How stale the cursor may get before the stream counts as stopped.
 *
 * Fifteen minutes is far outside normal — the cursor is written after every
 * batch, so in a healthy worker it is never more than seconds old, replay or
 * not. It is also well inside the window that matters: both outages would have
 * been caught on the first check rather than on day two.
 */
export const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;

export interface IngestFreshness {
  /** `null` when the row has never been written (a brand-new deployment). */
  lastEventAt: Date | null;
  /** `null` alongside a `null` `lastEventAt`. */
  ageMs: number | null;
  stale: boolean;
  staleAfterMs: number;
  lastEventId: string | null;
}

function staleAfterMs(): number {
  const value = Number(process.env.INGEST_STALE_AFTER_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_STALE_AFTER_MS;
}

/** Decide staleness from an already-read timestamp. Pure, so it is testable. */
export function judgeFreshness(
  lastEventAt: Date | null,
  now: number,
  threshold: number,
): { ageMs: number | null; stale: boolean } {
  if (!lastEventAt) {
    // Never written. Treated as stale on purpose: a worker that has never
    // saved a cursor is not one that is fine, it is one that has not started.
    return { ageMs: null, stale: true };
  }
  const ageMs = now - lastEventAt.getTime();
  return { ageMs, stale: ageMs > threshold };
}

/** Read the cursor's pulse. */
export async function ingestFreshness(): Promise<IngestFreshness> {
  const [row] = await db
    .select({
      lastEventAt: ingestState.lastEventAt,
      lastEventId: ingestState.lastEventId,
    })
    .from(ingestState)
    .where(eq(ingestState.id, STREAM_ID))
    .limit(1);

  const threshold = staleAfterMs();
  const lastEventAt = row?.lastEventAt ?? null;
  const { ageMs, stale } = judgeFreshness(lastEventAt, Date.now(), threshold);

  return {
    ageMs,
    lastEventAt,
    lastEventId: row?.lastEventId == null ? null : String(row.lastEventId),
    stale,
    staleAfterMs: threshold,
  };
}
