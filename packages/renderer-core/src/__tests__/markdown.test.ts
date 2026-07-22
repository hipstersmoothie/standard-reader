import { describe, expect, it } from "vitest";

import { buildRenderTree } from "../build";
import {
  isMarkdownFormat,
  markdownText,
  MARKDOWN_FORMATS,
} from "../document/structured-content/markdown";
import { segmentInline } from "../inline";
import type { BlockNode } from "../nodes";
import type { StandardSiteDocument } from "../types";

/** buildRenderTree, asserting a non-null tree so tests can use it directly. */
function build(doc: StandardSiteDocument) {
  const tree = buildRenderTree(doc);
  if (tree === null) throw new Error("expected a render tree");
  return tree;
}

/** A `site.standard.content.markdown` document wrapping raw markdown. */
function markdownDoc(text: string): StandardSiteDocument {
  return {
    authorDid: "did:plc:testauthor",
    content: { $type: "site.standard.content.markdown", text },
    contentFormat: "site.standard.content.markdown",
  };
}

const kinds = (n: BlockNode) => n.type;

describe("markdown — format registry", () => {
  it("recognizes the canonical and third-party markdown formats", () => {
    expect(isMarkdownFormat("site.standard.content.markdown")).toBe(true);
    expect(isMarkdownFormat("pub.lemma.blog.entry")).toBe(true);
    expect(isMarkdownFormat("pub.leaflet.content")).toBe(false);
    expect(isMarkdownFormat(null)).toBe(false);
    expect(MARKDOWN_FORMATS).toContain("pub.lemma.blog.entry");
  });

  it("extracts the body from each format's own field", () => {
    expect(
      markdownText({ $type: "site.standard.content.markdown", text: "hi" }),
    ).toBe("hi");
    // Lemma keeps its body under `content`.
    expect(markdownText({ $type: "pub.lemma.blog.entry", content: "yo" })).toBe(
      "yo",
    );
    // Format can come from contentFormat when the record omits $type.
    expect(markdownText({ markdown: "wtr" }, "app.wtr.content.markdown")).toBe(
      "wtr",
    );
    expect(markdownText({ text: "   " })).toBeNull();
    expect(
      markdownText({ $type: "not.a.markdown.format", text: "x" }),
    ).toBeNull();
  });
});

describe("buildRenderTree — markdown", () => {
  it("maps block structure onto the unified vocabulary", () => {
    const tree = build(
      markdownDoc(
        [
          "# Title",
          "",
          "A paragraph.",
          "",
          "> A quote.",
          "",
          "- one",
          "- two",
          "",
          "```js",
          "const x = 1;",
          "```",
          "",
          "---",
        ].join("\n"),
      ),
    );
    expect(tree.format).toBe("site.standard.content.markdown");
    expect(tree.children.map(kinds)).toEqual([
      "heading",
      "paragraph",
      "blockquote",
      "bulletList",
      "code",
      "horizontalRule",
    ]);
    const heading = tree.children[0] as Extract<BlockNode, { type: "heading" }>;
    expect(heading.level).toBe(1);
    expect(heading.text.plaintext).toBe("Title");
    const code = tree.children[4] as Extract<BlockNode, { type: "code" }>;
    expect(code.language).toBe("js");
    expect(code.code).toBe("const x = 1;");
  });

  it("converts inline emphasis and links into segmentable facets", () => {
    const tree = build(
      markdownDoc("See **bold** and [a link](https://x.test)."),
    );
    const para = tree.children[0] as Extract<BlockNode, { type: "paragraph" }>;
    expect(para.text.plaintext).toBe("See bold and a link.");

    const inline = segmentInline(para.text);
    const strong = inline.find((n) => n.type === "mark" && n.mark === "strong");
    expect(strong).toBeDefined();
    const link = inline.find((n) => n.type === "link");
    expect(link).toMatchObject({ type: "link", href: "https://x.test" });
  });

  it("keeps facet byte offsets aligned across multi-byte text", () => {
    // “café” is 5 UTF-8 bytes; the bold run must start after it, not after 4.
    const tree = build(markdownDoc("café **oui**"));
    const para = tree.children[0] as Extract<BlockNode, { type: "paragraph" }>;
    const inline = segmentInline(para.text);
    const strong = inline.find((n) => n.type === "mark" && n.mark === "strong");
    expect(strong).toBeDefined();
    if (strong?.type === "mark") {
      const child = strong.children[0];
      expect(child?.type === "text" && child.value).toBe("oui");
    }
  });

  it("maps GFM tables and task lists", () => {
    const tree = build(
      markdownDoc(
        [
          "| a | b |",
          "| --- | --- |",
          "| 1 | 2 |",
          "",
          "- [x] done",
          "- [ ] todo",
        ].join("\n"),
      ),
    );
    expect(tree.children.map(kinds)).toEqual(["table", "taskList"]);
    const table = tree.children[0] as Extract<BlockNode, { type: "table" }>;
    expect(table.rows[0]?.[0]?.header).toBe(true);
    expect(table.rows[1]?.[0]?.header).toBe(false);
    const tasks = tree.children[1] as Extract<BlockNode, { type: "taskList" }>;
    expect(tasks.items.map((i) => i.checked)).toEqual([true, false]);
  });

  it("emits a standalone image paragraph as an image block", () => {
    const tree = build(markdownDoc("![alt text](https://img.test/a.png)"));
    const image = tree.children[0] as Extract<BlockNode, { type: "image" }>;
    expect(image.type).toBe("image");
    expect(image.src).toBe("https://img.test/a.png");
    expect(image.alt).toBe("alt text");
  });

  it("returns null for an empty body", () => {
    expect(buildRenderTree(markdownDoc("   \n\n  "))).toBeNull();
  });
});
