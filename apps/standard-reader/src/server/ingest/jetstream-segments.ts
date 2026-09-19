/**
 * The archive's segment index, and the seq⇄wall-clock lookup built on it.
 *
 * Jetstream numbers events with an opaque `seq`, but every sealed segment
 * publishes the `witnessed_at` window it covers alongside its seq window — so
 * the segment list is the only thing that can answer "which seq was the stream
 * at, at 03:00 last Tuesday". That question comes up whenever a gap has to be
 * named: setting a resume cursor (`scripts/jetstream-cutover.ts`) and replaying
 * a window that the live cursor has long since passed
 * (`scripts/replay-window.ts`).
 *
 * Lifted out of the cutover script when the second caller appeared. Both want
 * the same paging, the same retries, and — most importantly — the same
 * deliberately-early answer from {@link seqAt}.
 */
import { ingestConfig } from "./config.ts";
import { resolveJetstreamService } from "./jetstream-endpoint.ts";

export interface Segment {
  index: number;
  maxSeq: number;
  /** Microseconds since the epoch, not milliseconds. */
  maxWitnessedAt: number;
  minSeq: number;
  minWitnessedAt: number;
  name: string;
}

/**
 * Segments per `listSegments` page. Deliberately well under the endpoint's
 * 1000 maximum: at 1000 the response runs past 500KB and the connection is
 * liable to be closed mid-body (`TypeError: terminated`).
 */
const PAGE = 250;
const ATTEMPTS = 4;

/** Every sealed segment in the archive, oldest first. */
export async function listSegments(): Promise<Array<Segment>> {
  const headers: Record<string, string> = {};
  if (ingestConfig.jetstreamApiKey) {
    headers.Authorization = `Bearer ${ingestConfig.jetstreamApiKey}`;
  }
  const segments: Array<Segment> = [];
  // Resolved once: the loop pages, and re-probing per page would add a round
  // trip to every page for an answer that cannot change mid-run.
  const service = await resolveJetstreamService(ingestConfig.jetstreamServices);
  let cursor: string | undefined;
  for (;;) {
    const params = new URLSearchParams({ limit: String(PAGE) });
    if (cursor) params.set("cursor", cursor);
    const url = `${service}/xrpc/network.bsky.jetstream.listSegments?${params}`;

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
 * The segment to resume from for a given instant, or `null` when the instant is
 * newer than the sealed tip.
 *
 * Segments are sealed in ingestion order, but their `witnessed_at` windows
 * overlap — the bootstrap backfill wrote thousands of segments within minutes
 * of each other — so this scans rather than binary-searches, and takes the
 * *earliest* segment that could contain the instant. 7,000 segments is eight
 * HTTP requests; correctness is worth more than the round trips here.
 *
 * The answer is deliberately earlier than asked. Overlap is free — every
 * handler is an idempotent upsert keyed by URI — whereas a gap is silent and
 * permanent.
 */
export function seqAt(segments: Array<Segment>, atMs: number): Segment | null {
  const atMicros = atMs * 1000;
  let earliest: Segment | null = null;
  for (const segment of segments) {
    if (segment.maxWitnessedAt < atMicros) continue;
    if (!earliest || segment.minSeq < earliest.minSeq) earliest = segment;
  }
  return earliest;
}

/**
 * The last seq that can still be *witnessed* at or before `atMs`.
 *
 * The mirror of {@link seqAt}, for bounding the far end of a replay window, and
 * biased the other way: the latest segment that starts at or before the
 * instant, so the window closes after it rather than before. Same reasoning —
 * replaying a little extra is free, stopping early is a hole.
 */
export function seqUntil(
  segments: Array<Segment>,
  atMs: number,
): Segment | null {
  const atMicros = atMs * 1000;
  let latest: Segment | null = null;
  for (const segment of segments) {
    if (segment.minWitnessedAt > atMicros) continue;
    if (!latest || segment.maxSeq > latest.maxSeq) latest = segment;
  }
  return latest;
}

/** `90m` / `2h` / `3d` before now, as a wall-clock instant. */
export function parseSince(value: string): number {
  const match = /^(\d+)([mhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(`--since must look like 30m, 2h, or 3d (got "${value}")`);
  }
  const scale = { d: 86_400_000, h: 3_600_000, m: 60_000 }[match[2]] ?? 0;
  return Date.now() - Number(match[1]) * scale;
}
