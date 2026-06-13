/**
 * Hydrate Bluesky posts via the public AppView (no auth required).
 */

const PUBLIC_APPVIEW = "https://public.api.bsky.app";
const POSTS_BATCH_SIZE = 25;
const FETCH_TIMEOUT_MS = 8000;

export interface BskyPostAuthor {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatar: string | null;
}

export interface BskyPostView {
  uri: string;
  cid: string;
  author: BskyPostAuthor;
  text: string;
  facets: Array<unknown> | null;
  replyCount: number;
  likeCount: number;
  indexedAt: string;
  /** True when the post is a reply to another post. */
  isReply: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAuthor(value: unknown): BskyPostAuthor | null {
  if (!isRecord(value)) return null;
  const did = value.did;
  if (typeof did !== "string" || !did.startsWith("did:")) return null;
  return {
    did,
    handle: typeof value.handle === "string" ? value.handle : null,
    displayName:
      typeof value.displayName === "string" ? value.displayName : null,
    avatar: typeof value.avatar === "string" ? value.avatar : null,
  };
}

function parsePostView(value: unknown): BskyPostView | null {
  if (!isRecord(value)) return null;
  const uri = value.uri;
  const cid = value.cid;
  if (typeof uri !== "string" || typeof cid !== "string") return null;

  const author = parseAuthor(value.author);
  if (!author) return null;

  const record = isRecord(value.record) ? value.record : null;
  const text = typeof record?.text === "string" ? record.text : "";
  const facets = Array.isArray(record?.facets) ? record.facets : null;

  const reply = isRecord(value.reply) ? value.reply : null;
  const isReply = Boolean(reply?.parent || reply?.root);

  const replyCount =
    typeof value.replyCount === "number" ? value.replyCount : 0;
  const likeCount = typeof value.likeCount === "number" ? value.likeCount : 0;
  const indexedAt = typeof value.indexedAt === "string" ? value.indexedAt : "";

  return {
    uri,
    cid,
    author,
    text,
    facets,
    replyCount,
    likeCount,
    indexedAt,
    isReply,
  };
}

function chunk<T>(items: Array<T>, size: number): Array<Array<T>> {
  const batches: Array<Array<T>> = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

async function fetchPostBatch(
  uris: Array<string>,
): Promise<Array<BskyPostView>> {
  if (uris.length === 0) return [];

  try {
    const url = new URL("/xrpc/app.bsky.feed.getPosts", PUBLIC_APPVIEW);
    for (const uri of uris) {
      url.searchParams.append("uris", uri);
    }

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return [];

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.posts)) return [];

    return payload.posts
      .map((post) => parsePostView(post))
      .filter((post): post is BskyPostView => post != null);
  } catch {
    return [];
  }
}

/** Fetch post views for the given AT-URIs (batched, max 25 per request). */
export async function getPosts(
  uris: Array<string>,
): Promise<Array<BskyPostView>> {
  const unique = [...new Set(uris.filter((uri) => uri.startsWith("at://")))];
  if (unique.length === 0) return [];

  const batches = chunk(unique, POSTS_BATCH_SIZE);
  const results = await Promise.all(
    batches.map((batch) => fetchPostBatch(batch)),
  );
  return results.flat();
}

function parseThreadViewPost(value: unknown): BskyPostView | null {
  if (!isRecord(value)) return null;
  if (value.$type !== "app.bsky.feed.defs#threadViewPost") return null;
  return parsePostView(value.post);
}

async function fetchPostThread(
  uri: string,
  depth: number,
): Promise<Array<BskyPostView>> {
  if (!uri.startsWith("at://")) return [];

  try {
    const url = new URL("/xrpc/app.bsky.feed.getPostThread", PUBLIC_APPVIEW);
    url.searchParams.set("uri", uri);
    url.searchParams.set("depth", String(depth));
    url.searchParams.set("parentHeight", "0");

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return [];

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !isRecord(payload.thread)) return [];

    const replies = payload.thread.replies;
    if (!Array.isArray(replies)) return [];

    return replies
      .map((reply) => parseThreadViewPost(reply))
      .filter((post): post is BskyPostView => post != null);
  } catch {
    return [];
  }
}

/** Direct replies to a post (depth 1), best-effort via public AppView. */
export async function getDirectRepliesToPost(
  postUri: string,
): Promise<Array<BskyPostView>> {
  return fetchPostThread(postUri, 1);
}

const AUTHOR_FEED_PAGE_SIZE = 100;
const AUTHOR_FEED_MAX_PAGES = 40;
const ANNOUNCEMENT_WINDOW_BEFORE_MS = 14 * 24 * 60 * 60 * 1000;
const ANNOUNCEMENT_WINDOW_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_INFERRED_ANNOUNCEMENT_REPLIES = 5;

function normalizeLinkTarget(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    parsed.search = "";
    let path = parsed.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    parsed.pathname = path;
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function postRecordLinksTarget(
  record: Record<string, unknown>,
  targetUrls: ReadonlySet<string>,
): boolean {
  const normalizedTargets = new Set(
    [...targetUrls].map((url) => normalizeLinkTarget(url)),
  );

  const facets = record.facets;
  if (Array.isArray(facets)) {
    for (const facet of facets) {
      if (!isRecord(facet)) continue;
      const features = facet.features;
      if (!Array.isArray(features)) continue;
      for (const feature of features) {
        if (!isRecord(feature)) continue;
        const uri = feature.uri;
        if (
          typeof uri === "string" &&
          normalizedTargets.has(normalizeLinkTarget(uri))
        ) {
          return true;
        }
      }
    }
  }

  const embed = record.embed;
  if (isRecord(embed)) {
    const external = embed.external;
    if (isRecord(external)) {
      const uri = external.uri;
      if (
        typeof uri === "string" &&
        normalizedTargets.has(normalizeLinkTarget(uri))
      ) {
        return true;
      }
    }
  }

  return false;
}

interface AuthorFeedPostCandidate {
  uri: string;
  replyCount: number;
  linksTarget: boolean;
  createdAt: number;
}

interface AuthorFeedPageResult {
  posts: Array<AuthorFeedPostCandidate>;
  cursor?: string;
}

async function fetchAuthorFeedPage(
  did: string,
  linkTargets: ReadonlySet<string>,
  cursor: string | undefined,
): Promise<AuthorFeedPageResult> {
  try {
    const url = new URL("/xrpc/app.bsky.feed.getAuthorFeed", PUBLIC_APPVIEW);
    url.searchParams.set("actor", did);
    url.searchParams.set("limit", String(AUTHOR_FEED_PAGE_SIZE));
    url.searchParams.set("filter", "posts_no_replies");
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return { posts: [] };

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.feed)) {
      return { posts: [] };
    }

    const posts: Array<AuthorFeedPostCandidate> = [];
    for (const item of payload.feed) {
      if (!isRecord(item) || !isRecord(item.post)) continue;
      const postView = parsePostView(item.post);
      if (!postView || postView.author.did !== did || postView.isReply)
        continue;

      const record = isRecord(item.post.record) ? item.post.record : null;
      const createdAtRaw =
        typeof record?.createdAt === "string" ? record.createdAt : "";
      const createdAt = Date.parse(createdAtRaw);
      if (!Number.isFinite(createdAt)) continue;

      posts.push({
        uri: postView.uri,
        replyCount: postView.replyCount,
        linksTarget: record
          ? postRecordLinksTarget(record, linkTargets)
          : false,
        createdAt,
      });
    }

    const nextCursor =
      typeof payload.cursor === "string" ? payload.cursor : undefined;
    return { posts, cursor: nextCursor };
  } catch {
    return { posts: [] };
  }
}

/**
 * When a document has no `bskyPostRef`, infer the author's announcement post
 * by scanning their top-level feed around `publishedAt`. Prefer posts that link
 * the article URL; otherwise pick the highest-reply post in the window.
 */
export async function inferAuthorAnnouncementPostUri(
  did: string,
  publishedAt: Date,
  linkTargets: Array<string>,
): Promise<string | null> {
  if (!did.startsWith("did:") || linkTargets.length === 0) return null;

  const normalizedTargets = new Set(linkTargets.filter(Boolean));
  if (normalizedTargets.size === 0) return null;

  const windowStart = publishedAt.getTime() - ANNOUNCEMENT_WINDOW_BEFORE_MS;
  const windowEnd = publishedAt.getTime() + ANNOUNCEMENT_WINDOW_AFTER_MS;

  let urlLinkedBest: AuthorFeedPostCandidate | null = null;
  let replyBest: AuthorFeedPostCandidate | null = null;
  let cursor: string | undefined;
  let reachedWindowStart = false;

  for (
    let page = 0;
    page < AUTHOR_FEED_MAX_PAGES && !reachedWindowStart;
    page++
  ) {
    const feedPage = await fetchAuthorFeedPage(did, normalizedTargets, cursor);
    if (feedPage.posts.length === 0) break;

    for (const candidate of feedPage.posts) {
      if (candidate.createdAt < windowStart) {
        reachedWindowStart = true;
        continue;
      }
      if (candidate.createdAt > windowEnd) continue;

      if (
        candidate.linksTarget &&
        (!urlLinkedBest || candidate.replyCount > urlLinkedBest.replyCount)
      ) {
        urlLinkedBest = candidate;
      }

      if (
        candidate.replyCount >= MIN_INFERRED_ANNOUNCEMENT_REPLIES &&
        (!replyBest || candidate.replyCount > replyBest.replyCount)
      ) {
        replyBest = candidate;
      }
    }

    cursor = feedPage.cursor;
    if (!cursor) break;
  }

  return urlLinkedBest?.uri ?? replyBest?.uri ?? null;
}
