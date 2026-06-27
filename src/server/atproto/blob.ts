import type { BlobRef } from "./types.ts";

/**
 * Pull the CID string out of a blob ref. Handles all four shapes a `ref` can
 * take depending on how the record was decoded:
 * - a bare CID string,
 * - a `{$link: cid}` object (plain dag-json),
 * - a `{"/": cid}` object (dag-json link form — what `content_json` rows
 *   round-tripped through Postgres jsonb contain),
 * - a multiformats `CID` instance (after `@atproto/lex` `lexParse`, which is the
 *   tap channel path) — these have no `$link`, so we stringify them.
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
  // CID instance: `.toString()` yields the canonical CID; guard against plain
  // objects whose default `toString` returns "[object Object]".
  if (typeof ref.toString === "function") {
    const cid = ref.toString();
    if (cid && cid !== "[object Object]") {
      return cid;
    }
  }
  return null;
}

/**
 * Build a `com.atproto.sync.getBlob` URL for a blob stored on an author's PDS.
 * Used for server-side blob fetches (e.g. resolving fetch-backed content, or
 * the profile avatar path during ingest). Requires the owning repo's PDS
 * endpoint (resolved via the identity layer).
 *
 * Note: this URL is **not** ideal for browser `<img src>`. PDS servers serve
 * blobs with `Cache-Control: private` and `Content-Disposition: attachment`,
 * which prevents both CDN caching and inline image display. For any URL that
 * will be handed to the browser, call {@link cdnImageUrl} directly with the
 * owning repo's DID + the blob CID.
 */
export function getBlobUrl(pds: string, did: string, cid: string): string {
  const base = pds.replace(/\/+$/, "");
  return `${base}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
    did,
  )}&cid=${encodeURIComponent(cid)}`;
}

/** The Bluesky CDN base. It serves *any* PDS blob by (did, cid), not just
 *  Bluesky app blobs — so it works for standard.site icons/covers too. */
const BSKY_CDN_BASE = "https://cdn.bsky.app/img";

/**
 * Build a Bluesky CDN image URL for a PDS blob. The CDN transcodes to the
 * requested format (`@jpeg` for photos, `@png` when alpha must be preserved)
 * and serves with `Cache-Control: public, max-age=604800` + inline
 * disposition — far better for browser `<img src>` than the raw PDS getBlob
 * URL (which is private/attachment).
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

export type BskyImageKind = "avatar" | "banner";

/**
 * Build a Bluesky CDN image URL for a profile avatar/banner blob. The bsky
 * AppView CDN can serve these directly from (did, cid) without a PDS lookup.
 */
export function bskyImageUrl(
  kind: BskyImageKind,
  did: string,
  cid: string,
): string {
  return `https://cdn.bsky.app/img/${kind}/plain/${did}/${cid}@jpeg`;
}
