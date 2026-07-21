/**
 * Vendored, dependency-free copy of the app's blob helpers. Standard Reader
 * images are AT-Proto blobs referenced by CID; the Bluesky CDN serves any PDS
 * blob by `(did, cid)`, so these two helpers are all the renderer needs to turn
 * a blob ref into an `<img src>`.
 */

/** A blob ref as it appears in a decoded record. */
export interface BlobRef {
  ref?:
    | string
    | { $link?: string; ["/"]?: string; toString?: () => string }
    | null;
  mimeType?: string;
  size?: number;
}

/**
 * Pull the CID string out of a blob ref. Handles the shapes a `ref` can take
 * depending on how the record was decoded: a bare CID string, a `{$link: cid}`
 * object (plain dag-json), a `{"/": cid}` object (dag-json link form), or a
 * multiformats `CID` instance (stringified).
 */
export function blobCid(blob: BlobRef | undefined | null): string | null {
  if (!blob || !blob.ref) {
    return null;
  }
  const ref = blob.ref;
  if (typeof ref === "string") {
    return ref;
  }
  if (typeof ref.$link === "string") {
    return ref.$link;
  }
  const slashLink = (ref as Record<string, unknown>)["/"];
  if (typeof slashLink === "string") {
    return slashLink;
  }
  if (typeof ref.toString === "function") {
    const cid = ref.toString();
    if (cid && cid !== "[object Object]") {
      return cid;
    }
  }
  return null;
}

/** The Bluesky CDN base. It serves *any* PDS blob by `(did, cid)`. */
const BSKY_CDN_BASE = "https://cdn.bsky.app/img";

/**
 * Build a Bluesky CDN image URL for a PDS blob. The CDN transcodes to the
 * requested format (`@jpeg` for photos, `@png` when alpha must be preserved)
 * and serves it with long cache headers + inline disposition — suitable for a
 * browser `<img src>`.
 */
export function cdnImageUrl(
  did: string,
  cid: string,
  format: "jpeg" | "png" = "jpeg",
): string {
  return `${BSKY_CDN_BASE}/feed_fullsize/plain/${encodeURIComponent(
    did,
  )}/${encodeURIComponent(cid)}@${format}`;
}
