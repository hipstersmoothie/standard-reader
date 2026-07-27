export interface BskyPostRef {
  did: string;
  id: string;
}

function parsePostAtUri(uri: string): BskyPostRef | null {
  if (!uri.startsWith("at://")) return null;
  const rest = uri.slice("at://".length);
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  const did = rest.slice(0, slash);
  const after = rest.slice(slash + 1);
  const nextSlash = after.indexOf("/");
  if (nextSlash === -1) return null;
  const collection = after.slice(0, nextSlash);
  const id = after.slice(nextSlash + 1);
  if (collection !== "app.bsky.feed.post" || !did.startsWith("did:") || !id) {
    return null;
  }
  return { did, id };
}

/** Parse `app.bsky.feed.post` AT-URI into DID + record key. */
export function parseBskyPostRef(uri: string): BskyPostRef | null {
  return parsePostAtUri(uri);
}

/** Build a Bluesky web URL from an `app.bsky.feed.post` AT-URI. */
export function bskyPostUrl(
  uri: string,
  clientHost = "bsky.app",
): string | null {
  const ref = parsePostAtUri(uri);
  if (!ref) return null;
  const host = clientHost.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${host}/profile/${ref.did}/post/${ref.id}`;
}

/** Local API route used by `bsky-react-post` (returns `{ data: thread }`). */
export function bskyPostApiUrl(did: string, id: string): string {
  const params = new URLSearchParams({ did, id });
  return `/api/bsky/post?${params}`;
}
