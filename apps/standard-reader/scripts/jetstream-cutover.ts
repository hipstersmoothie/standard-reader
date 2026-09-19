/**
 * Set the Jetstream resume cursor for a tap → Jetstream cutover.
 *
 *   pnpm jetstream:cutover --since=3h            # dry run: print the seq
 *   pnpm jetstream:cutover --since=3h --write    # write it to ingest_state
 *   pnpm jetstream:cutover --at=2026-08-14T05:00:00Z --write
 *
 * The two streams number their events independently, so tap's high-water mark
 * says nothing about where to start Jetstream. What we actually want is "the
 * last moment tap was known good", expressed as a Jetstream seq — and
 * `listSegments` carries exactly that, since every sealed segment publishes the
 * `witnessed_at` window it covers alongside its seq window.
 *
 * The seq it picks is the `minSeq` of the segment covering that instant, i.e.
 * deliberately *earlier* than asked. Overlap is free — every handler is an
 * idempotent upsert keyed by URI, which is the same property tap's redelivery
 * already relies on — whereas a gap is silent and permanent. Give it more
 * margin than you think you need, and at minimum enough to clear the seal lag:
 * segments seal on a ~256MB boundary, so the sealed tip trails real time and a
 * `--since` inside that lag has no segment to name.
 */
import { sql } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { ingestState } from "../src/db/schema.ts";
import {
  listSegments,
  parseSince,
  seqAt,
} from "../src/server/ingest/jetstream-segments.ts";

const STREAM_ID = "jetstream";
function flag(name: string): string | null {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const write = process.argv.includes("--write");
const since = flag("since");
const at = flag("at");

let seq: number;
{
  const atMs = at ? Date.parse(at) : parseSince(since ?? "3h");
  if (!Number.isFinite(atMs)) {
    throw new TypeError(`could not parse --at="${at}"`);
  }
  console.log(`target instant  ${new Date(atMs).toISOString()}`);
  const segments = await listSegments();
  console.log(`segments        ${segments.length}`);
  const segment = seqAt(segments, atMs);
  if (!segment) {
    // Segments seal on a size boundary (~256MB), so the sealed tip trails real
    // time by however long the current one takes to fill — a `--since` inside
    // that lag has no segment to name. Ask for more margin rather than falling
    // back to the tip, which would silently skip the gap.
    throw new Error(
      "no sealed segment covers that instant — it is newer than the sealed tip (segments seal on a size boundary, so the tip trails real time); retry with a larger --since, e.g. --since=3h",
    );
  }
  seq = segment.minSeq;
  console.log(
    `segment         ${segment.name} (witnessed ${new Date(
      segment.minWitnessedAt / 1000,
    ).toISOString()} … ${new Date(segment.maxWitnessedAt / 1000).toISOString()})`,
  );
  console.log(`resume seq      ${seq}`);
}

if (!write) {
  console.log("\n(dry run — pass --write to store it in ingest_state)");
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0);
}

await db
  .insert(ingestState)
  .values({ id: STREAM_ID, lastEventAt: sql`now()`, lastEventId: seq })
  .onConflictDoUpdate({
    // A plain assignment, unlike the channel's `greatest(...)`: rewinding is
    // the entire point of this script, and a re-cutover after a rollback has to
    // be able to move the cursor backwards.
    set: { lastEventAt: sql`now()`, lastEventId: seq, updatedAt: sql`now()` },
    target: ingestState.id,
  });
console.log(`\nwrote ingest_state["${STREAM_ID}"].last_event_id = ${seq}`);
// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
