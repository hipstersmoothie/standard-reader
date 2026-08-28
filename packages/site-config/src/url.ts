/**
 * Where a standalone site lives.
 *
 * The paths mirror the in-app `/u/$did` and `/p/$did/$rkey` routes one segment
 * deeper, so a site URL is derivable from a profile URL and vice versa — which
 * is what lets the two link to each other without either side carrying a
 * stored URL.
 */

/**
 * Encode a path segment, but leave `:` alone — the same rule the OPDS catalog
 * URLs follow, and for the same reason. A site URL is made to be copied,
 * pasted, and pasted again; anything that re-encodes the string it was handed
 * turns `%3A` into `%253A`, and the DID that arrives no longer starts with
 * `did:`. RFC 3986 allows a colon in a path segment, so there is nothing here
 * left to re-encode. Everything else is still encoded, so a hostile rkey cannot
 * escape its segment.
 */
function segment(value: string): string {
  return encodeURIComponent(value).replaceAll("%3A", ":");
}

export function authorSitePath(did: string): string {
  return `/site/u/${segment(did)}`;
}

export function publicationSitePath(did: string, rkey: string): string {
  return `/site/p/${segment(did)}/${segment(rkey)}`;
}

export function authorSiteUrl(baseUrl: string, did: string): string {
  return `${baseUrl.replace(/\/$/, "")}${authorSitePath(did)}`;
}

export function publicationSiteUrl(
  baseUrl: string,
  did: string,
  rkey: string,
): string {
  return `${baseUrl.replace(/\/$/, "")}${publicationSitePath(did, rkey)}`;
}
