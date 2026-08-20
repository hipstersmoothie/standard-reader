import { describe, expect, it } from "vitest";

import { renderOpdsAtom } from "#/lib/opds/atom";
import { renderOpdsJson, withJsonFormat } from "#/lib/opds/json";
import type { OpdsFeed } from "#/lib/opds/model";
import {
  EPUB_TYPE,
  OPDS_ACQUISITION_TYPE,
  OPDS_JSON_TYPE,
  OPDS_NAVIGATION_TYPE,
  OPDS_REL,
} from "#/lib/opds/model";
import { opdsFormatFromRequest } from "#/lib/opds/respond";

const BASE = "https://standard-reader.app";

const acquisitionFeed: OpdsFeed = {
  id: `${BASE}/opds/latest`,
  kind: "acquisition",
  links: [
    {
      href: `${BASE}/opds/latest?page=2`,
      rel: "next",
      type: OPDS_ACQUISITION_TYPE,
    },
    {
      activeFacet: true,
      facetGroup: "Sort",
      href: `${BASE}/opds/latest?sort=recent`,
      rel: OPDS_REL.facet,
      title: "Newest",
      type: OPDS_ACQUISITION_TYPE,
    },
  ],
  pagination: { itemsPerPage: 40, startIndex: 0, totalResults: 137 },
  publications: [
    {
      acquisitions: [
        {
          href: `${BASE}/book/a/did:plc:abc/xyz.epub`,
          title: "EPUB",
          type: EPUB_TYPE,
        },
      ],
      authors: [{ name: "Ada & Co", uri: `${BASE}/u/did:plc:abc` }],
      categories: ["design", "<script>"],
      coverImageUrl: "https://cdn.example/cover.jpg",
      id: "at://did:plc:abc/site.standard.document/xyz",
      published: "2026-08-01T00:00:00.000Z",
      summary: 'A "quoted" summary',
      title: "Tools & Toys",
      updated: "2026-08-01T00:00:00.000Z",
      webUrl: "https://example.com/post?a=1&b=2",
    },
  ],
  selfHref: `${BASE}/opds/latest`,
  title: "Latest",
  updated: "2026-08-01T00:00:00.000Z",
};

const navigationFeed: OpdsFeed = {
  id: `${BASE}/opds`,
  kind: "navigation",
  navigation: [
    {
      href: `${BASE}/opds/latest`,
      id: `${BASE}/opds/latest`,
      kind: "acquisition",
      summary: "The newest articles.",
      title: "Latest",
      updated: "2026-08-01T00:00:00.000Z",
    },
  ],
  selfHref: `${BASE}/opds`,
  title: "Standard Reader",
  updated: "2026-08-01T00:00:00.000Z",
};

describe("renderOpdsAtom", () => {
  it("escapes markup and ampersands in text and attributes", () => {
    const xml = renderOpdsAtom(acquisitionFeed);
    expect(xml).toContain("<title>Tools &amp; Toys</title>");
    expect(xml).toContain("A &quot;quoted&quot; summary");
    expect(xml).toContain('<category term="&lt;script&gt;"/>');
    expect(xml).toContain("post?a=1&amp;b=2");
    expect(xml).not.toContain("<script>");
  });

  it("declares the feed kind on its self link", () => {
    expect(renderOpdsAtom(acquisitionFeed)).toContain(
      `<link rel="self" href="${BASE}/opds/latest" type="${OPDS_ACQUISITION_TYPE}"/>`,
    );
    expect(renderOpdsAtom(navigationFeed)).toContain(
      `type="${OPDS_NAVIGATION_TYPE}"`,
    );
  });

  it("carries pagination counts and facet grouping", () => {
    const xml = renderOpdsAtom(acquisitionFeed);
    expect(xml).toContain(
      "<opensearch:totalResults>137</opensearch:totalResults>",
    );
    expect(xml).toContain('opds:facetGroup="Sort"');
    expect(xml).toContain('opds:activeFacet="true"');
  });

  it("writes both `published` and `dc:issued` for date-reading clients", () => {
    const xml = renderOpdsAtom(acquisitionFeed);
    expect(xml).toContain("<published>2026-08-01T00:00:00.000Z</published>");
    expect(xml).toContain("<dc:issued>2026-08-01T00:00:00.000Z</dc:issued>");
  });

  it("defaults an acquisition link to open-access", () => {
    expect(renderOpdsAtom(acquisitionFeed)).toContain(
      `rel="${OPDS_REL.openAccess}"`,
    );
  });

  it("survives an unparseable timestamp rather than emitting `Invalid Date`", () => {
    const xml = renderOpdsAtom({ ...acquisitionFeed, updated: "not a date" });
    expect(xml).toContain("<updated>1970-01-01T00:00:00.000Z</updated>");
    expect(xml).not.toContain("Invalid");
  });
});

describe("renderOpdsJson", () => {
  it("splits navigation and publications into their own arrays", () => {
    const nav = JSON.parse(renderOpdsJson(navigationFeed));
    expect(nav.navigation).toHaveLength(1);
    expect(nav.publications).toBeUndefined();

    const acquisition = JSON.parse(renderOpdsJson(acquisitionFeed));
    expect(acquisition.publications).toHaveLength(1);
    expect(acquisition.navigation).toBeUndefined();
  });

  it("keeps a client in JSON as it walks deeper into the catalog", () => {
    const document = JSON.parse(renderOpdsJson(navigationFeed));
    expect(document.links[0].href).toContain("format=json");
    expect(document.links[0].type).toBe(OPDS_JSON_TYPE);
    expect(document.navigation[0].href).toContain("format=json");
    expect(document.navigation[0].type).toBe(OPDS_JSON_TYPE);
  });

  it("leaves acquisition links alone — an EPUB is an EPUB", () => {
    const document = JSON.parse(renderOpdsJson(acquisitionFeed));
    const [link] = document.publications[0].links;
    expect(link.href).toBe(`${BASE}/book/a/did:plc:abc/xyz.epub`);
    expect(link.href).not.toContain("format=json");
    expect(link.type).toBe(EPUB_TYPE);
  });

  it("carries facets as link properties", () => {
    const document = JSON.parse(renderOpdsJson(acquisitionFeed));
    const facet = document.links.find(
      (link: { rel: string }) => link.rel === OPDS_REL.facet,
    );
    expect(facet.properties).toEqual({ active: true, group: "Sort" });
  });

  it("reports paging in the metadata block", () => {
    const document = JSON.parse(renderOpdsJson(acquisitionFeed));
    expect(document.metadata.numberOfItems).toBe(137);
    expect(document.metadata.itemsPerPage).toBe(40);
    expect(document.metadata.currentPage).toBe(1);
  });
});

describe("withJsonFormat", () => {
  it("adds the marker without disturbing existing query params", () => {
    expect(withJsonFormat(`${BASE}/opds/tag/design?page=2`)).toBe(
      `${BASE}/opds/tag/design?page=2&format=json`,
    );
  });

  it("does not add it twice", () => {
    const once = withJsonFormat(`${BASE}/opds`);
    expect(withJsonFormat(once)).toBe(once);
  });
});

describe("opdsFormatFromRequest", () => {
  const get = (url: string, accept?: string) =>
    opdsFormatFromRequest(
      new Request(url, { headers: accept ? { accept } : {} }),
    );

  it("defaults to Atom, the dialect every client understands", () => {
    expect(get(`${BASE}/opds`)).toBe("atom");
    expect(get(`${BASE}/opds`, "*/*")).toBe("atom");
  });

  it("honours an Accept header asking for OPDS 2.0", () => {
    expect(get(`${BASE}/opds`, OPDS_JSON_TYPE)).toBe("json");
  });

  it("lets the URL override the header, in both directions", () => {
    // The URL is the explicit choice — and it is what keeps a JSON client in
    // JSON once it has followed one of our own links.
    expect(get(`${BASE}/opds?format=json`, "application/atom+xml")).toBe(
      "json",
    );
    expect(get(`${BASE}/opds?format=atom`, OPDS_JSON_TYPE)).toBe("atom");
  });
});
