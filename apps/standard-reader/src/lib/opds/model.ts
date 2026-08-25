/**
 * A format-neutral model of an OPDS catalog feed.
 *
 * OPDS has two incompatible serializations in active use: 1.2, which is Atom
 * XML, and 2.0, which is JSON. KOReader — the client this catalog was built
 * for — speaks 1.2; Thorium and the Readium stack speak 2.0. Rather than write
 * the catalog twice, the builders in `server/opds/` produce this model and the
 * two serializers (`atom.ts`, `json.ts`) render it.
 *
 * The model is deliberately closer to 1.2, because 1.2 is the lossier of the
 * two: anything Atom can carry, OPDS 2.0 can carry, and the reverse is not
 * true.
 */

/** `application/atom+xml;profile=opds-catalog;kind=navigation`. */
export const OPDS_NAVIGATION_TYPE =
  "application/atom+xml;profile=opds-catalog;kind=navigation";

/** `application/atom+xml;profile=opds-catalog;kind=acquisition`. */
export const OPDS_ACQUISITION_TYPE =
  "application/atom+xml;profile=opds-catalog;kind=acquisition";

/** The OPDS 2.0 media type — one type for both feed kinds. */
export const OPDS_JSON_TYPE = "application/opds+json";

export const EPUB_TYPE = "application/epub+zip";
export const CBZ_TYPE = "application/vnd.comicbook+zip";
export const OPENSEARCH_TYPE = "application/opensearchdescription+xml";

/** OPDS relation URIs, spelled once. */
export const OPDS_REL = {
  acquisition: "http://opds-spec.org/acquisition",
  facet: "http://opds-spec.org/facet",
  image: "http://opds-spec.org/image",
  openAccess: "http://opds-spec.org/acquisition/open-access",
  shelf: "http://opds-spec.org/shelf",
  thumbnail: "http://opds-spec.org/image/thumbnail",
} as const;

export type OpdsFeedKind = "acquisition" | "navigation";

export interface OpdsLink {
  rel: string;
  href: string;
  type: string;
  title?: string;
  /**
   * Groups mutually-exclusive facets (a "Sort" group, a "Show" group). Clients
   * render one group per menu, so a facet without a group is a facet the
   * reader cannot tell apart from the others.
   */
  facetGroup?: string;
  /** Marks the facet the current feed already applies. */
  activeFacet?: boolean;
  /** Number of entries behind this link, when cheaply known. */
  count?: number;
}

/** An entry that leads somewhere else in the catalog. */
export interface OpdsNavigationEntry {
  id: string;
  title: string;
  href: string;
  /** What the reader lands on — decides the link's media type. */
  kind: OpdsFeedKind;
  updated: string;
  summary?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  /** `subsection` by default; `http://opds-spec.org/shelf` for personal shelves. */
  rel?: string;
}

/** A downloadable rendition of an entry. */
export interface OpdsAcquisition {
  href: string;
  type: string;
  /** Defaults to open-access — everything in this catalog is free to take. */
  rel?: string;
  title?: string;
  /** Bytes, when known without building the file. */
  length?: number;
}

/** An entry a reader can download. */
export interface OpdsPublicationEntry {
  /** Stable, globally unique — the AT-URI of the record. */
  id: string;
  title: string;
  updated: string;
  summary?: string | null;
  authors: Array<{ name: string; uri?: string | null }>;
  publisher?: string | null;
  /** ISO timestamp the work was published. */
  published?: string | null;
  language?: string | null;
  categories?: Array<string>;
  /** The web page this entry mirrors. */
  webUrl?: string | null;
  coverImageUrl?: string | null;
  thumbnailUrl?: string | null;
  acquisitions: Array<OpdsAcquisition>;
}

export interface OpdsPagination {
  totalResults: number;
  itemsPerPage: number;
  startIndex: number;
}

export interface OpdsFeed {
  id: string;
  title: string;
  updated: string;
  /** Absolute URL of this feed — becomes `rel="self"`. */
  selfHref: string;
  kind: OpdsFeedKind;
  subtitle?: string | null;
  iconUrl?: string | null;
  /** `start`, `up`, `next`, `previous`, `search`, facets. */
  links?: Array<OpdsLink>;
  navigation?: Array<OpdsNavigationEntry>;
  publications?: Array<OpdsPublicationEntry>;
  pagination?: OpdsPagination;
}

/** The media type a link to a feed of `kind` should declare. */
export function feedTypeFor(kind: OpdsFeedKind): string {
  return kind === "navigation" ? OPDS_NAVIGATION_TYPE : OPDS_ACQUISITION_TYPE;
}

/** True for the OPDS 1.2 feed media types — the ones JSON output rewrites. */
export function isOpdsFeedType(type: string): boolean {
  return type === OPDS_NAVIGATION_TYPE || type === OPDS_ACQUISITION_TYPE;
}
