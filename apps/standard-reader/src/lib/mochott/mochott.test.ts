import { describe, expect, it } from "vitest";

import { hasRenderableArticleBody } from "#/lib/document/renderable";
import { documentSearchText } from "#/lib/document/search-text";

import { mochottPlaintext, mochottRenderableBlocks } from "./plaintext";
import { MOCHOTT_ARTICLE, mochottArticleContent } from "./types";

/** A `site.mochott.article` record with a TipTap body. */
function article(extra: Record<string, unknown> = {}) {
  return {
    $type: MOCHOTT_ARTICLE,
    content: {
      content: [
        {
          attrs: { level: 2 },
          content: [{ text: "A heading", type: "text" }],
          type: "heading",
        },
        {
          attrs: { textAlign: null },
          content: [
            { text: "Body ", type: "text" },
            { marks: [{ type: "bold" }], text: "text", type: "text" },
          ],
          type: "paragraph",
        },
      ],
      type: "doc",
    },
    createdAt: "2026-07-01T00:00:00.000Z",
    profile: "at://did:plc:author/site.mochott.profile/self",
    title: "A post",
    ...extra,
  };
}

describe("mochottArticleContent", () => {
  it("stamps the record's $type so the format survives without the column", () => {
    const content = mochottArticleContent({ ...article(), $type: undefined });
    expect(content).toMatchObject({ $type: MOCHOTT_ARTICLE });
  });

  it("rejects a record with no TipTap body", () => {
    expect(mochottArticleContent({ title: "no body" })).toBeNull();
    expect(
      mochottArticleContent({ content: { content: [], type: "doc" } }),
    ).toBeNull();
    expect(
      mochottArticleContent({ content: { type: "paragraph" } }),
    ).toBeNull();
    expect(mochottArticleContent(null)).toBeNull();
  });
});

describe("mochott body text", () => {
  it("parses blocks through renderer-core", () => {
    expect(
      mochottRenderableBlocks(article()).map((block) => block.kind),
    ).toEqual(["heading", "text"]);
  });

  it("prefers the record's own textContent", () => {
    expect(mochottPlaintext(article({ textContent: "Indexed text" }))).toBe(
      "Indexed text",
    );
  });

  it("falls back to walking the parsed blocks", () => {
    expect(mochottPlaintext(article())).toBe("A heading\n\nBody text");
  });

  it("has no text (and no blocks) for a bodyless record", () => {
    expect(mochottPlaintext({ $type: MOCHOTT_ARTICLE })).toBe("");
    expect(mochottRenderableBlocks({ $type: MOCHOTT_ARTICLE })).toEqual([]);
  });
});

describe("document integration", () => {
  it("counts as a renderable body", () => {
    expect(
      hasRenderableArticleBody({
        contentJson: article(),
        contentFormat: MOCHOTT_ARTICLE,
      }),
    ).toBe(true);
    expect(
      hasRenderableArticleBody({
        contentJson: { $type: MOCHOTT_ARTICLE },
        contentFormat: MOCHOTT_ARTICLE,
      }),
    ).toBe(false);
  });

  it("contributes its text to the document search blob", () => {
    const text = documentSearchText({
      textContent: null,
      contentJson: article({ textContent: "Indexed text" }),
      contentFormat: MOCHOTT_ARTICLE,
    });
    expect(text).toBe("Indexed text");
  });

  it("resolves the format from $type when the column is missing", () => {
    expect(
      hasRenderableArticleBody({ contentJson: article(), contentFormat: null }),
    ).toBe(true);
  });
});
