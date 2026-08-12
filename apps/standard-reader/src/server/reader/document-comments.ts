import { eq } from "drizzle-orm";

import type { db } from "#/db/index.server";
import type * as schema from "#/db/schema";
import type {
  ArticleCard,
  JsonValue,
} from "#/integrations/tanstack-query/api-shapes";
import { bskyPostUrl } from "#/lib/leaflet/bsky";
import { shiftFacets } from "#/lib/leaflet/facets";
import { utf8ByteLength } from "#/lib/leaflet/utf8";
import { getCanonicalPublicUrl } from "#/lib/public-url";
import {
  articleSharePath,
  buildQuoteShareUrl,
  normalizeQuoteText,
} from "#/lib/quote-share";
import type { BskyPostView } from "#/server/atproto/bsky-posts";
import {
  getDirectRepliesToPost,
  getPosts,
  inferAuthorAnnouncementPostUri,
} from "#/server/atproto/bsky-posts";
import { getPostBacklinksForTarget } from "#/server/atproto/constellation";
import { fetchMarginNotesForUrls } from "#/server/atproto/margin-notes";
import { blockedDidsAmong } from "#/server/blocks/blocks";
import { buildCanonicalUrl } from "#/server/ingest/mappers";
import type { LeafletCommentContext } from "#/server/leaflet/comments";
import { fetchLeafletCommentsForDocument } from "#/server/leaflet/comments";
import { fetchNotesForDocument } from "#/server/pckt/notes";
import { listQuoteSharesForDocument } from "#/server/reader/quote-shares";

export interface DocumentCommentAuthor {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface DocumentComment {
  source: "bluesky" | "margin" | "semble" | "note" | "leaflet";
  kind: "link" | "quote";
  postUri: string;
  postUrl: string;
  author: DocumentCommentAuthor;
  commentary: string;
  commentaryFacets: Array<JsonValue> | null;
  quote: string | null;
  replyCount: number;
  indexedAt: string;
}

interface CommentTarget {
  url: string;
  kind: "link" | "quote";
  quoteText: string | null;
}

interface PostLinkMeta {
  kind: "link" | "quote";
  quoteText: string | null;
}

interface CommentDiscovery {
  postMeta: Map<string, PostLinkMeta>;
  /** Direct replies to the document's author announcement post. */
  authorPostReplyUris: Set<string>;
  bskyPostUri: string | null;
}

function postUriFromRecord(did: string, rkey: string): string {
  return `at://${did}/app.bsky.feed.post/${rkey}`;
}

function stripTrailingUrls(text: string, urls: Array<string>): string {
  let result = text.trimEnd();
  const candidates = urls.filter(Boolean);

  for (const url of candidates) {
    const withBreak = `\n\n${url}`;
    if (result.endsWith(withBreak)) {
      result = result.slice(0, -withBreak.length).trimEnd();
      continue;
    }
    if (result.endsWith(url)) {
      result = result.slice(0, -url.length).trimEnd();
    }
  }

  return result.trim();
}

function stripAutoQuotePrefix(text: string, quoteText: string): string {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('"')) return text.trim();

  const normalized = normalizeQuoteText(quoteText);
  const fullPrefix = `"${normalized}"`;
  if (trimmed.startsWith(fullPrefix)) {
    return trimmed
      .slice(fullPrefix.length)
      .replace(/^\s*\n+/, "")
      .trim();
  }

  const truncatedMatch = trimmed.match(/^"([^"]*(?:…|\u2026)?)"\s*\n*/u);
  if (truncatedMatch) {
    return trimmed.slice(truncatedMatch[0].length).trim();
  }

  return text.trim();
}

function adjustFacetsForSlice(
  originalText: string,
  facets: Array<unknown> | null,
  sliceStart: number,
  sliceEnd: number,
): Array<JsonValue> | null {
  if (!facets?.length || sliceStart >= sliceEnd) return null;

  const prefixBytes = utf8ByteLength(originalText.slice(0, sliceStart));
  const maxBytes = utf8ByteLength(originalText.slice(0, sliceEnd));

  const shifted = shiftFacets(facets, prefixBytes);
  const trimmed = shifted.filter(
    (facet) =>
      facet.index.byteStart < maxBytes &&
      facet.index.byteEnd <= maxBytes &&
      facet.index.byteEnd > facet.index.byteStart,
  );

  return trimmed.length > 0 ? (trimmed as unknown as Array<JsonValue>) : null;
}

function deriveCommentary(
  text: string,
  facets: Array<unknown> | null,
  meta: PostLinkMeta,
  stripUrls: Array<string>,
): { commentary: string; commentaryFacets: Array<JsonValue> | null } {
  let working = text;
  if (meta.kind === "quote" && meta.quoteText) {
    working = stripAutoQuotePrefix(working, meta.quoteText);
  }
  working = stripTrailingUrls(working, stripUrls);

  const startIdx = text.indexOf(working);
  if (startIdx === -1) {
    return {
      commentary: working,
      commentaryFacets: facets as Array<JsonValue> | null,
    };
  }

  const endIdx = startIdx + working.length;
  return {
    commentary: working,
    commentaryFacets: adjustFacetsForSlice(text, facets, startIdx, endIdx),
  };
}

function toCommentAuthor(post: BskyPostView): DocumentCommentAuthor {
  return {
    did: post.author.did,
    handle: post.author.handle,
    displayName: post.author.displayName,
    avatarUrl: post.author.avatar,
  };
}

function buildCommentTargets(
  did: string,
  rkey: string,
  canonicalUrl: string | null,
  quoteShares: Array<{ id: string; quoteText: string }>,
  baseUrl: string,
): Array<CommentTarget> {
  const targets: Array<CommentTarget> = [];
  const seen = new Set<string>();

  const add = (
    url: string,
    kind: "link" | "quote",
    quoteText: string | null,
  ) => {
    const normalized = url.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    targets.push({ url: normalized, kind, quoteText });
  };

  const appArticleUrl = new URL(
    articleSharePath(did, rkey),
    baseUrl,
  ).toString();
  add(appArticleUrl, "link", null);

  if (canonicalUrl) {
    add(canonicalUrl, "link", null);
  }

  for (const share of quoteShares) {
    add(
      buildQuoteShareUrl(did, rkey, share.id, baseUrl),
      "quote",
      share.quoteText,
    );
  }

  return targets;
}

const COMMENTS_CACHE_TTL_MS = 5 * 60 * 1000;
const COMMENTS_CACHE_MAX_ENTRIES = 500;
const COUNT_CACHE_MAX_ENTRIES = 5000;

interface CommentsCacheEntry {
  comments: Array<DocumentComment>;
  expiresAt: number;
}

/** Built Discussion items, shared by the rendered list and the badge count. */
const commentsCache = new Map<string, CommentsCacheEntry>();
const commentsInflight = new Map<string, Promise<Array<DocumentComment>>>();
/**
 * Last known item count per document. Outlives {@link commentsCache} so a badge
 * whose comment payload was evicted still shows its last real number instead of
 * dropping back to 0.
 */
const commentCountCache = new Map<string, number>();

interface InferredBskyPostCacheEntry {
  uri: string | null;
  updatedAt: number;
}

const inferredBskyPostCache = new Map<string, InferredBskyPostCacheEntry>();
const inferredBskyPostInflight = new Map<string, Promise<string | null>>();
const INFERRED_BSKY_POST_CACHE_TTL_MS = 60 * 60 * 1000;
const INFERRED_BSKY_POST_CACHE_MAX_ENTRIES = 5000;

/** Insert into an insertion-ordered cache, evicting the oldest entries. */
function setCapped<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  max: number,
): void {
  cache.delete(key);
  cache.set(key, value);
  for (const oldest of cache.keys()) {
    if (cache.size <= max) break;
    cache.delete(oldest);
  }
}

function peekCommentCount(documentUri: string): number {
  return commentCountCache.get(documentUri) ?? 0;
}

/**
 * Build (or reuse) the Discussion items for a document.
 *
 * The badge count is `items.length` from this same list — deriving it from
 * separate per-source count endpoints let the two drift apart: the count summed
 * every Constellation link path and every link target without deduping, counted
 * the author's own announcement post and hydration failures, and counted
 * records the list filters out (off-thread replies, non-discussion margin
 * motivations, Leaflet replies folded into a parent's `replyCount`).
 *
 * `"fresh"` always rebuilds — a reader looking at the thread should see new
 * replies now, not on the cache's schedule. `"cached"` reuses a build inside its
 * TTL, which is what keeps a feed of badges from rebuilding every document on
 * every request. Either way the result is written back, so the section a reader
 * opens is also what refreshes that article's badge. An in-flight build is
 * shared by both modes: joining a build that started microseconds ago is not
 * staleness, and it stops a page that renders the section and the badge from
 * building the same list twice.
 */
function loadDocumentComments(
  dbClient: typeof db,
  schemaModule: typeof schema,
  documentUri: string,
  mode: "cached" | "fresh",
): Promise<Array<DocumentComment>> {
  if (mode === "cached") {
    const cached = commentsCache.get(documentUri);
    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.comments);
    }
  }

  const inflight = commentsInflight.get(documentUri);
  if (inflight) return inflight;

  const promise = buildDocumentComments(dbClient, schemaModule, documentUri)
    .then((comments) => {
      setCapped(
        commentsCache,
        documentUri,
        { comments, expiresAt: Date.now() + COMMENTS_CACHE_TTL_MS },
        COMMENTS_CACHE_MAX_ENTRIES,
      );
      setCapped(
        commentCountCache,
        documentUri,
        comments.length,
        COUNT_CACHE_MAX_ENTRIES,
      );
      return comments;
    })
    .finally(() => {
      commentsInflight.delete(documentUri);
    });

  commentsInflight.set(documentUri, promise);
  return promise;
}

function scheduleCommentCountRevalidation(
  dbClient: typeof db,
  schemaModule: typeof schema,
  documentUri: string,
): void {
  void loadDocumentComments(
    dbClient,
    schemaModule,
    documentUri,
    "cached",
  ).catch(() => {
    // Best-effort background refresh; keep serving the last cached count.
  });
}

async function discoverCommentPostMeta(
  targets: Array<CommentTarget>,
): Promise<Map<string, PostLinkMeta>> {
  if (targets.length === 0) return new Map();

  const backlinkResults = await Promise.all(
    targets.map(async (target) => ({
      target,
      records: await getPostBacklinksForTarget(target.url),
    })),
  );

  const postMeta = new Map<string, PostLinkMeta>();

  for (const { target, records } of backlinkResults) {
    for (const record of records) {
      const uri = postUriFromRecord(record.did, record.rkey);
      const existing = postMeta.get(uri);
      if (!existing) {
        postMeta.set(uri, { kind: target.kind, quoteText: target.quoteText });
        continue;
      }
      if (existing.kind === "link" && target.kind === "quote") {
        postMeta.set(uri, { kind: "quote", quoteText: target.quoteText });
      }
    }
  }

  return postMeta;
}

function isDocumentCommentPost(
  post: BskyPostView,
  discovery: CommentDiscovery,
): boolean {
  if (discovery.bskyPostUri && post.uri === discovery.bskyPostUri) return false;
  if (discovery.authorPostReplyUris.has(post.uri)) return true;
  return !post.isReply && discovery.postMeta.has(post.uri);
}

async function discoverDocumentComments(
  targets: Array<CommentTarget>,
  bskyPostUri: string | null,
): Promise<CommentDiscovery> {
  const postMeta = await discoverCommentPostMeta(targets);
  const authorPostReplyUris = new Set<string>();

  if (bskyPostUri?.startsWith("at://")) {
    postMeta.delete(bskyPostUri);

    const replies = await getDirectRepliesToPost(bskyPostUri);
    for (const reply of replies) {
      authorPostReplyUris.add(reply.uri);
      if (!postMeta.has(reply.uri)) {
        postMeta.set(reply.uri, { kind: "link", quoteText: null });
      }
    }
  }

  return { postMeta, authorPostReplyUris, bskyPostUri };
}

async function resolveBskyPostUri(
  documentUri: string,
  storedBskyPostUri: string | null,
  did: string,
  publishedAt: Date,
  linkTargets: Array<string>,
): Promise<string | null> {
  if (storedBskyPostUri?.startsWith("at://")) return storedBskyPostUri;

  const cached = inferredBskyPostCache.get(documentUri);
  if (
    cached &&
    Date.now() - cached.updatedAt < INFERRED_BSKY_POST_CACHE_TTL_MS
  ) {
    return cached.uri;
  }

  const inflight = inferredBskyPostInflight.get(documentUri);
  if (inflight) return inflight;

  const promise = inferAuthorAnnouncementPostUri(did, publishedAt, linkTargets)
    .then((uri) => {
      setCapped(
        inferredBskyPostCache,
        documentUri,
        { uri, updatedAt: Date.now() },
        INFERRED_BSKY_POST_CACHE_MAX_ENTRIES,
      );
      return uri;
    })
    .finally(() => {
      inferredBskyPostInflight.delete(documentUri);
    });

  inferredBskyPostInflight.set(documentUri, promise);
  return promise;
}

async function loadDocumentCommentTargets(
  dbClient: typeof db,
  schemaModule: typeof schema,
  documentUri: string,
): Promise<{
  targets: Array<CommentTarget>;
  stripUrls: Array<string>;
  bskyPostUri: string | null;
  leaflet: LeafletCommentContext;
} | null> {
  const d = schemaModule.documents;
  const p = schemaModule.publications;

  const rows = await dbClient
    .select({
      did: d.did,
      rkey: d.rkey,
      path: d.path,
      canonicalUrl: d.canonicalUrl,
      publicationUrl: p.url,
      bskyPostUri: d.bskyPostUri,
      publishedAt: d.publishedAt,
      contentJson: d.contentJson,
      contentFormat: d.contentFormat,
    })
    .from(d)
    .leftJoin(p, eq(d.publicationUri, p.uri))
    .where(eq(d.uri, documentUri))
    .limit(1);

  const doc = rows[0];
  if (!doc) return null;

  const rawCanonicalUrl =
    doc.canonicalUrl ?? buildCanonicalUrl(doc.publicationUrl, doc.path);
  // A canonical URL that's nothing more than the publication's bare root (no
  // path — the case for a collection assembled in-app, which has no page of
  // its own to point `path` at) isn't specific to this document. Constellation
  // backlink lookups are exact-URL, so using it as a comment target would
  // surface every post that links to the publication's site at all — e.g.
  // every post about the publication itself — as this document's Discussion.
  const publicationRoot = doc.publicationUrl?.replace(/\/+$/, "") || null;
  const canonicalUrl =
    rawCanonicalUrl && rawCanonicalUrl !== publicationRoot
      ? rawCanonicalUrl
      : null;

  // Canonical (not per-deployment) origin: posts in the wild embed the prod
  // `standard-reader.app/a/...` URL, so a preview must look that up, not its
  // own railway.app subdomain.
  const baseUrl = getCanonicalPublicUrl();
  const quoteShares = await listQuoteSharesForDocument(documentUri);
  const targets = buildCommentTargets(
    doc.did,
    doc.rkey,
    canonicalUrl,
    quoteShares,
    baseUrl,
  );

  const linkTargets = targets.map((target) => target.url);
  const bskyPostUri = await resolveBskyPostUri(
    documentUri,
    doc.bskyPostUri,
    doc.did,
    doc.publishedAt,
    linkTargets,
  );

  return {
    targets,
    stripUrls: linkTargets,
    bskyPostUri,
    leaflet: {
      content: doc.contentJson,
      canonicalUrl,
      contentFormat: doc.contentFormat,
    },
  };
}

/**
 * Stale-while-revalidate comment total for one document — the item count from
 * the last Discussion build, so the badge stays put between rebuilds instead of
 * changing under the reader mid-scroll. Returns the cached count (0 before the
 * first build) and refreshes in the background once the entry expires.
 */
export async function countDocumentComments(
  dbClient: typeof db,
  schemaModule: typeof schema,
  documentUri: string,
): Promise<number> {
  scheduleCommentCountRevalidation(dbClient, schemaModule, documentUri);
  return peekCommentCount(documentUri);
}

/**
 * Attach cached `commentCount` to article cards without blocking on Constellation.
 * Revalidates expired counts in the background (deduped per URI).
 */
export async function attachCommentCountsToArticles<
  T extends Pick<ArticleCard, "uri">,
>(
  dbClient: typeof db,
  schemaModule: typeof schema,
  articles: Array<T>,
): Promise<Array<T & { commentCount: number }>> {
  if (articles.length === 0) return [];

  const uniqueUris = [...new Set(articles.map((article) => article.uri))];
  for (const uri of uniqueUris) {
    scheduleCommentCountRevalidation(dbClient, schemaModule, uri);
  }

  return articles.map((article) => ({
    ...article,
    commentCount: peekCommentCount(article.uri),
  }));
}

/**
 * The Discussion items for a document, rebuilt on every request so an open
 * thread is never stale. The build also refreshes this document's badge count.
 */
export interface DocumentCommentsResult {
  comments: Array<DocumentComment>;
  /**
   * How many comments this reader's blocks removed.
   *
   * Reported rather than swallowed because the badge count on the card is the
   * cached, unfiltered length (see below), so a thread whose every reply is by a
   * blocked account would otherwise read "6 comments" above the words "No
   * discussion yet" — which looks like the page failing, not like the block
   * working.
   */
  hiddenByBlocks: number;
}

export async function fetchDocumentComments(
  dbClient: typeof db,
  schemaModule: typeof schema,
  documentUri: string,
  /**
   * The reader this discussion is being rendered for. Comments by an account
   * they are blocked from are dropped — a block that hides someone's writing
   * but leaves their replies under it hasn't hidden them.
   */
  viewerDid?: string | null,
): Promise<DocumentCommentsResult> {
  // Filtered *after* the cache, never inside it: the cache is keyed by document
  // alone, so filtering during the build would let the first reader to open a
  // thread decide what every later reader sees. The badge count is the cached
  // (unfiltered) length for the same reason — a per-reader count would need a
  // per-reader cache, and a badge one too high is a smaller wrong than a
  // blocked reply showing up in somebody else's thread.
  const all = await loadDocumentComments(
    dbClient,
    schemaModule,
    documentUri,
    "fresh",
  );
  const comments = await filterBlockedComments(
    dbClient,
    schemaModule,
    viewerDid,
    all,
  );
  return { comments, hiddenByBlocks: all.length - comments.length };
}

async function buildDocumentComments(
  dbClient: typeof db,
  schemaModule: typeof schema,
  documentUri: string,
): Promise<Array<DocumentComment>> {
  const context = await loadDocumentCommentTargets(
    dbClient,
    schemaModule,
    documentUri,
  );
  if (!context) return [];

  const { targets, stripUrls, bskyPostUri, leaflet } = context;
  const linkUrls = targets.map((target) => target.url);

  const [discovery, marginComments, noteComments, leafletComments] =
    await Promise.all([
      discoverDocumentComments(targets, bskyPostUri),
      fetchMarginNotesForUrls(linkUrls),
      fetchNotesForDocument(documentUri),
      fetchLeafletCommentsForDocument(documentUri, leaflet),
    ]);

  const comments: Array<DocumentComment> = [
    ...marginComments,
    ...noteComments,
    ...leafletComments,
  ];

  if (discovery.postMeta.size > 0) {
    const posts = await getPosts([...discovery.postMeta.keys()]);

    for (const post of posts) {
      if (!isDocumentCommentPost(post, discovery)) continue;

      const meta = discovery.postMeta.get(post.uri);
      if (!meta) continue;

      const postUrl = bskyPostUrl(post.uri);
      if (!postUrl) continue;

      const { commentary, commentaryFacets } = deriveCommentary(
        post.text,
        post.facets,
        meta,
        stripUrls,
      );

      comments.push({
        source: "bluesky",
        kind: meta.kind,
        postUri: post.uri,
        postUrl,
        author: toCommentAuthor(post),
        commentary,
        commentaryFacets,
        quote: meta.kind === "quote" ? meta.quoteText : null,
        replyCount: post.replyCount,
        indexedAt: post.indexedAt || new Date().toISOString(),
      });
    }
  }

  return comments.toSorted(
    (a, b) => new Date(a.indexedAt).getTime() - new Date(b.indexedAt).getTime(),
  );
}

/**
 * Drop comments whose author the reader is blocked from.
 *
 * These come from Bluesky, Margin, Semble, pckt and Leaflet rather than our
 * read-model, so there is no query to filter — the authors are resolved and
 * checked after the fact.
 */
async function filterBlockedComments(
  dbClient: typeof db,
  schemaModule: typeof schema,
  viewerDid: string | null | undefined,
  comments: Array<DocumentComment>,
): Promise<Array<DocumentComment>> {
  if (!viewerDid || comments.length === 0) return comments;
  const blocked = await blockedDidsAmong(
    dbClient,
    schemaModule,
    viewerDid,
    comments.map((comment) => comment.author.did),
  );
  return blocked.size === 0
    ? comments
    : comments.filter((comment) => !blocked.has(comment.author.did));
}
