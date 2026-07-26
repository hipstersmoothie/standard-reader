import { describe, expect, it } from "vitest";

import { buildRenderTree } from "../build";
import { STRUCTURED_BLOCK_FORMATS } from "../document/content-formats";
import {
  isMarkpubFormat,
  MARKPUB_MARKDOWN,
  MARKPUB_TEXT,
  markpubBlocks,
  prepareMarkpubMarkdown,
} from "../document/structured-content/markpub";
import { segmentInline } from "../inline";
import type { BlockNode, InlineNode } from "../nodes";
import type { StandardSiteDocument } from "../types";

/** An `at.markpub.markdown` document wrapping a markdown body. */
function markpubDoc(
  markdown: string,
  extra: {
    facets?: Array<unknown>;
    lenses?: Array<unknown>;
    flavor?: string;
    extensions?: Array<string>;
    frontMatter?: Array<unknown>;
  } = {},
): StandardSiteDocument {
  const { facets, lenses, ...meta } = extra;
  return {
    authorDid: "did:plc:testauthor",
    content: {
      $type: MARKPUB_MARKDOWN,
      text: { $type: MARKPUB_TEXT, facets, lenses, markdown },
      ...meta,
    },
  };
}

/** A facet over a UTF-8 byte range carrying one Markpub feature. */
function facet(
  byteStart: number,
  byteEnd: number,
  $type: string,
  extra: Record<string, unknown> = {},
) {
  return { features: [{ $type, ...extra }], index: { byteEnd, byteStart } };
}

const types = (nodes: Array<BlockNode>) => nodes.map((node) => node.type);

/** The rich text of a node that carries one (`button.text` is a plain string). */
const richText = (node: BlockNode | undefined) =>
  node && "text" in node && typeof node.text !== "string"
    ? node.text
    : undefined;

const plaintext = (node: BlockNode | undefined) => richText(node)?.plaintext;

/** Every mark applied anywhere in a rich-text run. */
function marks(node: BlockNode): Array<string> {
  const text = richText(node);
  if (!text) return [];
  const out: Array<string> = [];
  const walk = (inline: Array<InlineNode>) => {
    for (const child of inline) {
      if (child.type === "mark") {
        out.push(child.mark);
        walk(child.children);
      } else if (child.type === "link" || child.type === "mention") {
        walk(child.children);
      }
    }
  };
  walk(segmentInline(text));
  return out;
}

describe("markpub — format registry", () => {
  it("registers itself as a structured content format", () => {
    expect(isMarkpubFormat(MARKPUB_MARKDOWN)).toBe(true);
    expect(isMarkpubFormat(MARKPUB_TEXT)).toBe(true);
    expect(isMarkpubFormat("site.standard.content.markdown")).toBe(false);
    expect(isMarkpubFormat(null)).toBe(false);
    expect(STRUCTURED_BLOCK_FORMATS).toContain(MARKPUB_MARKDOWN);
  });

  it("reads the format from contentFormat when the record omits $type", () => {
    const blocks = markpubBlocks(
      { text: { markdown: "hello" } },
      MARKPUB_MARKDOWN,
    );
    expect(blocks).toEqual([{ kind: "text", text: { plaintext: "hello" } }]);
  });

  it("returns null for a non-markpub payload or an empty body", () => {
    expect(markpubBlocks({ $type: "pub.leaflet.content" })).toBeNull();
    expect(markpubBlocks(markpubDoc("   ").content)).toBeNull();
  });
});

describe("buildRenderTree — markpub", () => {
  it("parses the markdown body onto the unified vocabulary", () => {
    const tree = buildRenderTree(
      markpubDoc(
        "# Title\n\nA paragraph with **bold** text.\n\n1. one\n2. two\n\n> quoted\n\n---\n",
      ),
    );
    expect(tree?.format).toBe(MARKPUB_MARKDOWN);
    expect(types(tree?.children ?? [])).toEqual([
      "heading",
      "paragraph",
      "orderedList",
      "blockquote",
      "horizontalRule",
    ]);
    expect(marks(tree?.children[1] as BlockNode)).toContain("strong");
  });

  it("accepts a bare markdown string under `text`", () => {
    const tree = buildRenderTree({
      content: { $type: MARKPUB_MARKDOWN, text: "just text" },
    });
    expect(types(tree?.children ?? [])).toEqual(["paragraph"]);
  });

  it("honors the commonmark flavor by dropping GFM syntax", () => {
    const gfm = buildRenderTree(markpubDoc("| a | b |\n| - | - |\n| 1 | 2 |"));
    expect(types(gfm?.children ?? [])).toEqual(["table"]);

    const commonmark = buildRenderTree(
      markpubDoc("| a | b |\n| - | - |\n| 1 | 2 |", { flavor: "commonmark" }),
    );
    expect(types(commonmark?.children ?? [])).toEqual(["paragraph"]);
  });

  it("strips YAML front matter when declared", () => {
    const body = "---\ntitle: Hi\n---\n\nBody text.";
    // Undeclared front matter is left alone — it is part of the body.
    expect(prepareMarkpubMarkdown(markpubDoc(body).content)?.body).toContain(
      "title: Hi",
    );
    expect(
      prepareMarkpubMarkdown(markpubDoc(body, { frontMatter: [{}] }).content)
        ?.body,
    ).toBe("Body text.");
    expect(
      prepareMarkpubMarkdown(markpubDoc(body, { extensions: ["YAML"] }).content)
        ?.body,
    ).toBe("Body text.");
  });
});

describe("markpub — facets", () => {
  it("turns a header facet into a real heading block", () => {
    const tree = buildRenderTree(
      markpubDoc("Chapter one\n\nBody.", {
        facets: [
          facet(0, 11, "at.markpub.facets.baseFormatting#header", { level: 3 }),
        ],
      }),
    );
    const [heading] = tree?.children ?? [];
    expect(heading).toMatchObject({ level: 3, type: "heading" });
    expect(plaintext(heading)).toBe("Chapter one");
  });

  it("turns a strong facet into a bold run even without markdown syntax", () => {
    const tree = buildRenderTree(
      markpubDoc("say it loud", {
        facets: [facet(4, 6, "at.markpub.facets.baseFormatting#strong")],
      }),
    );
    expect(marks(tree?.children[0] as BlockNode)).toEqual(["strong"]);
  });

  it("maps block facets: horizontal rules, raw passthrough, front matter", () => {
    const rule = buildRenderTree(
      markpubDoc("above\n***\nbelow", {
        facets: [facet(6, 9, "at.markpub.facets.baseBlocks#horizontalRule")],
      }),
    );
    expect(types(rule?.children ?? [])).toEqual([
      "paragraph",
      "horizontalRule",
      "paragraph",
    ]);

    const raw = buildRenderTree(
      markpubDoc("keep *this*", {
        facets: [facet(5, 11, "at.markpub.facets.baseBlocks#raw")],
      }),
    );
    expect(marks(raw?.children[0] as BlockNode)).toEqual(["emphasis"]);

    const stripped = buildRenderTree(
      markpubDoc("---\ntitle: Hi\n---\nBody.", {
        facets: [
          facet(0, 17, "at.markpub.facets.baseBlocks#yaml-front-matter"),
        ],
      }),
    );
    expect(types(stripped?.children ?? [])).toEqual(["paragraph"]);
  });

  it("applies byte offsets over multi-byte text", () => {
    // Each Hangul syllable is 3 UTF-8 bytes, so "수랕 이나와" spans 16 bytes.
    const tree = buildRenderTree(
      markpubDoc("수랕 이나와\n\nBody.", {
        facets: [
          facet(0, 16, "at.markpub.facets.baseFormatting#header", { level: 2 }),
        ],
      }),
    );
    const [heading] = tree?.children ?? [];
    expect(heading).toMatchObject({ level: 2, type: "heading" });
    expect(plaintext(heading)).toBe("수랕 이나와");
  });

  it("normalizes publisher-specific facet types through lenses", () => {
    const tree = buildRenderTree(
      markpubDoc("Chapter one\n\nBody.", {
        facets: [facet(0, 11, "com.example.myFacets#bigTitle", { level: 4 })],
        lenses: [
          {
            facets: [
              { $type: "at.markpub.facets.baseFormatting#header" },
              { $type: "com.example.myFacets#bigTitle" },
            ],
          },
        ],
      }),
    );
    expect(tree?.children[0]).toMatchObject({ level: 4, type: "heading" });
  });

  it("leaves ranges alone when no facet feature maps to markdown", () => {
    const tree = buildRenderTree(
      markpubDoc("a link", {
        facets: [
          facet(2, 6, "at.markpub.facets.baseFormatting#link", {
            uri: "https://example.com",
          }),
        ],
      }),
    );
    expect(plaintext(tree?.children[0])).toBe("a link");
  });
});
