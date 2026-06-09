import type { db } from "#/db/index.server";
import type * as schema from "#/db/schema";
import type {
  ArticleCard,
  JsonValue,
} from "#/integrations/tanstack-query/api-shapes";
import type { BskyPostView } from "#/server/atproto/bsky-posts";

import { bskyPostUrl } from "#/lib/leaflet/bsky";
import { shiftFacets } from "#/lib/leaflet/facets";
import { utf8ByteLength } from "#/lib/leaflet/utf8";
import { getPublicUrl } from "#/lib/public-url";
import {
  articleSharePath,
  buildQuoteShareUrl,
  normalizeQuoteText,
} from "#/lib/quote-share";
import { getDirectRepliesToPost, getPosts } from "#/server/atproto/bsky-posts";
import {
  getBacklinkCountForTarget,
  getPostBacklinksForTarget,
} from "#/server/atproto/constellation";
import { buildCanonicalUrl } from "#/server/ingest/mappers";
import { listQuoteSharesForDocument } from "#/server/reader/quote-shares";
import { eq } from "drizzle-orm";

export interface DocumentCommentAuthor {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface DocumentComment {
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

const COMMENT_COUNT_TTL_MS = 5 * 60 * 1000;
const commentCountCache = new Map<
  string,
  { count: number; expiresAt: number }
>();

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

async function countConstellationBacklinksForTargets(
  targets: Array<CommentTarget>,
): Promise<number> {
  if (targets.length === 0) return 0;

  const counts = await Promise.all(
    targets.map((target) => getBacklinkCountForTarget(target.url)),
  );
  return counts.reduce((sum, count) => sum + count, 0);
}

async function countAuthorPostReplies(
  bskyPostUri: string | null,
): Promise<number> {
  if (!bskyPostUri?.startsWith("at://")) return 0;
  const replies = await getDirectRepliesToPost(bskyPostUri);
  return replies.length;
}

async function loadDocumentCommentTargets(
  dbClient: typeof db,
  schemaModule: typeof schema,
  documentUri: string,
): Promise<{
  targets: Array<CommentTarget>;
  stripUrls: Array<string>;
  bskyPostUri: string | null;
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
    })
    .from(d)
    .leftJoin(p, eq(d.publicationUri, p.uri))
    .where(eq(d.uri, documentUri))
    .limit(1);

  const doc = rows[0];
  if (!doc) return null;

  const canonicalUrl =
    doc.canonicalUrl ?? buildCanonicalUrl(doc.publicationUrl, doc.path);

  const baseUrl = getPublicUrl();
  const quoteShares = await listQuoteSharesForDocument(documentUri);
  const targets = buildCommentTargets(
    doc.did,
    doc.rkey,
    canonicalUrl,
    quoteShares,
    baseUrl,
  );

  return {
    targets,
    stripUrls: targets.map((t) => t.url),
    bskyPostUri: doc.bskyPostUri,
  };
}

/** Count Bluesky posts linking this document (Constellation counts + author-post replies). */
export async function countDocumentComments(
  dbClient: typeof db,
  schemaModule: typeof schema,
  documentUri: string,
): Promise<number> {
  const cached = commentCountCache.get(documentUri);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.count;
  }

  try {
    const context = await loadDocumentCommentTargets(
      dbClient,
      schemaModule,
      documentUri,
    );
    if (!context) {
      commentCountCache.set(documentUri, {
        count: 0,
        expiresAt: Date.now() + COMMENT_COUNT_TTL_MS,
      });
      return 0;
    }

    const [backlinkCount, replyCount] = await Promise.all([
      countConstellationBacklinksForTargets(context.targets),
      countAuthorPostReplies(context.bskyPostUri),
    ]);
    const count = backlinkCount + replyCount;
    commentCountCache.set(documentUri, {
      count,
      expiresAt: Date.now() + COMMENT_COUNT_TTL_MS,
    });
    return count;
  } catch {
    return cached?.count ?? 0;
  }
}

/** Attach `commentCount` to article cards (dedupes URIs, uses count cache). */
export async function attachCommentCountsToArticles<
  T extends Pick<ArticleCard, "uri">,
>(
  dbClient: typeof db,
  schemaModule: typeof schema,
  articles: Array<T>,
): Promise<Array<T & { commentCount: number }>> {
  if (articles.length === 0) return [];

  const uniqueUris = [...new Set(articles.map((article) => article.uri))];
  const counts = await Promise.all(
    uniqueUris.map(async (uri) =>
      countDocumentComments(dbClient, schemaModule, uri),
    ),
  );
  const countByUri = new Map(
    uniqueUris.map((uri, index) => [uri, counts[index] ?? 0]),
  );

  return articles.map((article) => ({
    ...article,
    commentCount: countByUri.get(article.uri) ?? 0,
  }));
}

export async function fetchDocumentComments(
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

  const { targets, stripUrls, bskyPostUri } = context;
  const discovery = await discoverDocumentComments(targets, bskyPostUri);

  if (discovery.postMeta.size === 0) return [];

  const posts = await getPosts([...discovery.postMeta.keys()]);
  const comments: Array<DocumentComment> = [];

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

  return comments.toSorted(
    (a, b) => new Date(a.indexedAt).getTime() - new Date(b.indexedAt).getTime(),
  );
}
