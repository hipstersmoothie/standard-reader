/**
 * OPDS 2.0 (JSON) serialization of the same {@link OpdsFeed} the Atom
 * serializer renders.
 *
 * Two differences from 1.2 are worth knowing about:
 *
 *  - **One media type for both feed kinds.** 1.2 distinguishes navigation from
 *    acquisition in the type parameter; 2.0 distinguishes them structurally, by
 *    which array the entries land in. So every link *into* the catalog gets its
 *    type rewritten to `application/opds+json`.
 *  - **Format is sticky.** A client that started in JSON must not be handed an
 *    Atom URL three levels down, so internal hrefs carry the format marker
 *    forward. Acquisition links are left alone — an EPUB is an EPUB.
 */

import type {
  OpdsFeed,
  OpdsLink,
  OpdsNavigationEntry,
  OpdsPublicationEntry,
} from "./model";
import { isOpdsFeedType, OPDS_JSON_TYPE, OPDS_REL } from "./model";

/** Query parameter that pins a catalog response to JSON. */
export const OPDS_FORMAT_PARAM = "format";
export const OPDS_JSON_FORMAT = "json";

/** Carry `?format=json` down into a catalog URL. */
export function withJsonFormat(href: string): string {
  try {
    // Base only matters for relative hrefs; the catalog builds absolute ones.
    const url = new URL(href, "https://standard-reader.invalid");
    url.searchParams.set(OPDS_FORMAT_PARAM, OPDS_JSON_FORMAT);
    return href.startsWith("http")
      ? url.toString()
      : `${url.pathname}${url.search}`;
  } catch {
    return href;
  }
}

interface JsonLink {
  rel?: string | Array<string>;
  href: string;
  type?: string;
  title?: string;
  templated?: boolean;
  properties?: Record<string, unknown>;
}

/** Rewrite a link that points back into the catalog so it stays JSON. */
function catalogLink(link: OpdsLink): JsonLink {
  const internal = isOpdsFeedType(link.type);
  const json: JsonLink = {
    href: internal ? withJsonFormat(link.href) : link.href,
    rel: link.rel,
    type: internal ? OPDS_JSON_TYPE : link.type,
  };
  if (link.title) json.title = link.title;

  const properties: Record<string, unknown> = {};
  if (link.facetGroup) properties.group = link.facetGroup;
  if (link.activeFacet) properties.active = true;
  if (typeof link.count === "number") properties.numberOfItems = link.count;
  if (Object.keys(properties).length > 0) json.properties = properties;

  return json;
}

function navigationLink(entry: OpdsNavigationEntry): JsonLink {
  return {
    href: withJsonFormat(entry.href),
    rel: entry.rel ?? "subsection",
    title: entry.title,
    type: OPDS_JSON_TYPE,
  };
}

function publicationJson(entry: OpdsPublicationEntry) {
  const images: Array<{ href: string; rel?: string }> = [];
  if (entry.coverImageUrl) images.push({ href: entry.coverImageUrl });
  if (entry.thumbnailUrl) {
    images.push({ href: entry.thumbnailUrl, rel: OPDS_REL.thumbnail });
  }

  const links: Array<JsonLink> = entry.acquisitions.map((acquisition) => ({
    href: acquisition.href,
    rel: acquisition.rel ?? OPDS_REL.openAccess,
    title: acquisition.title,
    type: acquisition.type,
    ...(typeof acquisition.length === "number"
      ? { properties: { length: acquisition.length } }
      : {}),
  }));
  if (entry.webUrl) {
    links.push({ href: entry.webUrl, rel: "alternate", type: "text/html" });
  }

  return {
    images: images.length > 0 ? images : undefined,
    links,
    metadata: {
      "@type": "http://schema.org/Article",
      author: entry.authors.map((author) => ({
        name: author.name,
        ...(author.uri ? { links: [{ href: author.uri }] } : {}),
      })),
      description: entry.summary ?? undefined,
      identifier: entry.id,
      language: entry.language ?? undefined,
      modified: entry.updated,
      published: entry.published ?? undefined,
      publisher: entry.publisher ? { name: entry.publisher } : undefined,
      subject: entry.categories?.length ? entry.categories : undefined,
      title: entry.title,
    },
  };
}

/** Serialize a feed as an OPDS 2.0 JSON document. */
export function renderOpdsJson(feed: OpdsFeed): string {
  const links: Array<JsonLink> = [
    {
      href: withJsonFormat(feed.selfHref),
      rel: "self",
      type: OPDS_JSON_TYPE,
    },
    ...(feed.links ?? []).map((link) => catalogLink(link)),
  ];

  const document = {
    links,
    metadata: {
      currentPage: feed.pagination
        ? Math.floor(
            feed.pagination.startIndex / feed.pagination.itemsPerPage,
          ) + 1
        : undefined,
      description: feed.subtitle ?? undefined,
      identifier: feed.id,
      itemsPerPage: feed.pagination?.itemsPerPage,
      modified: feed.updated,
      numberOfItems: feed.pagination?.totalResults,
      title: feed.title,
    },
    navigation: feed.navigation?.length
      ? feed.navigation.map(navigationLink)
      : undefined,
    publications: feed.publications?.length
      ? feed.publications.map(publicationJson)
      : undefined,
  };

  return `${JSON.stringify(document, null, 2)}\n`;
}
