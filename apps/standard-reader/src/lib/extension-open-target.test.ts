import { describe, expect, it } from "vitest";

import { articleOpenTarget } from "./extension-open-target";

const ARTICLE_URL = "https://standard-reader.app/a/did%3Aplc%3Aabc/3kabc";
const PUBLICATION_URL = "https://standard-reader.app/p/did%3Aplc%3Aabc/3kpub";

describe("articleOpenTarget", () => {
  it("opens the article in the reader when its body renders in-app", () => {
    expect(
      articleOpenTarget({
        readerUrl: ARTICLE_URL,
        hasRenderableBody: true,
        publicationReaderUrl: PUBLICATION_URL,
      }),
    ).toEqual({ url: ARTICLE_URL, destination: "article" });
  });

  it("treats a payload without hasRenderableBody as renderable", () => {
    expect(
      articleOpenTarget({
        readerUrl: ARTICLE_URL,
        publicationReaderUrl: null,
      }),
    ).toEqual({ url: ARTICLE_URL, destination: "article" });
  });

  it("opens the publication page when the article only renders on its own site", () => {
    // `/a/…` would redirect straight back to the page the reader is on.
    expect(
      articleOpenTarget({
        readerUrl: ARTICLE_URL,
        hasRenderableBody: false,
        publicationReaderUrl: PUBLICATION_URL,
      }),
    ).toEqual({ url: PUBLICATION_URL, destination: "publication" });
  });

  it("has nowhere to go for an unrenderable article with no publication", () => {
    expect(
      articleOpenTarget({
        readerUrl: ARTICLE_URL,
        hasRenderableBody: false,
        publicationReaderUrl: null,
      }),
    ).toBeNull();
  });
});
