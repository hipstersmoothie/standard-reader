import type { Key } from "react-aria-components";

/**
 * The `/saved` filter state, as the page holds it. Order within each array
 * doesn't matter — the query layer normalizes before building a cache key.
 */
export interface SavedFilterValues {
  pubs: Array<string>;
  authors: Array<string>;
  tags: Array<string>;
}

export type SavedFacetName = keyof SavedFilterValues;

/**
 * One flat list carries all three facets in the filter popover, so the
 * type-ahead searches across them at once ("offprint" finds the publication and
 * the author without the reader picking a category first). Keys are namespaced
 * to say which facet a selection came back from — an AT-URI, a DID, and a tag
 * are all just strings otherwise.
 */
const KEY_SEPARATOR = ":";

export function facetKey(facet: SavedFacetName, id: string): string {
  return `${facet}${KEY_SEPARATOR}${id}`;
}

export function parseFacetKey(
  key: Key,
): { facet: SavedFacetName; id: string } | null {
  const raw = String(key);
  const index = raw.indexOf(KEY_SEPARATOR);
  // Index 0 would mean an empty facet name; AT-URIs are full of colons, so only
  // the first one separates.
  if (index < 1) return null;
  const facet = raw.slice(0, index);
  const id = raw.slice(index + 1);
  if (facet !== "pubs" && facet !== "authors" && facet !== "tags") return null;
  return id ? { facet, id } : null;
}

export function countSavedFilters(value: SavedFilterValues): number {
  return value.pubs.length + value.authors.length + value.tags.length;
}
