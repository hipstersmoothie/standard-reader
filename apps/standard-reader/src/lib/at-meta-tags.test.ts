import { describe, expect, it } from "vitest";

import { atMetaFromMatches, atMetaTags } from "./at-meta-tags.ts";

const DID = "did:plc:sov5kv5byjmdksdjacjiysg3";
const DOCUMENT = `at://${DID}/site.standard.document/3mrnculcx5c2v`;
const PUBLICATION = `at://${DID}/site.standard.publication/3mnuandrwh22s`;
const BSKY_POST = `at://${DID}/app.bsky.feed.post/3mrnculiuls2c`;

describe("atMetaTags", () => {
  it("emits the article shape from the SkyPress example", () => {
    expect(
      atMetaTags({
        canonical: [DOCUMENT],
        alternate: [PUBLICATION, BSKY_POST],
        author: [DID],
      }),
    ).toEqual([
      { name: "at:canonical", content: DOCUMENT },
      { name: "at:alternate", content: PUBLICATION },
      { name: "at:alternate", content: BSKY_POST },
      { name: "at:author", content: `at://${DID}` },
    ]);
  });

  it("drops nullish entries so callers can pass optional loader data", () => {
    expect(
      atMetaTags({ canonical: [DOCUMENT], alternate: [null, undefined, ""] }),
    ).toEqual([{ name: "at:canonical", content: DOCUMENT }]);
  });

  it("leaves an at:// identity URI alone but promotes a bare DID", () => {
    expect(atMetaTags({ author: [`at://${DID}`, DID] })).toEqual([
      { name: "at:author", content: `at://${DID}` },
    ]);
  });

  it("ignores values that are neither an at:// URI nor a DID", () => {
    expect(
      atMetaTags({ canonical: ["https://example.com/post", "at://"] }),
    ).toEqual([]);
  });

  it("does not repeat a canonical record as an alternate", () => {
    expect(
      atMetaTags({ canonical: [DOCUMENT], alternate: [DOCUMENT, PUBLICATION] }),
    ).toEqual([
      { name: "at:canonical", content: DOCUMENT },
      { name: "at:alternate", content: PUBLICATION },
    ]);
  });

  it("collapses duplicates within a single name", () => {
    expect(atMetaTags({ alternate: [PUBLICATION, PUBLICATION] })).toEqual([
      { name: "at:alternate", content: PUBLICATION },
    ]);
  });

  it("returns nothing for a page with no records", () => {
    expect(atMetaTags({})).toEqual([]);
  });
});

describe("atMetaFromMatches", () => {
  it("takes the deepest match that declares records", () => {
    expect(
      atMetaFromMatches([
        { loaderData: { atMeta: { canonical: [PUBLICATION] } } },
        { loaderData: { atMeta: { canonical: [DOCUMENT] } } },
      ]),
    ).toEqual({ canonical: [DOCUMENT] });
  });

  it("skips matches that declare none", () => {
    expect(
      atMetaFromMatches([
        { loaderData: { atMeta: { canonical: [DOCUMENT] } } },
        { loaderData: { publicationTheme: null } },
        {},
      ]),
    ).toEqual({ canonical: [DOCUMENT] });
  });

  it("returns null when no match declares any", () => {
    expect(atMetaFromMatches([{ loaderData: undefined }, {}])).toBeNull();
    expect(atMetaFromMatches([])).toBeNull();
  });
});
