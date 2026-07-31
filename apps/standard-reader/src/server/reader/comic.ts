/**
 * A serial comic read as one book, not as a stack of issues.
 *
 * A comic publication's documents are its issues, and an issue's images are its
 * pages — but a reader flipping through it wants one continuous run of pages
 * from the cover to the latest, not a reader that stops dead at the end of every
 * issue. So the comic reader treats the whole publication as the unit: every
 * document's images, in publication order, addressed by one absolute page
 * number.
 *
 * That would mean opening every document's body at once, which for a long-running
 * comic is a lot of `content_json`. Instead it splits in two:
 *
 *  - the **spine** (`selectComicSpine`) — every issue's title and *length*, no
 *    bodies. Cheap enough to load up front, and it is what makes absolute page
 *    numbers possible: each issue's page offset is the sum of the lengths before
 *    it. Lengths come from `documents.body_image_count`, derived at ingest.
 *  - the **chunks** (`selectComicPages`) — the actual image URLs for a window of
 *    issues, fetched as the reader approaches them.
 *
 * A document indexed before `body_image_count` existed has NULL there. The spine
 * fills those in on demand (opening only the bodies it must) and persists them,
 * the same read-path backfill the rest of the read model uses — so the column
 * needs no migration pass to become correct.
 */

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import type {
  Db,
  JsonValue,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import { toIsoTimestamp } from "#/integrations/tanstack-query/api-shapes";
import { documentImages } from "#/lib/document/images";
import { documentPublishedNotInFuture } from "#/server/reader/document-filters";

/** One issue of a comic, as the reader's spine sees it. */
export interface ComicIssue {
  uri: string;
  did: string;
  rkey: string;
  title: string;
  publishedAt: string;
  /** Pages this issue contributes. */
  pageCount: number;
  /** Absolute index (0-based) of this issue's first page in the publication. */
  pageOffset: number;
}

export interface ComicSpine {
  publicationUri: string;
  issues: Array<ComicIssue>;
  /** Every page in the publication, across every issue. */
  totalPages: number;
}

/** One page of the flattened comic. */
export interface ComicPage {
  /** Absolute 0-based index across the whole publication. */
  index: number;
  url: string;
  alt: string;
  aspectRatio: number;
  /** The issue this page belongs to — drives the reader's chrome and read state. */
  issueUri: string;
  issueTitle: string;
  /** 1-based page number within its own issue. */
  pageInIssue: number;
}

/**
 * How many issues' bodies one chunk request opens. Comic issues are small
 * (an image blob ref and a note), so this stays a modest payload while giving
 * the reader a comfortable runway before it needs the next one.
 */
export const COMIC_CHUNK_ISSUES = 5;

/**
 * Fill `body_image_count` for documents that don't have it yet, and return the
 * counts. Only the named documents are opened, and the answers are persisted, so
 * this converges to a no-op as a publication is read.
 */
async function fillMissingPageCounts(
  db: Db,
  schema: Schema,
  uris: Array<string>,
): Promise<Map<string, number>> {
  const filled = new Map<string, number>();
  if (uris.length === 0) return filled;

  const d = schema.documents;
  const rows = await db
    .select({
      uri: d.uri,
      did: d.did,
      contentJson: d.contentJson,
      contentFormat: d.contentFormat,
    })
    .from(d)
    .where(inArray(d.uri, uris));

  for (const row of rows) {
    const count = documentImages({
      did: row.did,
      contentJson: row.contentJson as JsonValue,
      contentFormat: row.contentFormat,
    }).length;
    filled.set(row.uri, count);
    await db.update(d).set({ bodyImageCount: count }).where(eq(d.uri, row.uri));
  }

  return filled;
}

/**
 * Every issue in a comic publication with its page count and absolute page
 * offset, oldest first — the reading order a serial declares (see
 * `#/lib/publication/serial`).
 *
 * Issues that contribute no pages are dropped rather than left as zero-length
 * gaps: a text-only post inside a comic (an announcement, a hiatus note) is not
 * something to flip *through*, and leaving it in would put an unturnable page in
 * the middle of the book.
 */
export async function selectComicSpine(
  db: Db,
  schema: Schema,
  publicationUri: string,
): Promise<ComicSpine> {
  const d = schema.documents;

  const rows = await db
    .select({
      uri: d.uri,
      did: d.did,
      rkey: d.rkey,
      title: d.title,
      publishedAt: d.publishedAt,
      bodyImageCount: d.bodyImageCount,
    })
    .from(d)
    .where(
      and(
        eq(d.publicationUri, publicationUri),
        eq(d.deleted, false),
        documentPublishedNotInFuture(d),
      ),
    )
    .orderBy(sql`${d.publishedAt} asc nulls first`, asc(d.uri));

  // Derive the lengths we don't know yet — first read of a publication indexed
  // before the column existed. Persisted, so this pass shrinks to nothing.
  const missing = rows
    .filter((row) => row.bodyImageCount == null)
    .map((row) => row.uri);
  const filled = await fillMissingPageCounts(db, schema, missing);

  const issues: Array<ComicIssue> = [];
  let pageOffset = 0;
  for (const row of rows) {
    const pageCount = row.bodyImageCount ?? filled.get(row.uri) ?? 0;
    if (pageCount === 0) continue;
    issues.push({
      uri: row.uri,
      did: row.did,
      rkey: row.rkey,
      title: row.title,
      publishedAt: toIsoTimestamp(row.publishedAt) ?? new Date(0).toISOString(),
      pageCount,
      pageOffset,
    });
    pageOffset += pageCount;
  }

  return { publicationUri, issues, totalPages: pageOffset };
}

/**
 * The pages for a window of issues, flattened and absolutely indexed.
 *
 * `issueOffset` is an index into the spine's `issues`, not a page number — the
 * reader maps a page back to its issue through the spine it already holds, and
 * chunk boundaries stay aligned to whole issues so a body is never opened twice.
 *
 * The page indices are recomputed here from each issue's real image list rather
 * than trusted from `body_image_count`: if a publisher edits an issue between
 * the spine load and the chunk load, the stored count is briefly stale, and the
 * pages themselves are the truth. The count is refreshed when they disagree.
 */
export async function selectComicPages(
  db: Db,
  schema: Schema,
  opts: {
    publicationUri: string;
    issueOffset: number;
    issueLimit: number;
  },
): Promise<{ pages: Array<ComicPage>; spine: ComicSpine }> {
  const spine = await selectComicSpine(db, schema, opts.publicationUri);
  const window = spine.issues.slice(
    Math.max(opts.issueOffset, 0),
    Math.max(opts.issueOffset, 0) + Math.max(opts.issueLimit, 1),
  );
  if (window.length === 0) return { pages: [], spine };

  const d = schema.documents;
  const rows = await db
    .select({
      uri: d.uri,
      did: d.did,
      contentJson: d.contentJson,
      contentFormat: d.contentFormat,
    })
    .from(d)
    .where(
      inArray(
        d.uri,
        window.map((issue) => issue.uri),
      ),
    );

  const bodyByUri = new Map(rows.map((row) => [row.uri, row]));
  const pages: Array<ComicPage> = [];

  for (const issue of window) {
    const row = bodyByUri.get(issue.uri);
    if (!row) continue;
    const images = documentImages({
      did: row.did,
      contentJson: row.contentJson as JsonValue,
      contentFormat: row.contentFormat,
    });

    for (const [i, image] of images.entries()) {
      pages.push({
        index: issue.pageOffset + i,
        url: image.url,
        alt: image.alt,
        aspectRatio: image.aspectRatio,
        issueUri: issue.uri,
        issueTitle: issue.title,
        pageInIssue: i + 1,
      });
    }

    if (images.length !== issue.pageCount) {
      await db
        .update(d)
        .set({ bodyImageCount: images.length })
        .where(eq(d.uri, issue.uri));
    }
  }

  return { pages, spine };
}

/** Documents in a publication still missing a derived page count. */
export async function countDocumentsMissingPageCount(
  db: Db,
  schema: Schema,
  publicationUri: string,
): Promise<number> {
  const d = schema.documents;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
    .from(d)
    .where(
      and(
        eq(d.publicationUri, publicationUri),
        eq(d.deleted, false),
        isNull(d.bodyImageCount),
      ),
    );
  return row?.count ?? 0;
}
