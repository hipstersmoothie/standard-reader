/** Host substring for platform profiles that are not standard.site publications. */
export const EXCLUDED_PUBLICATION_HOST = "blento.app";

/** SQL `ILIKE` pattern for {@link EXCLUDED_PUBLICATION_HOST} URL matches. */
export const EXCLUDED_PUBLICATION_URL_PATTERN = `%${EXCLUDED_PUBLICATION_HOST}%`;

/** True when a publication URL points at blento.app (not a reader publication). */
export function isExcludedPublicationUrl(
  url: string | null | undefined,
): boolean {
  if (!url) return false;
  return url.toLowerCase().includes(EXCLUDED_PUBLICATION_HOST);
}

/** Drop blento.app rows from in-memory publication lists (repo resolve, etc.). */
export function withoutExcludedPublications<T extends { url: string }>(
  items: Array<T>,
): Array<T> {
  return items.filter((item) => !isExcludedPublicationUrl(item.url));
}
