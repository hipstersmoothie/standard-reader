import { describe, expect, it } from "vitest";

import { parseDiscoveryHintsFromHtml } from "./discovery-hints.ts";

const LEAFLET_HEAD_SNIPPET = `
<link rel="canonical" href="https://modalfoundation.leaflet.pub/3mnzi5mam2c2j"/>
<link rel="alternate" href="at://did:plc:hochc4ppzwv5idi6ypeio7ow/site.standard.document/3mnzi5mam2c2j"/>
<link rel="site.standard.document" href="at://did:plc:hochc4ppzwv5idi6ypeio7ow/site.standard.document/3mnzi5mam2c2j"/>
<link rel="site.standard.publication" href="at://did:plc:hochc4ppzwv5idi6ypeio7ow/site.standard.publication/3mcz3le7qjc22"/>
`;

/** A live SkyPress article — the new meta tags sitting next to the old rels. */
const SKYPRESS_HEAD_SNIPPET = `
<link rel="site.standard.document" href="at://did:plc:sov5kv5byjmdksdjacjiysg3/site.standard.document/3mrnculcx5c2v">
<link rel="site.standard.publication" href="at://did:plc:sov5kv5byjmdksdjacjiysg3/site.standard.publication/3mnuandrwh22s">
<meta name="at:canonical" content="at://did:plc:sov5kv5byjmdksdjacjiysg3/site.standard.document/3mrnculcx5c2v">
<meta name="at:alternate" content="at://did:plc:sov5kv5byjmdksdjacjiysg3/site.standard.publication/3mnuandrwh22s">
<meta name="at:alternate" content="at://did:plc:sov5kv5byjmdksdjacjiysg3/app.bsky.feed.post/3mrnculiuls2c">
<meta name="at:author" content="at://did:plc:sov5kv5byjmdksdjacjiysg3">
<meta name="at:me" content="at://did:plc:sov5kv5byjmdksdjacjiysg3">
`;

describe("parseDiscoveryHintsFromHtml", () => {
  it("reads site.standard.document and publication hints from Leaflet HTML", () => {
    const hints = parseDiscoveryHintsFromHtml(LEAFLET_HEAD_SNIPPET);
    expect(hints.documentUri).toBe(
      "at://did:plc:hochc4ppzwv5idi6ypeio7ow/site.standard.document/3mnzi5mam2c2j",
    );
    expect(hints.publicationUri).toBe(
      "at://did:plc:hochc4ppzwv5idi6ypeio7ow/site.standard.publication/3mcz3le7qjc22",
    );
  });

  it("ignores non-at-uri link targets", () => {
    const hints = parseDiscoveryHintsFromHtml(
      `<link rel="site.standard.document" href="https://example.com/article"/>`,
    );
    expect(hints.documentUri).toBeNull();
  });

  it("reads at: meta tags from a SkyPress article", () => {
    const hints = parseDiscoveryHintsFromHtml(SKYPRESS_HEAD_SNIPPET);
    expect(hints.documentUri).toBe(
      "at://did:plc:sov5kv5byjmdksdjacjiysg3/site.standard.document/3mrnculcx5c2v",
    );
    expect(hints.publicationUri).toBe(
      "at://did:plc:sov5kv5byjmdksdjacjiysg3/site.standard.publication/3mnuandrwh22s",
    );
  });

  it("still resolves a page that dropped the legacy rels", () => {
    const hints = parseDiscoveryHintsFromHtml(`
      <meta name="at:canonical" content="at://did:plc:abc/site.standard.document/3aaa"/>
      <meta name="at:alternate" content="at://did:plc:abc/site.standard.publication/3bbb"/>
    `);
    expect(hints).toEqual({
      documentUri: "at://did:plc:abc/site.standard.document/3aaa",
      publicationUri: "at://did:plc:abc/site.standard.publication/3bbb",
    });
  });

  it("prefers the canonical record over one the page merely shows", () => {
    const hints = parseDiscoveryHintsFromHtml(`
      <meta name="at:alternate" content="at://did:plc:abc/site.standard.document/3quoted"/>
      <meta name="at:canonical" content="at://did:plc:abc/site.standard.document/3main"/>
    `);
    expect(hints.documentUri).toBe(
      "at://did:plc:abc/site.standard.document/3main",
    );
  });

  it("prefers an at: meta hint over a legacy rel that disagrees", () => {
    const hints = parseDiscoveryHintsFromHtml(`
      <link rel="site.standard.document" href="at://did:plc:abc/site.standard.document/3stale"/>
      <meta name="at:canonical" content="at://did:plc:abc/site.standard.document/3fresh"/>
    `);
    expect(hints.documentUri).toBe(
      "at://did:plc:abc/site.standard.document/3fresh",
    );
  });

  it("ignores at: tags pointing at collections it cannot render", () => {
    const hints = parseDiscoveryHintsFromHtml(
      `<meta name="at:canonical" content="at://did:plc:abc/app.bsky.feed.post/3ccc"/>`,
    );
    expect(hints).toEqual({ documentUri: null, publicationUri: null });
  });

  it("ignores at:author and at:me, which name an identity and not a record", () => {
    const hints = parseDiscoveryHintsFromHtml(`
      <meta name="at:author" content="at://did:plc:abc"/>
      <meta name="at:me" content="at://did:plc:abc"/>
    `);
    expect(hints).toEqual({ documentUri: null, publicationUri: null });
  });

  it("ignores unrelated meta tags", () => {
    const hints = parseDiscoveryHintsFromHtml(
      `<meta name="description" content="at://did:plc:abc/site.standard.document/3ddd"/>`,
    );
    expect(hints.documentUri).toBeNull();
  });
});
