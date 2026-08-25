/**
 * OPDS 1.2 (Atom) serialization.
 *
 * Pure string building, like `lib/feeds/rss.ts` — an OPDS feed is a small,
 * fixed shape, and a generic XML library would add a dependency without adding
 * correctness.
 *
 * The dialect matters more than the syntax. Every catalog client in the wild is
 * a little different about which links it honours, so this writes the belt and
 * braces version: `dc:issued` next to `published`, a thumbnail alongside the
 * full cover, an `alternate` link to the web page next to the acquisition link,
 * and OpenSearch pagination counts on every paged feed.
 */

import type {
  OpdsAcquisition,
  OpdsFeed,
  OpdsLink,
  OpdsNavigationEntry,
  OpdsPublicationEntry,
} from "./model";
import { feedTypeFor, OPDS_REL } from "./model";

function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Strip the code points XML 1.0 cannot represent at all. */
function safe(value: string): string {
  return value.replaceAll(
    // eslint-disable-next-line no-control-regex -- matching them is the point
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu,
    "",
  );
}

function text(value: string): string {
  return escape(safe(value));
}

function isoOrEpoch(value: string): string {
  const time = Date.parse(value);
  return new Date(Number.isNaN(time) ? 0 : time).toISOString();
}

function renderLink(link: OpdsLink): string {
  const parts = [
    `rel="${escape(link.rel)}"`,
    `href="${escape(link.href)}"`,
    `type="${escape(link.type)}"`,
  ];
  if (link.title) parts.push(`title="${text(link.title)}"`);
  if (link.facetGroup) {
    parts.push(`opds:facetGroup="${text(link.facetGroup)}"`);
  }
  if (link.activeFacet) parts.push(`opds:activeFacet="true"`);
  if (typeof link.count === "number") {
    parts.push(`thr:count="${link.count}"`);
  }
  return `  <link ${parts.join(" ")}/>`;
}

function renderNavigationEntry(entry: OpdsNavigationEntry): string {
  const lines = [
    "  <entry>",
    `    <title>${text(entry.title)}</title>`,
    `    <id>${text(entry.id)}</id>`,
    `    <updated>${isoOrEpoch(entry.updated)}</updated>`,
  ];
  if (entry.summary) {
    lines.push(`    <content type="text">${text(entry.summary)}</content>`);
  }
  if (entry.imageUrl) {
    lines.push(
      `    <link rel="${OPDS_REL.image}" href="${escape(entry.imageUrl)}"/>`,
    );
  }
  if (entry.thumbnailUrl) {
    lines.push(
      `    <link rel="${OPDS_REL.thumbnail}" href="${escape(entry.thumbnailUrl)}"/>`,
    );
  }
  lines.push(
    `    <link rel="${escape(entry.rel ?? "subsection")}" href="${escape(entry.href)}" type="${escape(feedTypeFor(entry.kind))}"/>`,
    "  </entry>",
  );
  return lines.join("\n");
}

function renderAcquisition(acquisition: OpdsAcquisition): string {
  const parts = [
    `rel="${escape(acquisition.rel ?? OPDS_REL.openAccess)}"`,
    `href="${escape(acquisition.href)}"`,
    `type="${escape(acquisition.type)}"`,
  ];
  if (acquisition.title) parts.push(`title="${text(acquisition.title)}"`);
  if (typeof acquisition.length === "number") {
    parts.push(`length="${acquisition.length}"`);
  }
  return `    <link ${parts.join(" ")}/>`;
}

function renderPublicationEntry(entry: OpdsPublicationEntry): string {
  const lines = [
    "  <entry>",
    `    <title>${text(entry.title)}</title>`,
    `    <id>${text(entry.id)}</id>`,
    `    <updated>${isoOrEpoch(entry.updated)}</updated>`,
  ];

  for (const author of entry.authors) {
    lines.push(
      "    <author>",
      `      <name>${text(author.name)}</name>`,
      ...(author.uri ? [`      <uri>${escape(author.uri)}</uri>`] : []),
      "    </author>",
    );
  }
  if (entry.published) {
    // `published` is Atom's; `dc:issued` is what several catalog clients read.
    lines.push(
      `    <published>${isoOrEpoch(entry.published)}</published>`,
      `    <dc:issued>${isoOrEpoch(entry.published)}</dc:issued>`,
    );
  }
  if (entry.language) {
    lines.push(`    <dc:language>${text(entry.language)}</dc:language>`);
  }
  if (entry.publisher) {
    lines.push(`    <dc:publisher>${text(entry.publisher)}</dc:publisher>`);
  }
  if (entry.summary) {
    lines.push(`    <content type="text">${text(entry.summary)}</content>`);
  }
  for (const category of entry.categories ?? []) {
    lines.push(`    <category term="${text(category)}"/>`);
  }
  if (entry.coverImageUrl) {
    lines.push(
      `    <link rel="${OPDS_REL.image}" href="${escape(entry.coverImageUrl)}"/>`,
    );
  }
  if (entry.thumbnailUrl) {
    lines.push(
      `    <link rel="${OPDS_REL.thumbnail}" href="${escape(entry.thumbnailUrl)}"/>`,
    );
  }
  if (entry.webUrl) {
    lines.push(
      `    <link rel="alternate" href="${escape(entry.webUrl)}" type="text/html"/>`,
    );
  }
  for (const acquisition of entry.acquisitions) {
    lines.push(renderAcquisition(acquisition));
  }
  lines.push("  </entry>");
  return lines.join("\n");
}

/** Serialize a feed as OPDS 1.2 Atom. */
export function renderOpdsAtom(feed: OpdsFeed): string {
  const lines: Array<string> = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom"',
    '      xmlns:opds="http://opds-spec.org/2010/catalog"',
    '      xmlns:dc="http://purl.org/dc/terms/"',
    '      xmlns:thr="http://purl.org/syndication/thread/1.0"',
    '      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">',
    `  <id>${text(feed.id)}</id>`,
    `  <title>${text(feed.title)}</title>`,
    `  <updated>${isoOrEpoch(feed.updated)}</updated>`,
  ];
  if (feed.subtitle) {
    lines.push(`  <subtitle>${text(feed.subtitle)}</subtitle>`);
  }
  if (feed.iconUrl) lines.push(`  <icon>${escape(feed.iconUrl)}</icon>`);

  if (feed.pagination) {
    lines.push(
      `  <opensearch:totalResults>${feed.pagination.totalResults}</opensearch:totalResults>`,
      `  <opensearch:itemsPerPage>${feed.pagination.itemsPerPage}</opensearch:itemsPerPage>`,
      `  <opensearch:startIndex>${feed.pagination.startIndex}</opensearch:startIndex>`,
    );
  }

  lines.push(
    renderLink({
      href: feed.selfHref,
      rel: "self",
      type: feedTypeFor(feed.kind),
    }),
  );
  for (const link of feed.links ?? []) lines.push(renderLink(link));

  for (const entry of feed.navigation ?? []) {
    lines.push(renderNavigationEntry(entry));
  }
  for (const entry of feed.publications ?? []) {
    lines.push(renderPublicationEntry(entry));
  }

  lines.push("</feed>", "");
  return lines.join("\n");
}

/**
 * The OpenSearch description document.
 *
 * Catalog clients fetch this once and then build their own search box from it;
 * `{searchTerms}` is the placeholder they substitute into.
 */
export function renderOpenSearchDescription({
  shortName,
  description,
  searchTemplate,
  jsonSearchTemplate,
}: {
  shortName: string;
  description: string;
  searchTemplate: string;
  jsonSearchTemplate?: string;
}): string {
  const jsonUrl = jsonSearchTemplate
    ? `\n  <Url type="application/opds+json" template="${escape(jsonSearchTemplate)}"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>${text(shortName)}</ShortName>
  <Description>${text(description)}</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <OutputEncoding>UTF-8</OutputEncoding>
  <Url type="application/atom+xml;profile=opds-catalog;kind=acquisition" template="${escape(searchTemplate)}"/>${jsonUrl}
</OpenSearchDescription>
`;
}
