/**
 * Leaflet comments (`pub.leaflet.comment`) surfaced in a document's Discussion.
 *
 * Read-only and microcosm-only, mirroring `#/server/pckt/notes`: Constellation
 * discovers comments whose `.subject` is the document, Slingshot hydrates each
 * record. Nothing is persisted and no author PDS is ever contacted.
 *
 * Only top-level comments are listed — `DocumentComment` has no way to express
 * a thread — but replies are still hydrated so each top-level comment can
 * report an accurate `replyCount`, matching how Bluesky comments behave.
 */

import { fetchBlueskyPublicProfileFields } from "#/lib/bluesky-public-profile";
import {
  LEAFLET_COMMENT_COLLECTION,
  extractLeafletQuoteText,
  leafletCommentDrawerUrl,
  normalizeLeafletComment,
} from "#/lib/leaflet/comment";
import type { LeafletComment } from "#/lib/leaflet/comment";
import type { ConstellationBacklinkRecord } from "#/server/atproto/constellation";
import { getLeafletCommentBacklinksForDocument } from "#/server/atproto/constellation";
import { fetchRepoRecordWithFallback } from "#/server/atproto/fetch-record";
import { resolveIdentity } from "#/server/atproto/identity";
import type {
  DocumentComment,
  DocumentCommentAuthor,
} from "#/server/reader/document-comments";

const COMMENT_CACHE_TTL_MS = 5 * 60 * 1000;

const leafletCommentsCache = new Map<
  string,
  { expiresAt: number; comments: Array<DocumentComment> }
>();

function commentUriFromRecord(record: ConstellationBacklinkRecord): string {
  return `at://${record.did}/${record.collection}/${record.rkey}`;
}

async function hydrateComment(
  record: ConstellationBacklinkRecord,
): Promise<LeafletComment | null> {
  const uri = commentUriFromRecord(record);
  // Slingshot only — omit the `pds` arg so no author PDS is contacted.
  const result = await fetchRepoRecordWithFallback(uri);
  if (!result) return null;
  return normalizeLeafletComment(uri, record.did, record.rkey, result.value);
}

async function resolveCommentAuthors(
  dids: Array<string>,
): Promise<Map<string, DocumentCommentAuthor>> {
  const unique = [...new Set(dids)];
  const authors = new Map<string, DocumentCommentAuthor>();

  await Promise.all(
    unique.map(async (did) => {
      const [identity, profile] = await Promise.all([
        resolveIdentity(did),
        fetchBlueskyPublicProfileFields(did),
      ]);
      authors.set(did, {
        did,
        handle: profile?.handle ?? identity.handle,
        displayName: profile?.displayName ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
      });
    }),
  );

  return authors;
}

export interface LeafletCommentContext {
  /** Parsed `pub.leaflet.content` for the document, for quote extraction. */
  content: unknown;
  /** Canonical URL, used to build the Leaflet comment-drawer link. */
  canonicalUrl: string | null;
}

/**
 * Replies per thread root, keyed by the root comment's URI.
 *
 * `reply.parent` points at the immediate parent, which may itself be a reply,
 * so each reply is walked up to its root and counted there — a two-deep thread
 * reports 2 replies on the top-level comment rather than hiding one a level
 * down where nothing renders it. Parents outside this document (or missing
 * because hydration failed) simply don't get counted.
 */
function countRepliesByRoot(
  comments: Array<LeafletComment>,
): Map<string, number> {
  const byUri = new Map(comments.map((comment) => [comment.uri, comment]));
  const counts = new Map<string, number>();

  for (const comment of comments) {
    if (comment.parentUri == null) continue;

    const seen = new Set<string>([comment.uri]);
    let cursor = byUri.get(comment.parentUri);
    while (cursor?.parentUri != null && !seen.has(cursor.uri)) {
      seen.add(cursor.uri);
      cursor = byUri.get(cursor.parentUri);
    }
    if (!cursor || seen.has(cursor.uri)) continue;

    counts.set(cursor.uri, (counts.get(cursor.uri) ?? 0) + 1);
  }

  return counts;
}

function toComment(
  comment: LeafletComment,
  author: DocumentCommentAuthor,
  context: LeafletCommentContext,
  replyCount: number,
): DocumentComment {
  const quoteText = comment.quote
    ? extractLeafletQuoteText(context.content, comment.quote)
    : null;

  return {
    source: "leaflet",
    kind: quoteText ? "quote" : "link",
    postUri: comment.uri,
    postUrl: leafletCommentDrawerUrl(context.canonicalUrl) ?? "",
    author,
    commentary: comment.plaintext,
    commentaryFacets: comment.facets as DocumentComment["commentaryFacets"],
    quote: quoteText,
    replyCount,
    indexedAt: comment.createdAt,
  };
}

/**
 * Top-level Leaflet comments on `documentUri`, mapped to Discussion comments.
 * Best-effort: returns [] on any failure so the section still renders its other
 * sources.
 */
export async function fetchLeafletCommentsForDocument(
  documentUri: string,
  context: LeafletCommentContext,
): Promise<Array<DocumentComment>> {
  if (!documentUri.startsWith("at://")) return [];

  const cached = leafletCommentsCache.get(documentUri);
  if (cached && cached.expiresAt > Date.now()) return cached.comments;

  try {
    const records = await getLeafletCommentBacklinksForDocument(documentUri);
    const hydrated = await Promise.all(
      records.map((record) => hydrateComment(record)),
    );
    const all = hydrated.filter(
      (comment): comment is LeafletComment => comment != null,
    );
    const replyCounts = countRepliesByRoot(all);
    const topLevel = all.filter((comment) => comment.parentUri == null);

    if (topLevel.length === 0) {
      // Only cache "none" when Constellation genuinely reported no records. If
      // it found some but every hydration failed (Slingshot hiccup), caching []
      // would hide real comments for the full TTL — same reasoning as pckt.
      if (records.length === 0) {
        leafletCommentsCache.set(documentUri, {
          comments: [],
          expiresAt: Date.now() + COMMENT_CACHE_TTL_MS,
        });
      }
      return [];
    }

    const authorByDid = await resolveCommentAuthors(
      topLevel.map((comment) => comment.did),
    );

    const comments: Array<DocumentComment> = [];
    for (const comment of topLevel) {
      const author = authorByDid.get(comment.did);
      if (!author) continue;
      comments.push(
        toComment(comment, author, context, replyCounts.get(comment.uri) ?? 0),
      );
    }

    leafletCommentsCache.set(documentUri, {
      comments,
      expiresAt: Date.now() + COMMENT_CACHE_TTL_MS,
    });
    return comments;
  } catch {
    return cached?.comments ?? [];
  }
}

/**
 * Count of Leaflet comments on `documentUri`. Counts every backlink, including
 * replies, since filtering to top-level would require hydrating each record.
 */
export async function countLeafletCommentsForDocument(
  documentUri: string,
): Promise<number> {
  if (!documentUri.startsWith("at://")) return 0;
  const cached = leafletCommentsCache.get(documentUri);
  if (cached && cached.expiresAt > Date.now()) return cached.comments.length;
  try {
    const records = await getLeafletCommentBacklinksForDocument(documentUri);
    return records.filter(
      (record) => record.collection === LEAFLET_COMMENT_COLLECTION,
    ).length;
  } catch {
    return cached?.comments.length ?? 0;
  }
}
