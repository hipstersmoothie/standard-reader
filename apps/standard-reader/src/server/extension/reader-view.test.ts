import { describe, expect, it } from "vitest";

import { readCookieFromRequest, withExplicitReaderView } from "./reader-view";
import type { ExtensionResolveArticle } from "./types";

const ARTICLE: ExtensionResolveArticle = {
  kind: "article",
  documentUri: "at://did:plc:abc/site.standard.document/3kabc",
  title: "An article",
  publicationUri: null,
  publicationName: null,
  publicationHandle: null,
  publicationIconUrl: null,
  publicationOwnerAvatarUrl: null,
  publicationSubscriberCount: null,
  publicationReaderUrl: null,
  publishedAt: null,
  readingMinutes: null,
  authorName: null,
  authorHandle: null,
  authorAvatarUrl: null,
  readerUrl: "https://standard-reader.app/a/did%3Aplc%3Aabc/3kabc",
  canonicalUrl: "https://example.com/post",
  hasRenderableBody: true,
  themeBackground: null,
  themeForeground: null,
  themeAccent: null,
  themeAccentForeground: null,
  recommendCount: 0,
  commentCount: 0,
};

describe("withExplicitReaderView", () => {
  it("asks for the reading view when the reader opens links externally", () => {
    expect(withExplicitReaderView(ARTICLE, true).readerUrl).toBe(
      "https://standard-reader.app/a/did%3Aplc%3Aabc/3kabc?view=reader",
    );
  });

  it("leaves the URL alone for readers who open links in the reader", () => {
    // `view=reader` would also skip the magazine / comic redirects they want.
    expect(withExplicitReaderView(ARTICLE, false)).toBe(ARTICLE);
  });

  it("does not touch publication results", () => {
    const publication = {
      kind: "publication" as const,
      publicationUri: "at://did:plc:abc/site.standard.publication/3kpub",
      name: "A publication",
      description: null,
      handle: null,
      iconUrl: null,
      ownerAvatarUrl: null,
      subscriberCount: null,
      readerUrl: "https://standard-reader.app/p/did%3Aplc%3Aabc/3kpub",
      siteUrl: null,
      themeBackground: null,
      themeForeground: null,
      themeAccent: null,
      themeAccentForeground: null,
    };
    expect(withExplicitReaderView(publication, true)).toBe(publication);
  });
});

describe("readCookieFromRequest", () => {
  it("finds a cookie among others", () => {
    const request = new Request("https://standard-reader.app/", {
      headers: { cookie: "a=1; standard-reader-open-links=external; b=2" },
    });
    expect(readCookieFromRequest(request, "standard-reader-open-links")).toBe(
      "external",
    );
  });

  it("returns undefined with no cookie header", () => {
    const request = new Request("https://standard-reader.app/");
    expect(
      readCookieFromRequest(request, "standard-reader-open-links"),
    ).toBeUndefined();
  });
});
