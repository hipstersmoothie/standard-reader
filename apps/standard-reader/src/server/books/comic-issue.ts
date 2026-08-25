/**
 * What a comic file should contain.
 *
 * The unit question is the whole problem here. On this network a comic
 * publication posts **one page per document** — `FITV #1, Cover`,
 * `FITV #1, Pg. 1`, `FITV #1, Pg. 2` — so packaging a document produces a
 * one-page CBZ, and a catalog built from documents offers a comic app fifty
 * separate one-page "comics". That is not a comic library; it is a mess.
 *
 * The app already answers the unit question for its own shelf
 * (`selectComicShelf`), by parsing issue numbers back out of the titles — the
 * only place they exist, since the lexicon has no field for them. This module
 * reuses that answer so a downloaded file matches what the shelf shows:
 *
 *  - **`issues` mode** — titles carry issue numbers, so one file is one issue.
 *  - **`pages` mode** — they do not, so there is no issue to package and the
 *    honest unit is the publication's whole run in one file.
 */

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import type { ComicShelfIssue } from "#/server/reader/comic";
import { selectComicPages, selectComicShelf } from "#/server/reader/comic";

/**
 * Pages in one file, at most. A comic that runs longer is served up to this and
 * the reader takes the rest issue by issue — a single request should not fan out
 * to a thousand image fetches.
 */
export const COMIC_FILE_PAGE_LIMIT = 400;

export interface ComicFile {
  /** Title for the file and its `ComicInfo.xml`. */
  title: string;
  /** Issue number when the titles carried one. */
  issueNumber: number | null;
  /** Page image URLs, in reading order. */
  pageUrls: Array<string>;
  publishedAt: string;
}

/**
 * The spine-document index a shelf entry starts at.
 *
 * `planComicShelf` groups *consecutive* spine entries, so an entry's documents
 * are the run beginning after everything the entries before it consumed.
 */
function spineOffsetOf(issues: Array<ComicShelfIssue>, index: number): number {
  let offset = 0;
  for (let at = 0; at < index; at += 1) {
    offset += issues[at]?.documentCount ?? 0;
  }
  return offset;
}

/**
 * One issue as a file, addressed by the document that fronts it on the shelf.
 *
 * The front document's rkey is the key rather than the issue number because it
 * is stable in both shelf modes and needs no numbering scheme of its own — it
 * is exactly what the shelf already links to.
 */
export async function comicIssueFile(
  db: Db,
  schema: Schema,
  publicationUri: string,
  frontRkey: string,
): Promise<ComicFile | null> {
  const shelf = await selectComicShelf(db, schema, publicationUri);
  const index = shelf.issues.findIndex((issue) => issue.rkey === frontRkey);
  const entry = shelf.issues[index];
  if (!entry) return null;

  const { pages } = await selectComicPages(db, schema, {
    issueLimit: entry.documentCount,
    issueOffset: spineOffsetOf(shelf.issues, index),
    publicationUri,
  });

  return {
    issueNumber: entry.issueNumber,
    pageUrls: pages.slice(0, COMIC_FILE_PAGE_LIMIT).map((page) => page.url),
    publishedAt: entry.publishedAt,
    title: entry.label,
  };
}

/** The publication's whole run as one file. */
export async function comicRunFile(
  db: Db,
  schema: Schema,
  publicationUri: string,
  publicationName: string,
): Promise<ComicFile | null> {
  const shelf = await selectComicShelf(db, schema, publicationUri);
  if (shelf.issues.length === 0) return null;

  const documentCount = shelf.issues.reduce(
    (total, issue) => total + issue.documentCount,
    0,
  );
  const { pages } = await selectComicPages(db, schema, {
    issueLimit: documentCount,
    issueOffset: 0,
    publicationUri,
  });
  if (pages.length === 0) return null;

  return {
    issueNumber: null,
    pageUrls: pages.slice(0, COMIC_FILE_PAGE_LIMIT).map((page) => page.url),
    publishedAt: shelf.issues[0]?.publishedAt ?? new Date(0).toISOString(),
    title: publicationName,
  };
}
