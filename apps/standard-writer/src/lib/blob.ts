/**
 * Bluesky CDN base for AT Protocol blobs. The bsky AppView CDN serves a blob
 * from `(did, cid)` directly, with no PDS round trip — the same source Standard
 * Reader uses (`apps/standard-reader/src/server/atproto/blob.ts`).
 */
const BSKY_CDN_BASE = "https://cdn.bsky.app/img";

/**
 * URL for a publication's `icon` blob, or null when it has none.
 *
 * `avatar` is the right CDN variant for a square publication logo: it is
 * served pre-cropped and small, which is all these avatars ever render at.
 */
export function publicationIconUrl(
  did: string | null | undefined,
  cid: string | null | undefined,
): string | null {
  if (!did || !cid) return null;
  return `${BSKY_CDN_BASE}/avatar/plain/${encodeURIComponent(did)}/${encodeURIComponent(cid)}@jpeg`;
}
