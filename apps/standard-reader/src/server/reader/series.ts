/**
 * Where a post sits inside a serial publication, and what comes next.
 *
 * A serial reads forwards from its first post (see `#/lib/publication/serial`),
 * so "next" here means the chronologically *later* issue — the opposite of the
 * archive-walking direction an ordinary blog's prev/next has. Both the comic
 * reader's end-of-issue card and the "Up next" section under a serial book's
 * article read this.
 */

import { and, eq, sql } from "drizzle-orm";

import type {
  Db,
  JsonValue,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import { toIsoTimestamp } from "#/integrations/tanstack-query/api-shapes";
import { documentImages } from "#/lib/document/images";
import type { SerialKind, SerialPublication } from "#/lib/publication/serial";
import {
  BLOG_DIRECTION,
  parsePrevNextDirection,
  resolveSerialPublication,
} from "#/lib/publication/serial";
import { cdnImageUrl } from "#/server/atproto/blob";
import { fetchRepoRecordWithFallback } from "#/server/atproto/fetch-record";
import type { PublicationRecord } from "#/server/atproto/types";
import { documentPublishedNotInFuture } from "#/server/reader/document-filters";
import {
  documentsNewestFirst,
  documentsOldestFirst,
} from "#/server/reader/queries";

/** A neighbouring issue, as rendered by the "Up next" card and the comic reader. */
export interface SeriesNeighbor {
  uri: string;
  did: string;
  rkey: string;
  title: string;
  description: string | null;
  publishedAt: string;
  canonicalUrl: string | null;
  hasRenderableBody: boolean;
  /** Cover art, else the first image the body renders (a comic's opening page). */
  imageUrl: string | null;
  /** Images the body renders — the comic reader's page count for this issue. */
  pageCount: number;
}

export interface SeriesContext {
  /** The owning publication's serial metadata, null when it isn't a serial. */
  serial: SerialPublication | null;
  /** 1-based position of this post in publication order. */
  position: number;
  /** Published posts in the publication. */
  total: number;
  /** The issue before this one, null at the beginning. */
  previous: SeriesNeighbor | null;
  /** The issue after this one, null when this is the latest. */
  next: SeriesNeighbor | null;
}

/** Empty context for a document with no publication (or no serial publisher). */
export const NO_SERIES_CONTEXT: SeriesContext = {
  serial: null,
  position: 0,
  total: 0,
  previous: null,
  next: null,
};

/** Documents sampled when classifying a serial publication. */
export const SERIAL_SAMPLE_SIZE = 40;

/**
 * A comic page's prose is a note *about* the art, not the work itself. Anything
 * longer than this (~700 words) is a chapter of writing that happens to carry an
 * illustration, so it does not count as a page of comic.
 */
export const COMIC_PAGE_MAX_TEXT_LENGTH = 4000;

/** Share of sampled posts that must read as comic pages to call it a comic. */
export const COMIC_PAGE_SHARE = 0.6;

/**
 * Classify one serial publication as a comic or a book from its posts, and
 * persist the answer on the row.
 *
 * A post whose body renders at least one image and carries only a short note of
 * prose is a page of comic; a post that is mostly writing is a chapter. Sampled
 * newest-first: a long-running serial's current form is what a reader arriving
 * today will page through. Returns null when the publication has no posts yet —
 * there is nothing to judge, and the next sweep will try again.
 *
 * Shared by the hourly sweep (`recomputeSerialKinds`) and the on-demand path
 * below, so a publication can't be classified two different ways depending on
 * which one got to it first.
 */
export async function deriveSerialKind(
  db: Db,
  schema: Schema,
  publicationUri: string,
): Promise<SerialKind | null> {
  const d = schema.documents;
  const sample = await db
    .select({
      did: d.did,
      contentJson: d.contentJson,
      contentFormat: d.contentFormat,
      textLength:
        sql<number>`coalesce(char_length(${d.textContent}), 0)`.mapWith(Number),
    })
    .from(d)
    .where(and(eq(d.publicationUri, publicationUri), eq(d.deleted, false)))
    .orderBy(sql`${d.publishedAt} desc nulls last`)
    .limit(SERIAL_SAMPLE_SIZE);

  if (sample.length === 0) return null;

  const comicPages = sample.filter((row) => {
    if (row.textLength > COMIC_PAGE_MAX_TEXT_LENGTH) return false;
    return (
      documentImages({
        did: row.did,
        contentJson: row.contentJson as JsonValue,
        contentFormat: row.contentFormat,
      }).length > 0
    );
  }).length;

  const kind: SerialKind =
    comicPages / sample.length >= COMIC_PAGE_SHARE ? "comic" : "book";

  await db
    .update(schema.publications)
    .set({ serialKind: kind, updatedAt: sql`now()` })
    .where(eq(schema.publications.uri, publicationUri));

  return kind;
}

/**
 * A publication's serial metadata, backfilling from the PDS on first ask.
 *
 * `prev_next_direction` is mirrored by the tap, which only fires on a record
 * create or update — so a publication indexed before the column existed keeps a
 * NULL there until its author happens to edit the record, or the hourly repo
 * reconcile round-robin (50 repos a sweep) reaches it. That is far too slow to
 * light up a reading experience, and never completes at all in an ephemeral
 * preview environment.
 *
 * So NULL triggers the standard read-path backfill (see the `backfillXFromRepo`
 * rule in `CLAUDE.md`): fetch the publication record once, write what it says,
 * and serve from the DB every time after. `upsertPublication` stores the lexicon
 * default rather than NULL for a record that states nothing, so this fires
 * exactly once per publication rather than on every view of every ordinary blog.
 *
 * The kind is derived the same way — on demand, and only for publications that
 * turn out to be serials — so a comic never has to spend an hour reading as a
 * book while it waits for the sweep. Both steps are best-effort: a PDS that
 * won't answer leaves the row alone and reads as an ordinary publication, which
 * is exactly what it looked like a moment ago.
 */
export async function ensurePublicationSerial(
  db: Db,
  schema: Schema,
  publicationUri: string,
): Promise<SerialPublication | null> {
  const p = schema.publications;
  const [row] = await db
    .select({
      prevNextDirection: p.prevNextDirection,
      serialKind: p.serialKind,
    })
    .from(p)
    .where(eq(p.uri, publicationUri))
    .limit(1);
  if (!row) return null;

  let direction = row.prevNextDirection;

  if (direction == null) {
    direction = await backfillPrevNextDirection(db, schema, publicationUri);
  }

  const serial = resolveSerialPublication(direction, row.serialKind);
  if (!serial || row.serialKind != null) return serial;

  // A serial we haven't classified yet: judge it now from its own posts.
  const kind = await deriveSerialKind(db, schema, publicationUri).catch(
    () => null,
  );
  return kind ? { kind } : serial;
}

/**
 * Read `preferences.prevNextDirection` off the publication record and store it,
 * so the next read is served from the DB. Returns the stored value, or null when
 * the record can't be reached — the caller then treats the publication as
 * ordinary and a later read (or the reconcile sweep) tries again.
 */
async function backfillPrevNextDirection(
  db: Db,
  schema: Schema,
  publicationUri: string,
): Promise<string | null> {
  const fetched = await fetchRepoRecordWithFallback(publicationUri).catch(
    () => null,
  );
  const record = fetched?.value as PublicationRecord | undefined;
  if (!record) return null;

  const direction =
    parsePrevNextDirection(record.preferences?.prevNextDirection) ??
    BLOG_DIRECTION;

  await db
    .update(schema.publications)
    .set({ prevNextDirection: direction })
    .where(eq(schema.publications.uri, publicationUri));

  return direction;
}

function neighborColumns(schema: Schema) {
  const d = schema.documents;
  return {
    uri: d.uri,
    did: d.did,
    rkey: d.rkey,
    title: d.title,
    description: d.description,
    publishedAt: d.publishedAt,
    canonicalUrl: d.canonicalUrl,
    hasRenderableBody: d.hasRenderableBody,
    coverImageCid: d.coverImageCid,
    contentJson: d.contentJson,
    contentFormat: d.contentFormat,
  };
}

type NeighborRow = {
  uri: string;
  did: string;
  rkey: string;
  title: string;
  description: string | null;
  publishedAt: Date | string | null;
  canonicalUrl: string | null;
  hasRenderableBody: boolean;
  coverImageCid: string | null;
  contentJson: unknown;
  contentFormat: string | null;
};

/**
 * A neighbour's card. `content_json` is only ever read for the two rows either
 * side of the current post, so extracting the page list here costs nothing
 * measurable — and it is what lets a comic's "next issue" card show that issue's
 * opening page when the record carries no cover image.
 */
function toSeriesNeighbor(row: NeighborRow): SeriesNeighbor {
  const images = documentImages({
    did: row.did,
    contentJson: row.contentJson as JsonValue,
    contentFormat: row.contentFormat,
  });
  return {
    uri: row.uri,
    did: row.did,
    rkey: row.rkey,
    title: row.title,
    description: row.description,
    publishedAt: toIsoTimestamp(row.publishedAt) ?? new Date(0).toISOString(),
    canonicalUrl: row.canonicalUrl,
    hasRenderableBody: row.hasRenderableBody,
    imageUrl: row.coverImageCid
      ? cdnImageUrl(row.did, row.coverImageCid, "jpeg")
      : (images[0]?.url ?? null),
    pageCount: images.length,
  };
}

/**
 * Position + neighbours for a post inside its publication.
 *
 * The three statements run in parallel and all sort on
 * `(publication_uri, published_at)`, so each neighbour is an index range scan
 * that stops at the first row. They reuse the archive's own orderings so a
 * neighbour can never disagree with the list the reader came from.
 *
 * `(published_at, uri)` is compared as a lexicographic pair — spelled out rather
 * than as a Postgres row comparison, so each side keeps the column's own type —
 * which keeps the walk total even when two posts share a timestamp.
 */
export async function selectSeriesContext(
  db: Db,
  schema: Schema,
  opts: {
    documentUri: string;
    publicationUri: string;
    publishedAt: Date;
    prevNextDirection: string | null;
    serialKind: string | null;
  },
): Promise<SeriesContext> {
  const d = schema.documents;
  const { documentUri, publicationUri, publishedAt } = opts;

  const inPublication = and(
    eq(d.publicationUri, publicationUri),
    eq(d.deleted, false),
    documentPublishedNotInFuture(d),
  );

  const isAfter = sql`(${d.publishedAt} > ${publishedAt} or (${d.publishedAt} = ${publishedAt} and ${d.uri} > ${documentUri}))`;
  const isBefore = sql`(${d.publishedAt} < ${publishedAt} or (${d.publishedAt} = ${publishedAt} and ${d.uri} < ${documentUri}))`;

  const [nextRows, previousRows, countRows] = await Promise.all([
    db
      .select(neighborColumns(schema))
      .from(d)
      .where(and(inPublication, isAfter))
      .orderBy(...documentsOldestFirst(d))
      .limit(1),
    db
      .select(neighborColumns(schema))
      .from(d)
      .where(and(inPublication, isBefore))
      .orderBy(...documentsNewestFirst(d))
      .limit(1),
    db
      .select({
        total: sql<number>`count(*)::int`.mapWith(Number),
        position: sql<number>`count(*) filter (where ${isBefore})::int`.mapWith(
          Number,
        ),
      })
      .from(d)
      .where(inPublication),
  ]);

  const counts = countRows[0];
  const nextRow = nextRows[0];
  const previousRow = previousRows[0];

  return {
    serial: resolveSerialPublication(opts.prevNextDirection, opts.serialKind),
    // `position` counts the posts before this one, so this post is the next one.
    position: (counts?.position ?? 0) + 1,
    total: counts?.total ?? 0,
    previous: previousRow ? toSeriesNeighbor(previousRow) : null,
    next: nextRow ? toSeriesNeighbor(nextRow) : null,
  };
}
