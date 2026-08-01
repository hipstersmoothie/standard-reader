/**
 * Which publications read as comics?
 *
 * A comic is two things at once (see `#/lib/publication/serial`):
 *
 *  1. **A publisher setting** — `preferences.prevNextDirection = "ltr"` on the
 *     `site.standard.publication` record, which declares the publication reads
 *     forwards from its first post. Nothing else in the lexicon says "comic".
 *  2. **Content that reads as pages** — at least `COMIC_PAGE_SHARE` of the
 *     newest `SERIAL_SAMPLE_SIZE` posts render an image and carry no more than
 *     `COMIC_PAGE_MAX_TEXT_LENGTH` characters of prose. That is the app's own
 *     derivation (`classifySerialSample`), and it is what separates a comic from
 *     a serialized novel.
 *
 * This reports both halves for every publication, so a comic that is one setting
 * away from lighting up — or one whose stored `serial_kind` has drifted from
 * what its recent posts actually look like — is visible without guessing.
 *
 * Read-only. It never writes `serial_kind`; `pnpm backfill:serial` is the pass
 * that does (and the hourly `recomputeSerialKinds` sweep keeps it fresh).
 *
 *   pnpm scan:comics
 *   pnpm scan:comics -- --json
 *   pnpm scan:comics -- --min-docs=5 --limit=100
 *   pnpm scan:comics -- --no-fetch     # skip PDS reads for unknown settings
 *
 * Cost: one cheap SQL pass over every publication's newest posts (counts only,
 * no bodies), then a full classification of just the shortlist it turns up —
 * plus every publication already marked a serial, so drift is always checked.
 */
import { sql } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import * as schema from "../src/db/schema.ts";
import { titlesLookLikeIssues } from "../src/lib/comic/issue-title.ts";
import { mapWithConcurrency } from "../src/lib/concurrency.ts";
import {
  BLOG_DIRECTION,
  parsePrevNextDirection,
  SERIAL_DIRECTION,
} from "../src/lib/publication/serial.ts";
import { fetchRepoRecordWithFallback } from "../src/server/atproto/fetch-record.ts";
import type { PublicationRecord } from "../src/server/atproto/types.ts";
import {
  classifySerialSample,
  COMIC_PAGE_MAX_TEXT_LENGTH,
  COMIC_PAGE_SHARE,
  selectSerialSample,
  SERIAL_SAMPLE_SIZE,
} from "../src/server/reader/series.ts";

/**
 * Publications with fewer posts than this aren't worth reporting as candidates:
 * the content test is a *share*, and three image posts out of three is what a
 * brand-new photo blog looks like, not a comic. Publications the publisher has
 * already marked a serial are classified whatever their length, because that is
 * what the app itself does with them.
 */
const DEFAULT_MIN_DOCS = 6;
/** Sample classifications in flight — each pulls `content_json` for up to 40 posts. */
const CLASSIFY_CONCURRENCY = 6;
/** Publication records in flight when resolving an unknown setting. */
const FETCH_CONCURRENCY = 8;
/** Rows printed per section before the rest are summarised. */
const DEFAULT_TOP = 25;

interface Args {
  json: boolean;
  fetchRecords: boolean;
  minDocs: number;
  limit: number;
  top: number;
}

function parseArgs(argv: Array<string>): Args {
  const numeric = (flag: string, fallback: number): number => {
    const hit = argv.find((arg) => arg.startsWith(`${flag}=`));
    const value = hit
      ? Number.parseInt(hit.slice(flag.length + 1), 10)
      : Number.NaN;
    return Number.isFinite(value) ? value : fallback;
  };
  const top = numeric("--top", DEFAULT_TOP);
  return {
    json: argv.includes("--json"),
    fetchRecords: !argv.includes("--no-fetch"),
    minDocs: numeric("--min-docs", DEFAULT_MIN_DOCS),
    limit: numeric("--limit", Number.POSITIVE_INFINITY),
    top: top <= 0 ? Number.POSITIVE_INFINITY : top,
  };
}

const args = parseArgs(process.argv.slice(2));

/**
 * Cheap shortlist: per publication, how many of its newest posts *could* be
 * comic pages, judged from columns alone.
 *
 * `body_image_count` is derived at ingest but is NULL for anything indexed
 * before the column existed, so a NULL counts as a maybe here rather than a no —
 * this pass only has to avoid missing a comic, and the classification below
 * settles the maybes by opening the bodies.
 */
interface Shortlisted {
  uri: string;
  did: string;
  name: string;
  url: string;
  prevNextDirection: string | null;
  serialKind: string | null;
  sampled: number;
  /** Sampled posts that are known to be short and to carry an image. */
  imagePages: number;
  /** Sampled posts whose image count hasn't been derived yet. */
  unknownPages: number;
}

const started = Date.now();

const prescan = await db.execute<{
  uri: string;
  did: string;
  name: string;
  url: string;
  prev_next_direction: string | null;
  serial_kind: string | null;
  sampled: number;
  image_pages: number;
  unknown_pages: number;
}>(sql`
  select
    p.uri,
    p.did,
    p.name,
    p.url,
    p.prev_next_direction,
    p.serial_kind,
    s.sampled,
    s.image_pages,
    s.unknown_pages
  from publications p
  cross join lateral (
    select
      count(*)::int as sampled,
      count(*) filter (
        where recent.text_len <= ${COMIC_PAGE_MAX_TEXT_LENGTH}
          and recent.body_image_count > 0
      )::int as image_pages,
      count(*) filter (
        where recent.text_len <= ${COMIC_PAGE_MAX_TEXT_LENGTH}
          and recent.body_image_count is null
      )::int as unknown_pages
    from (
      select
        d.body_image_count,
        coalesce(char_length(d.text_content), 0) as text_len
      from documents d
      where d.publication_uri = p.uri
        and d.deleted = false
      order by d.published_at desc nulls last
      limit ${SERIAL_SAMPLE_SIZE}
    ) recent
  ) s
  where p.deleted = false
    and s.sampled > 0
`);

const prescanRows = (prescan.rows ?? prescan) as unknown as Array<
  Record<string, unknown>
>;

const all: Array<Shortlisted> = prescanRows.map((row) => ({
  uri: String(row.uri),
  did: String(row.did),
  name: String(row.name),
  url: String(row.url),
  prevNextDirection: (row.prev_next_direction as string | null) ?? null,
  serialKind: (row.serial_kind as string | null) ?? null,
  sampled: Number(row.sampled),
  imagePages: Number(row.image_pages),
  unknownPages: Number(row.unknown_pages),
}));

// A publication is worth classifying when its *optimistic* share (maybes counted
// as pages) clears the bar — anything below it cannot come out a comic. Serials
// are always classified whatever the prescan says, so a stored `serial_kind`
// that has drifted from the posts is still caught.
const candidates = all
  .filter((row) => {
    if (row.prevNextDirection === SERIAL_DIRECTION) return true;
    if (row.sampled < args.minDocs) return false;
    return (
      (row.imagePages + row.unknownPages) / row.sampled >= COMIC_PAGE_SHARE
    );
  })
  .toSorted(
    (a, b) => b.imagePages + b.unknownPages - (a.imagePages + a.unknownPages),
  )
  .slice(0, Number.isFinite(args.limit) ? args.limit : undefined);

interface Verdict extends Shortlisted {
  /** Posts that really do read as comic pages, bodies opened. */
  comicPages: number;
  share: number;
  contentKind: "comic" | "book" | null;
  /** Whether the titles carry issue numbers — the shelf's grouping convention. */
  shelfGroupable: boolean;
  /** Direction after any record read; `"unknown"` when it still can't be told. */
  direction: string;
  /** True when the direction here came from the PDS, not the read model. */
  directionFromRecord: boolean;
}

const verdicts = await mapWithConcurrency(
  candidates,
  CLASSIFY_CONCURRENCY,
  async (row): Promise<Verdict> => {
    const sample = await selectSerialSample(db, schema, row.uri);
    const verdict = classifySerialSample(sample);
    return {
      ...row,
      comicPages: verdict.comicPages,
      share: verdict.share,
      contentKind: verdict.kind,
      shelfGroupable: titlesLookLikeIssues(sample.map((doc) => doc.title)),
      direction: row.prevNextDirection ?? "unknown",
      directionFromRecord: false,
    };
  },
);

// Only the ones whose content reads as a comic are worth a PDS read: for
// everything else the setting changes nothing about what we'd show, and the
// hourly reconcile will fill the column in its own time.
const needDirection = verdicts.filter(
  (row) => row.contentKind === "comic" && row.prevNextDirection == null,
);

if (args.fetchRecords && needDirection.length > 0) {
  await mapWithConcurrency(needDirection, FETCH_CONCURRENCY, async (row) => {
    const fetched = await fetchRepoRecordWithFallback(row.uri).catch(
      () => null,
    );
    const record = fetched?.value as PublicationRecord | undefined;
    if (!record) return;
    row.direction =
      parsePrevNextDirection(record.preferences?.prevNextDirection) ??
      BLOG_DIRECTION;
    row.directionFromRecord = true;
  });
}

/**
 * Strongest first: a publication whose titles carry issue numbers is a comic
 * saying so out loud (it is also the one the shelf can group), and after that
 * the more pages that read as art, the more there is to go on.
 */
const byStrength = (a: Verdict, b: Verdict) =>
  Number(b.shelfGroupable) - Number(a.shelfGroupable) ||
  b.comicPages - a.comicPages;

const comics = verdicts
  .filter(
    (row) => row.contentKind === "comic" && row.direction === SERIAL_DIRECTION,
  )
  .toSorted(byStrength);
const nearMisses = verdicts
  .filter(
    (row) => row.contentKind === "comic" && row.direction !== SERIAL_DIRECTION,
  )
  .toSorted(byStrength);
// The content test alone can't tell a comic from a photo blog — both post short
// picture posts. Titles that number their issues can, so the candidates are
// reported in two tiers rather than one long list where the real ones are lost.
const namedIssues = nearMisses.filter((row) => row.shelfGroupable);
const imageOnly = nearMisses.filter((row) => !row.shelfGroupable);
const serialBooks = verdicts.filter(
  (row) => row.contentKind === "book" && row.direction === SERIAL_DIRECTION,
);
const drifted = verdicts.filter(
  (row) =>
    row.direction === SERIAL_DIRECTION &&
    row.contentKind != null &&
    row.serialKind !== row.contentKind,
);

if (args.json) {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        criteria: {
          serialDirection: SERIAL_DIRECTION,
          sampleSize: SERIAL_SAMPLE_SIZE,
          comicPageShare: COMIC_PAGE_SHARE,
          maxTextLength: COMIC_PAGE_MAX_TEXT_LENGTH,
        },
        scanned: all.length,
        shortlisted: candidates.length,
        comics,
        nearMisses: { namedIssues, imageOnly },
        serialBooks,
        drifted,
      },
      null,
      2,
    ),
  );
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0);
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

function print(row: Verdict): string {
  const stored =
    row.serialKind === row.contentKind
      ? "        "
      : `stored=${row.serialKind ?? "none"}`.padEnd(8);
  const source = row.directionFromRecord ? " (from record)" : "";
  return [
    `  ${row.name.slice(0, 40).padEnd(40)}`,
    `${String(row.comicPages).padStart(3)}/${String(row.sampled).padEnd(3)} pages ${pct(row.share).padStart(4)}`,
    `shelf:${row.shelfGroupable ? "yes" : "no "}`,
    `dir=${row.direction}${source}`.padEnd(22),
    stored,
    row.uri,
  ].join("  ");
}

const log = (line: string) => {
  // eslint-disable-next-line no-console
  console.log(line);
};

/** Print a section, saying plainly how much of it was left unprinted. */
function section(title: string, rows: Array<Verdict>, note?: string): void {
  log(`\n${title} (${rows.length})`);
  if (rows.length === 0) {
    // The note explains what to do about the rows; with none, it is noise.
    log("  (none)");
    return;
  }
  if (note) log(`  ${note}`);
  for (const row of rows.slice(0, args.top)) log(print(row));
  if (rows.length > args.top) {
    log(`  … and ${rows.length - args.top} more (--top=0 to print all)`);
  }
}

log(
  `Comic criteria: prevNextDirection="${SERIAL_DIRECTION}" on the publication ` +
    `record, and ≥${pct(COMIC_PAGE_SHARE)} of the newest ${SERIAL_SAMPLE_SIZE} ` +
    `posts rendering an image with ≤${COMIC_PAGE_MAX_TEXT_LENGTH} chars of prose.\n`,
);
log(
  `Scanned ${all.length} publications with posts; ` +
    `${candidates.length} classified in full` +
    (args.fetchRecords && needDirection.length > 0
      ? `; ${needDirection.length} publication record(s) read for an unknown setting`
      : "") +
    ".\n",
);

section(
  "Comics — content and setting both agree",
  comics,
  "These open on a shelf of covers and read in the comic reader today.",
);

section(
  "Reads as a comic, and numbers its issues — but isn't set to read forwards",
  namedIssues,
  'Best candidates. They need `preferences.prevNextDirection: "ltr"` on the ' +
    "publication record before the reader treats them as comics.",
);

section(
  "Image-led, but nothing says comic",
  imageOnly,
  "Short picture posts with no issue numbering — mostly photo and art blogs. " +
    "Listed for completeness, not as candidates.",
);

section(
  "Serials that read as books, not comics",
  serialBooks,
  'Prose serials — an "Up next" link, no comic reader. Working as intended.',
);

section(
  "Stored serial_kind disagrees with the posts",
  drifted,
  "Run `pnpm backfill:serial` to re-derive.",
);

log(`\n(${Math.round((Date.now() - started) / 1000)}s)`);

// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
