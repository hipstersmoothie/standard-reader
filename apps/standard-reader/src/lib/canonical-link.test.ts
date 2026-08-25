import { describe, expect, it } from "vitest";

import { articleSourceUrl } from "#/components/reader/format";
import { canonicalLink } from "#/lib/site-metadata";

const SELF = "https://standard-reader.app/a/did:plc:example/3abc";

describe("canonicalLink", () => {
  it("points at the publication's own page for the article", () => {
    expect(canonicalLink(SELF, "https://example.blog/posts/hello")).toEqual({
      rel: "canonical",
      href: "https://example.blog/posts/hello",
    });
  });

  it("self-canonicalizes when there is no off-site original", () => {
    for (const source of [null, undefined, "", "   "]) {
      expect(canonicalLink(SELF, source).href).toBe(SELF);
    }
  });

  it("ignores a source that is unparseable or not a web URL", () => {
    expect(canonicalLink(SELF, "not a url").href).toBe(SELF);
    expect(canonicalLink(SELF, "/posts/hello").href).toBe(SELF);
    expect(
      canonicalLink(SELF, "at://did:plc:example/site.standard.document/3abc")
        .href,
    ).toBe(SELF);
    expect(canonicalLink(SELF, "javascript:alert(1)").href).toBe(SELF);
  });

  it("never canonicalizes a page to another page on our own host", () => {
    expect(
      canonicalLink(SELF, "https://standard-reader.app/a/did:plc:other/3xyz")
        .href,
    ).toBe(SELF);
  });
});

describe("articleSourceUrl", () => {
  it("prefers the indexed canonical URL", () => {
    expect(
      articleSourceUrl({
        canonicalUrl: "https://example.blog/hello",
        path: "/ignored",
        publication: { url: "https://other.blog" },
      }),
    ).toBe("https://example.blog/hello");
  });

  it("derives the article's URL from the publication and its path", () => {
    expect(
      articleSourceUrl({
        canonicalUrl: null,
        path: "posts/hello",
        publication: { url: "https://example.blog/" },
      }),
    ).toBe("https://example.blog/posts/hello");
  });

  it("returns nothing rather than canonicalizing to a publication root", () => {
    // `articlePublicationUrl` would answer `https://example.blog` here, which
    // is fine to open but would claim the article duplicates a home page.
    expect(
      articleSourceUrl({
        canonicalUrl: null,
        path: null,
        publication: { url: "https://example.blog" },
      }),
    ).toBeNull();
    expect(
      articleSourceUrl({
        canonicalUrl: null,
        path: "/posts/hello",
        publication: null,
      }),
    ).toBeNull();
  });
});
