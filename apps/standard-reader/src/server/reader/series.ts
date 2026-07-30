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
import type { SerialPublication } from "#/lib/publication/serial";
import { resolveSerialPublication } from "#/lib/publication/serial";
import { cdnImageUrl } from "#/server/atproto/blob";
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

/**
 * A publication's serial metadata on its own — a primary-key lookup, for the
 * read paths that need the reading order before they can run their real query
 * (the archive listing) and don't otherwise load the publication row.
 */
export async function selectPublicationSerial(
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
  return resolveSerialPublication(row.prevNextDirection, row.serialKind);
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
