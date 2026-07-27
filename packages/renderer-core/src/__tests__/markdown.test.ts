import { describe, expect, it } from "vitest";

import { buildRenderTree } from "../build.js";
import {
  isMarkdownFormat,
  markdownText,
  MARKDOWN_FORMATS,
} from "../document/structured-content/markdown.js";
import { segmentInline } from "../inline.js";
import type { BlockNode } from "../nodes.js";
import type { StandardSiteDocument } from "../types.js";

/** A document whose body is a display-math block between two paragraphs. */
function build_math() {
  return markdownDoc(
    ["Before", "", "$$", "E = mc^2", "$$", "", "After"].join("\n"),
  );
}

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

  it("reads a [!TYPE] blockquote as a callout", () => {
    const tree = build(markdownDoc("> [!NOTE]\n> Something worth knowing."));
    const callout = tree.children[0] as Extract<BlockNode, { type: "callout" }>;
    expect(callout.type).toBe("callout");
    expect(callout.kind).toBe("note");
    expect(callout.text.plaintext).toBe("Something worth knowing.");
  });

  it("normalizes callout aliases and reads the fold and title", () => {
    const tree = build(
      markdownDoc("> [!caution]- Heads up\n> Body here.\n>\n> More body."),
    );
    const callout = tree.children[0] as Extract<BlockNode, { type: "callout" }>;
    // `caution` renders red on GitHub, so it maps to the danger family.
    expect(callout.kind).toBe("danger");
    expect(callout.title).toBe("Heads up");
    expect(callout.fold).toBe("closed");
    expect(callout.text.plaintext).toBe("Body here.\nMore body.");
  });

  it("leaves an ordinary blockquote alone", () => {
    const tree = build(markdownDoc("> Just a quote."));
    expect(tree.children.map(kinds)).toEqual(["blockquote"]);
  });

  it("collects GFM footnotes and numbers them by first reference", () => {
    const tree = build(
      markdownDoc(
        "A claim[^b] and another[^a].\n\n[^a]: Second note.\n[^b]: First note.",
      ),
    );

    // Numbered by the order a reader meets them, not by definition order.
    expect(tree.footnotes).toEqual([
      { id: "b", number: 1, text: { plaintext: "First note." } },
      { id: "a", number: 2, text: { plaintext: "Second note." } },
    ]);
    expect(tree.footnoteNumbers.get("b")).toBe(1);

    const paragraph = tree.children[0] as Extract<
      BlockNode,
      { type: "paragraph" }
    >;
    const inline = segmentInline(paragraph.text, tree.footnoteNumbers);
    expect(inline.filter((node) => node.type === "footnoteRef")).toEqual([
      { type: "footnoteRef", footnoteId: "b", number: 1 },
      { type: "footnoteRef", footnoteId: "a", number: 2 },
    ]);
  });

  it("drops a footnote definition nothing refers to", () => {
    const tree = build(
      markdownDoc("Body text.\n\n[^orphan]: Nobody cites me."),
    );
    expect(tree.footnotes).toEqual([]);
    expect(tree.children.map(kinds)).toEqual(["paragraph"]);
  });

  it("keeps a raw HTML block instead of deleting it", () => {
    // Previously dropped outright, which quietly removed real content from a
    // document. Rendering it is the host's call; carrying it is not.
    const tree = build(
      markdownDoc('Before\n\n<div class="x">raw</div>\n\nAfter'),
    );
    expect(tree.children.map(kinds)).toEqual([
      "paragraph",
      "html",
      "paragraph",
    ]);
    const html = tree.children[1] as Extract<BlockNode, { type: "html" }>;
    expect(html.html).toBe('<div class="x">raw</div>');
  });

  it("maps a display-math block to a math node", () => {
    const tree = build(build_math());
    expect(tree.children.map(kinds)).toEqual([
      "paragraph",
      "math",
      "paragraph",
    ]);
    const math = tree.children[1] as Extract<BlockNode, { type: "math" }>;
    expect(math.tex).toBe("E = mc^2");
  });

  it("keeps inline math as its source, having nowhere else to put it", () => {
    const tree = build(markdownDoc("Einstein said $E = mc^2$ once."));
    const paragraph = tree.children[0] as Extract<
      BlockNode,
      { type: "paragraph" }
    >;
    expect(paragraph.text.plaintext).toBe("Einstein said $E = mc^2$ once.");
  });

  it("splits a paragraph around an inline image rather than dropping it", () => {
    const tree = build(
      markdownDoc("Text with an ![a cat](https://x.test/i.png) image."),
    );
    expect(tree.children.map(kinds)).toEqual([
      "paragraph",
      "image",
      "paragraph",
    ]);
    const image = tree.children[1] as Extract<BlockNode, { type: "image" }>;
    expect(image.src).toBe("https://x.test/i.png");
    expect(image.alt).toBe("a cat");
  });

  it("still lifts a standalone image into a single block", () => {
    const tree = build(markdownDoc("![just a cat](https://x.test/i.png)"));
    expect(tree.children.map(kinds)).toEqual(["image"]);
  });

  it("keeps nested lists nested, to any depth", () => {
    // Nested branches used to be dropped outright, so a document could lose
    // whole passages between the parse and the render with nothing reported.
    const tree = build(
      markdownDoc(
        [
          "- outer one",
          "  - inner a",
          "  - inner b",
          "    - deeper still",
          "- outer two",
        ].join("\n"),
      ),
    );

    const list = tree.children[0] as Extract<BlockNode, { type: "bulletList" }>;
    expect(list.type).toBe("bulletList");
    expect(list.items.map((item) => item.runs[0]?.plaintext)).toEqual([
      "outer one",
      "outer two",
    ]);

    const inner = list.items[0]?.children[0] as Extract<
      BlockNode,
      { type: "bulletList" }
    >;
    expect(inner.items.map((item) => item.runs[0]?.plaintext)).toEqual([
      "inner a",
      "inner b",
    ]);

    const deepest = inner.items[1]?.children[0] as Extract<
      BlockNode,
      { type: "bulletList" }
    >;
    expect(deepest.items[0]?.runs[0]?.plaintext).toBe("deeper still");

    // A leaf item carries no phantom child list.
    expect(list.items[1]?.children).toEqual([]);
  });

  it("nests an ordered list under a bullet and keeps its start", () => {
    // The blank line is load-bearing: CommonMark only lets an ordered list
    // interrupt a paragraph when it starts at 1, so `3.` needs the break to be
    // a list at all rather than a lazy continuation of "steps".
    const tree = build(
      markdownDoc(["- steps", "", "  3. third", "  4. fourth"].join("\n")),
    );

    const list = tree.children[0] as Extract<BlockNode, { type: "bulletList" }>;
    const nested = list.items[0]?.children[0] as Extract<
      BlockNode,
      { type: "orderedList" }
    >;
    expect(nested.type).toBe("orderedList");
    expect(nested.start).toBe(3);
    expect(nested.items.map((item) => item.runs[0]?.plaintext)).toEqual([
      "third",
      "fourth",
    ]);
  });

  it("keeps a branch whose parent item has no text of its own", () => {
    // An item that is only a nested list still has to hold its children,
    // rather than vanishing and taking them with it.
    const tree = build(markdownDoc(["-", "  - orphaned child"].join("\n")));

    const list = tree.children[0] as Extract<BlockNode, { type: "bulletList" }>;
    expect(list.items[0]?.runs).toEqual([]);
    const inner = list.items[0]?.children[0] as Extract<
      BlockNode,
      { type: "bulletList" }
    >;
    expect(inner.items[0]?.runs[0]?.plaintext).toBe("orphaned child");
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
