/**
 * "Open on original site" preference shared types/helpers.
 *
 * When enabled, links to documents open on the external website where they're
 * published (canonical URL) instead of the in-app reader. Persisted as
 * `external | reader` in the `standard-reader-open-links` cookie (SSR for
 * everyone). Signed-in users also store it on `user.open_links_externally`
 * (`null` = reader, the default).
 */

export const DEFAULT_OPEN_LINKS_EXTERNALLY = false;

export const OPEN_LINKS_COOKIE = "standard-reader-open-links";

export const OPEN_LINKS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseOpenLinksExternally(value: unknown): boolean {
  return value === "external";
}

export function openLinksExternallyToCookieValue(
  enabled: boolean,
): "external" | "reader" {
  return enabled ? "external" : "reader";
}

export function openLinksExternallyToDbValue(enabled: boolean): true | null {
  return enabled ? true : null;
}

export function dbValueToOpenLinksExternally(
  value: boolean | null | undefined,
): boolean {
  return value === true;
}
