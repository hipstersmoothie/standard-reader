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
