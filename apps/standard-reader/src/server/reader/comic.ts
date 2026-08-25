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
import {
  isCoverPageLabel,
  parseComicIssueTitle,
  titlesLookLikeIssues,
} from "#/lib/comic/issue-title";
import { comicPageNote } from "#/lib/comic/page-note";
import { documentImages } from "#/lib/document/images";
import { documentExtractedText } from "#/lib/document/search-text";
import { documentPublishedNotInFuture } from "#/server/reader/document-filters";
import { selectUnreadDocumentUris } from "#/server/reader/queries";

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
  /**
   * The prose this page's post carries beside the art (`#/lib/comic/page-note`),
   * or null when the post is art and nothing else — which is most of them.
   *
   * Carried per page rather than per issue: it belongs to the post, and a post
   * that contributes several pages says the same thing about all of them, so
   * every one of its pages can show it. The repetition costs a duplicate string
   * in the payload for the rare multi-image post, and saves the reader having to
   * map a page back to a document to find out whether there is anything to read.
   */
  note: string | null;
}

/**
 * How many issues' bodies one chunk request opens. Comic issues are small
 * (an image blob ref and a note), so this stays a modest payload while giving
 * the reader a comfortable runway before it needs the next one.
 */
export const COMIC_CHUNK_ISSUES = 5;

/**
 * How deep into a comic the shelf tracks unread pages. The cap keeps a reader
 * scoped query bounded on a publication that could hold any number of pages; it
 * drops the *oldest* unread pages first (the lookup is newest-first), so a
 * reader who has never opened a comic this long sees the recent issues marked
 * honestly and the very oldest ones sitting quiet — which is 2,000 pages of
 * reading away from mattering.
 */
const COMIC_UNREAD_PAGE_LIMIT = 2000;

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
 *
 * The chunk also carries each page's note — the prose its post published with
 * the art. It rides here because this is the one query that opens the bodies
 * anyway; asking for it separately would re-read the same rows to answer a
 * question this one already has in hand.
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
      textContent: d.textContent,
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

    // The body we can parse is preferred over the stored text: `text_content`
    // is the *search* blob (record text plus extracted body), and old backfills
    // are known to have compounded copies into it — fine for a search index,
    // not for something a reader is asked to read. It stands in only when the
    // body yields no text at all.
    const bodyText =
      documentExtractedText(row.contentJson as JsonValue, row.contentFormat) ??
      row.textContent;
    const note = comicPageNote(bodyText, images);

    for (const [i, image] of images.entries()) {
      pages.push({
        index: issue.pageOffset + i,
        url: image.url,
        alt: image.alt,
        aspectRatio: image.aspectRatio,
        issueUri: issue.uri,
        issueTitle: issue.title,
        pageInIssue: i + 1,
        note,
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

/** A page of an issue the reader hasn't opened yet. */
export interface ComicUnreadPage {
  /** The page's own document — what a `read` record is written against. */
  uri: string;
  /** Absolute 0-based page index, so the reader can be opened straight on it. */
  pageOffset: number;
}

/** One issue on the shelf — a run of pages fronted by its cover. */
export interface ComicShelfIssue {
  /** Issue number from the titles, null for pages that named none. */
  issueNumber: number | null;
  /** What to print under the cover — `#2`, or the document title as a fallback. */
  label: string;
  /** The document whose art fronts the issue. */
  uri: string;
  did: string;
  rkey: string;
  coverImageUrl: string | null;
  /** Absolute page this issue opens on, for the reader. */
  pageOffset: number;
  pageCount: number;
  /** Documents (pages) collapsed into this issue. */
  documentCount: number;
  publishedAt: string;
  /**
   * The pages of this issue the reader hasn't opened, in reading order. An issue
   * is unread while this holds anything — a comic read halfway through is not
   * read — and its first entry is where opening the issue drops the reader.
   *
   * Always empty for a signed-out reader, or one who doesn't keep reading
   * history: there is no read state to report, and an issue that can never be
   * marked read must not sit there wearing an unread dot forever.
   */
  unreadPages: Array<ComicUnreadPage>;
}

/**
 * How a shelf's entries were formed.
 *
 * `"issues"` — the titles carry issue numbers, so consecutive pages sharing one
 * collapsed into a single cover. `"pages"` — they don't, so every post is its
 * own cover. Both are shelves; the mode only says what one card stands for.
 */
export type ComicShelfMode = "issues" | "pages";

export interface ComicShelf {
  publicationUri: string;
  issues: Array<ComicShelfIssue>;
  totalPages: number;
  /** See {@link ComicShelfMode} — what one entry on this shelf stands for. */
  mode: ComicShelfMode;
}

/** One shelf entry under construction, before its cover art is looked up. */
export type ComicShelfGroup = {
  issueNumber: number | null;
  pages: Array<{ issue: ComicIssue; isCover: boolean }>;
};

/**
 * Collapse a spine into shelf entries, one per issue number.
 *
 * A page whose title doesn't parse joins the issue it sits inside rather than
 * splitting it — an interstitial with an odd title is still part of that issue.
 */
function groupSpineByIssue(issues: Array<ComicIssue>): Array<ComicShelfGroup> {
  const groups: Array<ComicShelfGroup> = [];
  for (const issue of issues) {
    const parsed = parseComicIssueTitle(issue.title);
    const last = groups.at(-1);
    const sameIssue =
      last != null &&
      (parsed == null || last.issueNumber === parsed.issueNumber);
    const entry = {
      issue,
      isCover: parsed != null && isCoverPageLabel(parsed.pageLabel),
    };
    if (sameIssue) last.pages.push(entry);
    else
      groups.push({ issueNumber: parsed?.issueNumber ?? null, pages: [entry] });
  }
  return groups;
}

/**
 * Decide what one cover on this shelf stands for, and lay the entries out.
 *
 * Issue-numbered titles collapse into one entry per issue; anything else keeps
 * a card per post, since there is no structure to collapse and grouping on a bad
 * parse would invent one.
 *
 * Pure and separate from {@link selectComicShelf} so the decision can be checked
 * without a database — it is the whole difference between a shelf of issues and
 * a grid of pages.
 */
export function planComicShelf(issues: Array<ComicIssue>): {
  mode: ComicShelfMode;
  groups: Array<ComicShelfGroup>;
} {
  if (titlesLookLikeIssues(issues.map((issue) => issue.title))) {
    return { mode: "issues", groups: groupSpineByIssue(issues) };
  }
  return {
    mode: "pages",
    groups: issues.map((issue) => ({
      issueNumber: null,
      pages: [{ issue, isCover: false }],
    })),
  };
}

/**
 * A comic as a shelf of covers.
 *
 * A comic posts one page per document, so its archive is dozens of near-identical
 * rows — `FITV #1 Cover`, `FITV #1, Pg. 1`, `FITV #1, Pg. 2` — when the thing a
 * reader browses is art. The shelf shows the art instead of the titles.
 *
 * How much art fits on one card depends on the titles. When they carry issue
 * numbers — which lives only in the title, since the lexicon has no field for it
 * — they are parsed back out (`#/lib/comic/issue-title`) and consecutive pages
 * sharing a number collapse into one cover per issue (`mode: "issues"`). When
 * they don't, the pages can't be collapsed and each post keeps its own cover
 * (`mode: "pages"`): a comic that names its posts `Pg01`, `Pg02` is not broken,
 * and a grid of its pages still reads as a comic where a list of those titles
 * does not.
 *
 * Cost follows the mode, because one body is opened per shelf entry to get its
 * art: a handful of rows for an issue-numbered comic however long it runs, and
 * one row per post for a page-per-card one. The spine already reads every
 * document row for both, and a comic page's body is an image ref and a short
 * note, so this stays a single query either way.
 *
 * With `readForDid`, each entry also carries the pages that reader hasn't opened
 * (`unreadPages`) — the shelf is where a reader picks up a comic, and picking it
 * up means going to the next page they haven't seen, not back to the cover.
 */
export async function selectComicShelf(
  db: Db,
  schema: Schema,
  publicationUri: string,
  opts: {
    /** Reader whose unread pages to report; omit for a shared, reader-agnostic
     * shelf. */
    readForDid?: string;
    /** When false, pages published before the reader subscribed count as read
     * — the same cutoff the archive's unread filter applies. */
    countOldPostsAsUnread?: boolean;
  } = {},
): Promise<ComicShelf> {
  // Independent reads: the unread set is the whole publication's, so it doesn't
  // wait on the spine to know which documents to ask about. Same query the
  // archive's unread filter and "mark all as read" run, so no two surfaces can
  // disagree about what this reader still owes the comic.
  const [spine, unreadUris] = await Promise.all([
    selectComicSpine(db, schema, publicationUri),
    opts.readForDid
      ? selectUnreadDocumentUris(db, schema, {
          readerDid: opts.readForDid,
          publicationUris: [publicationUri],
          countOldPostsAsUnread: opts.countOldPostsAsUnread,
          limit: COMIC_UNREAD_PAGE_LIMIT,
        })
      : Promise.resolve<Array<string>>([]),
  ]);
  const unread = new Set(unreadUris);
  const { mode, groups } = planComicShelf(spine.issues);
  if (groups.length === 0) {
    return { publicationUri, issues: [], totalPages: spine.totalPages, mode };
  }

  // The cover is the page that says it is one; failing that, the issue's first
  // page, which is what a reader sees when they open it anyway.
  const fronts = groups.map(
    (group) => group.pages.find((page) => page.isCover) ?? group.pages[0],
  );
  const frontUris = fronts
    .map((front) => front?.issue.uri)
    .filter((uri): uri is string => uri != null);

  const d = schema.documents;
  const rows =
    frontUris.length === 0
      ? []
      : await db
          .select({
            uri: d.uri,
            did: d.did,
            contentJson: d.contentJson,
            contentFormat: d.contentFormat,
          })
          .from(d)
          .where(inArray(d.uri, frontUris));
  const bodyByUri = new Map(rows.map((row) => [row.uri, row]));

  const issues: Array<ComicShelfIssue> = [];
  for (const [index, group] of groups.entries()) {
    const front = fronts[index];
    const first = group.pages[0];
    if (!front || !first) continue;

    const body = bodyByUri.get(front.issue.uri);
    const coverImageUrl = body
      ? (documentImages({
          did: body.did,
          contentJson: body.contentJson as JsonValue,
          contentFormat: body.contentFormat,
        })[0]?.url ?? null)
      : null;

    issues.push({
      issueNumber: group.issueNumber,
      label:
        group.issueNumber == null ? front.issue.title : `#${group.issueNumber}`,
      uri: front.issue.uri,
      did: front.issue.did,
      rkey: front.issue.rkey,
      coverImageUrl,
      // Open the issue at its first page, not at whichever page carries the
      // cover art — they are usually the same, but not always.
      pageOffset: first.issue.pageOffset,
      pageCount: group.pages.reduce(
        (sum, page) => sum + page.issue.pageCount,
        0,
      ),
      documentCount: group.pages.length,
      publishedAt: first.issue.publishedAt,
      // In reading order, because the group is: the first entry is the page the
      // reader is owed. A page whose document isn't in the unread set — read, or
      // published before this reader subscribed — is simply absent.
      unreadPages: group.pages
        .filter((page) => unread.has(page.issue.uri))
        .map((page) => ({
          uri: page.issue.uri,
          pageOffset: page.issue.pageOffset,
        })),
    });
  }

  return { publicationUri, issues, totalPages: spine.totalPages, mode };
}
