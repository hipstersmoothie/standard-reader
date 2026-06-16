/**
 * "Open collections in magazine" preference — when enabled, collection posts
 * link straight to the magazine edition instead of the reader view.
 *
 * Persisted as `magazine | reader` in the
 * `standard-reader-open-collections-in-magazine` cookie (SSR for everyone).
 * Signed-in users also store it on `user.open_collections_in_magazine`
 * (`null` = unset, uses default; `true` = magazine; `false` = reader).
 */

export const DEFAULT_OPEN_COLLECTIONS_IN_MAGAZINE = true;

export const OPEN_COLLECTIONS_IN_MAGAZINE_COOKIE =
  "standard-reader-open-collections-in-magazine";

export const OPEN_COLLECTIONS_IN_MAGAZINE_COOKIE_MAX_AGE_SECONDS =
  60 * 60 * 24 * 365;

export function parseOpenCollectionsInMagazineCookie(value: unknown): boolean {
  if (value === "reader") return false;
  if (value === "magazine") return true;
  return DEFAULT_OPEN_COLLECTIONS_IN_MAGAZINE;
}

export function openCollectionsInMagazineToCookieValue(
  enabled: boolean,
): "magazine" | "reader" {
  return enabled ? "magazine" : "reader";
}

export function openCollectionsInMagazineToDbValue(enabled: boolean): boolean {
  return enabled;
}

export function dbValueToOpenCollectionsInMagazine(
  value: boolean | null | undefined,
): boolean {
  return value ?? DEFAULT_OPEN_COLLECTIONS_IN_MAGAZINE;
}

/** Reader route for a collection document — used when skipping reader on mag exit. */
export function collectionReaderPath(did: string, rkey: string): string {
  return `/a/${did}/${rkey}`;
}

/** Search on `/a/$did/$rkey` that keeps the document reader (bypasses magazine redirect). */
export const collectionReaderViewSearch = { view: "reader" as const };
