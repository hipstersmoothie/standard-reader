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
import { ingestConfig } from "../src/server/ingest/config.ts";

const STREAM_ID = "jetstream";
/**
 * Segments per `listSegments` page. Deliberately well under the endpoint's
 * 1000 maximum: at 1000 the response runs past 500KB and the connection is
 * liable to be closed mid-body (`TypeError: terminated`).
 */
const PAGE = 250;
const ATTEMPTS = 4;

interface Segment {
  index: number;
  maxSeq: number;
  maxWitnessedAt: number;
  minSeq: number;
  minWitnessedAt: number;
  name: string;
}

function flag(name: string): string | null {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

/** `--since=90m` / `--since=2h` / `--since=3d`, as a wall-clock instant. */
function parseSince(value: string): number {
  const match = /^(\d+)([mhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(`--since must look like 30m, 2h, or 3d (got "${value}")`);
  }
  const scale = { d: 86_400_000, h: 3_600_000, m: 60_000 }[match[2]] ?? 0;
  return Date.now() - Number(match[1]) * scale;
}

async function listSegments(): Promise<Array<Segment>> {
  const headers: Record<string, string> = {};
  if (ingestConfig.jetstreamApiKey) {
    headers.Authorization = `Bearer ${ingestConfig.jetstreamApiKey}`;
  }
  const segments: Array<Segment> = [];
  let cursor: string | undefined;
  for (;;) {
    const params = new URLSearchParams({ limit: String(PAGE) });
    if (cursor) params.set("cursor", cursor);
    const url = `${ingestConfig.jetstreamService}/xrpc/network.bsky.jetstream.listSegments?${params}`;

    // Retry the whole request/parse: a dropped connection surfaces as a throw
    // from `fetch` or from reading the body, and both mean the same thing here.
    type Page = { cursor?: string; segments: Array<Segment> };
    let page: Page | null = null;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) {
          throw new Error(`listSegments ${res.status}: ${await res.text()}`);
        }
        page = (await res.json()) as Page;
        break;
      } catch (error: unknown) {
        if (attempt === ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    if (!page) throw new Error("listSegments returned no page");
    segments.push(...page.segments);
    if (!page.cursor || page.segments.length === 0) break;
    cursor = page.cursor;
  }
  return segments;
}

/**
 * The seq to resume from for a given instant.
 *
 * Segments are sealed in ingestion order, but their `witnessed_at` windows
 * overlap — the bootstrap backfill wrote thousands of segments within minutes
 * of each other — so this scans rather than binary-searches, and takes the
 * *earliest* segment that could contain the instant. 7,000 segments is eight
 * HTTP requests; correctness is worth more than the round trips here.
 */
function seqAt(segments: Array<Segment>, atMs: number): Segment | null {
  const atMicros = atMs * 1000;
  let earliest: Segment | null = null;
  for (const segment of segments) {
    if (segment.maxWitnessedAt < atMicros) continue;
    if (!earliest || segment.minSeq < earliest.minSeq) earliest = segment;
  }
  return earliest;
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
