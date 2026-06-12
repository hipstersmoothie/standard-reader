import { describe, expect, it } from "vitest";

import { parseDiscoveryHintsFromHtml } from "./discovery-hints.ts";

const LEAFLET_HEAD_SNIPPET = `
<link rel="canonical" href="https://modalfoundation.leaflet.pub/3mnzi5mam2c2j"/>
<link rel="alternate" href="at://did:plc:hochc4ppzwv5idi6ypeio7ow/site.standard.document/3mnzi5mam2c2j"/>
<link rel="site.standard.document" href="at://did:plc:hochc4ppzwv5idi6ypeio7ow/site.standard.document/3mnzi5mam2c2j"/>
<link rel="site.standard.publication" href="at://did:plc:hochc4ppzwv5idi6ypeio7ow/site.standard.publication/3mcz3le7qjc22"/>
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
});
