/**
 * Every URL the catalog and the download routes hand out, in one place.
 *
 * Isomorphic on purpose: the settings page shows a reader their own catalog
 * URL, article pages link their own EPUB, and the catalog builders emit
 * acquisition links — all from these helpers, so a route rename cannot leave
 * one of the three behind.
 */

function trim(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

const did = encodeURIComponent;
const rkey = encodeURIComponent;

// ── Catalog ────────────────────────────────────────────────────────────────

/** Catalog root — the URL a reader pastes into KOReader. */
export function opdsRootUrl(baseUrl: string): string {
  return `${trim(baseUrl)}/opds`;
}

/** A reader's personal catalog: their subscriptions, unread, saved and lists. */
export function opdsShelfUrl(baseUrl: string, readerDid: string): string {
  return `${trim(baseUrl)}/opds/u/${did(readerDid)}`;
}

export function opdsLatestUrl(baseUrl: string): string {
  return `${trim(baseUrl)}/opds/latest`;
}

export function opdsTrendingUrl(baseUrl: string): string {
  return `${trim(baseUrl)}/opds/trending`;
}

export function opdsPublicationsUrl(baseUrl: string): string {
  return `${trim(baseUrl)}/opds/publications`;
}

export function opdsPublicationUrl(
  baseUrl: string,
  ownerDid: string,
  publicationRkey: string,
): string {
  return `${trim(baseUrl)}/opds/p/${did(ownerDid)}/${rkey(publicationRkey)}`;
}

export function opdsCollectionsUrl(baseUrl: string): string {
  return `${trim(baseUrl)}/opds/collections`;
}

/**
 * Comic publications on their own.
 *
 * A comic app pointed at the whole directory would have to wade through
 * hundreds of prose blogs to find the handful of things it can actually open.
 */
export function opdsComicsUrl(baseUrl: string): string {
  return `${trim(baseUrl)}/opds/comics`;
}

export function opdsCollectionUrl(
  baseUrl: string,
  ownerDid: string,
  collectionRkey: string,
): string {
  return `${trim(baseUrl)}/opds/c/${did(ownerDid)}/${rkey(collectionRkey)}`;
}

export function opdsTagsUrl(baseUrl: string): string {
  return `${trim(baseUrl)}/opds/tags`;
}

export function opdsTagUrl(baseUrl: string, tag: string): string {
  return `${trim(baseUrl)}/opds/tag/${encodeURIComponent(tag)}`;
}

export function opdsListUrl(
  baseUrl: string,
  ownerDid: string,
  listRkey: string,
): string {
  return `${trim(baseUrl)}/opds/l/${did(ownerDid)}/${rkey(listRkey)}`;
}

export function opdsSearchUrl(baseUrl: string, query?: string): string {
  const base = `${trim(baseUrl)}/opds/search`;
  return query ? `${base}?q=${encodeURIComponent(query)}` : base;
}

/**
 * The OpenSearch template. `{searchTerms}` is a placeholder the *client*
 * substitutes, so it must survive un-encoded.
 */
export function opdsSearchTemplate(baseUrl: string): string {
  return `${trim(baseUrl)}/opds/search?q={searchTerms}`;
}

export function opdsOpenSearchUrl(baseUrl: string): string {
  return `${trim(baseUrl)}/opds/opensearch.xml`;
}

// ── Downloads ──────────────────────────────────────────────────────────────

/** One article as an EPUB. */
export function articleEpubUrl(
  baseUrl: string,
  authorDid: string,
  documentRkey: string,
): string {
  return `${trim(baseUrl)}/book/a/${did(authorDid)}/${rkey(documentRkey)}.epub`;
}

/** One comic issue as a CBZ. */
export function articleCbzUrl(
  baseUrl: string,
  authorDid: string,
  documentRkey: string,
): string {
  return `${trim(baseUrl)}/book/a/${did(authorDid)}/${rkey(documentRkey)}.cbz`;
}

/**
 * One comic *issue* as a CBZ, addressed by the document that fronts it.
 *
 * Not the same as {@link articleCbzUrl}: a comic posts one page per document,
 * so packaging a document gives a one-page file. This collects the whole issue
 * that page belongs to — the unit the shelf, the reader and a comic app all
 * mean by "an issue".
 */
export function comicIssueCbzUrl(
  baseUrl: string,
  authorDid: string,
  frontRkey: string,
): string {
  return `${trim(baseUrl)}/book/i/${did(authorDid)}/${rkey(frontRkey)}.cbz`;
}

/** A comic publication's whole run as one CBZ. */
export function publicationCbzUrl(
  baseUrl: string,
  ownerDid: string,
  publicationRkey: string,
): string {
  return `${trim(baseUrl)}/book/p/${did(ownerDid)}/${rkey(publicationRkey)}.cbz`;
}

/** A publication's recent articles as one book. */
export function publicationEpubUrl(
  baseUrl: string,
  ownerDid: string,
  publicationRkey: string,
): string {
  return `${trim(baseUrl)}/book/p/${did(ownerDid)}/${rkey(publicationRkey)}.epub`;
}

/** A curated collection as one book. */
export function collectionEpubUrl(
  baseUrl: string,
  ownerDid: string,
  collectionRkey: string,
): string {
  return `${trim(baseUrl)}/book/c/${did(ownerDid)}/${rkey(collectionRkey)}.epub`;
}

/** A subscription list as one book. */
export function listEpubUrl(
  baseUrl: string,
  ownerDid: string,
  listRkey: string,
): string {
  return `${trim(baseUrl)}/book/l/${did(ownerDid)}/${rkey(listRkey)}.epub`;
}

/** Everything a reader saved for later, as one book. */
export function savedEpubUrl(baseUrl: string, readerDid: string): string {
  return `${trim(baseUrl)}/book/u/${did(readerDid)}/saved.epub`;
}

/** A reader's unread queue, as one book. */
export function unreadEpubUrl(baseUrl: string, readerDid: string): string {
  return `${trim(baseUrl)}/book/u/${did(readerDid)}/unread.epub`;
}

/** A tag's recent articles, as one book. */
export function tagEpubUrl(baseUrl: string, tag: string): string {
  return `${trim(baseUrl)}/book/tag/${encodeURIComponent(tag)}.epub`;
}

// ── KOReader progress sync ─────────────────────────────────────────────────

/** The kosync base URL a reader enters in KOReader's sync settings. */
export function kosyncBaseUrl(baseUrl: string): string {
  return `${trim(baseUrl)}/kosync`;
}
