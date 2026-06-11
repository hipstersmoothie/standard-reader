import { describe, expect, it } from "vitest";

import {
  applyMarkpubFacets,
  normalizeMarkpubFacets,
} from "#/lib/markpub/facets";
import {
  markpubPlaintext,
  prepareMarkpubMarkdown,
} from "#/lib/markpub/markdown";
import { parseMarkpubContent } from "#/lib/markpub/parse";
import { MARKPUB_MARKDOWN } from "#/lib/markpub/types";

const minimalMarkpub = {
  $type: MARKPUB_MARKDOWN,
  text: {
    $type: "at.markpub.text",
    markdown: "# Hello World\nThis is a sample markdown text.",
  },
};

describe("parseMarkpubContent", () => {
  it("parses minimal at.markpub.markdown", () => {
    const doc = parseMarkpubContent(minimalMarkpub);
    expect(doc?.markdown).toBe(
      "# Hello World\nThis is a sample markdown text.",
    );
    expect(doc?.flavor).toBe("gfm");
  });

  it("reads flavor and extensions from the record", () => {
    const doc = parseMarkpubContent({
      ...minimalMarkpub,
      flavor: "commonmark",
      extensions: ["LaTeX", "YAML"],
    });
    expect(doc?.flavor).toBe("commonmark");
    expect(doc?.extensions).toEqual(["LaTeX", "YAML"]);
  });
});

describe("prepareMarkpubMarkdown", () => {
  it("strips YAML front matter when declared", () => {
    const prepared = prepareMarkpubMarkdown({
      $type: MARKPUB_MARKDOWN,
      extensions: ["YAML"],
      text: {
        $type: "at.markpub.text",
        markdown: "---\ntitle: Hi\n---\n\nBody copy.",
      },
    });
    expect(prepared?.body).toBe("Body copy.");
  });

  it("converts header facets to HTML without hash markers", () => {
    const prepared = prepareMarkpubMarkdown({
      $type: MARKPUB_MARKDOWN,
      text: {
        $type: "at.markpub.text",
        markdown: "# Hello World\n\nParagraph.",
        facets: [
          {
            index: { byteStart: 0, byteEnd: 13 },
            features: [
              {
                $type: "at.markpub.facets.baseFormatting#header",
                level: 1,
              },
              { $type: "at.markpub.facets.baseFormatting#idify" },
            ],
          },
        ],
      },
    });
    expect(prepared?.body).toContain('<h1 id="hello-world">Hello World</h1>');
    expect(prepared?.body).toContain("Paragraph.");
  });

  it("enables math when LaTeX extension is declared", () => {
    const prepared = prepareMarkpubMarkdown({
      ...minimalMarkpub,
      extensions: ["LaTeX"],
    });
    expect(prepared?.enableMath).toBe(true);
  });

  it("uses commonmark flavor without GFM-only plugins", () => {
    const prepared = prepareMarkpubMarkdown({
      ...minimalMarkpub,
      flavor: "commonmark",
    });
    expect(prepared?.flavor).toBe("commonmark");
  });
});

describe("applyMarkpubFacets", () => {
  it("removes yaml-front-matter facet ranges", () => {
    const markdown = "---\ntitle: Hi\n---\n\nBody.";
    const result = applyMarkpubFacets(markdown, [
      {
        index: { byteStart: 0, byteEnd: 17 },
        features: [{ $type: "at.markpub.facets.baseBlocks#yaml-front-matter" }],
      },
    ]);
    expect(result).toBe("Body.");
  });
});

describe("normalizeMarkpubFacets", () => {
  it("maps lens equivalents to a canonical facet kind", () => {
    const facets = normalizeMarkpubFacets(
      [
        {
          index: { byteStart: 0, byteEnd: 6 },
          features: [{ $type: "at.markpub.facets.baseFormatting#strong" }],
        },
      ],
      [
        {
          facets: [
            { $type: "at.markpub.facets.baseFormatting#strong" },
            { $type: "pub.leaflet.richtext.facet#bold" },
          ],
        },
      ],
    );
    expect(facets[0]?.features[0]?.$type).toBe(
      "at.markpub.facets.baseFormatting#strong",
    );
  });
});

describe("markpubPlaintext", () => {
  it("returns processed body text for search extraction", () => {
    expect(markpubPlaintext(minimalMarkpub)).toContain("Hello World");
  });
});
