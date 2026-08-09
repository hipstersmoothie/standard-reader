import { describe, expect, it } from "vitest";

import { buildRenderTree } from "../build.js";
import { STRUCTURED_BLOCK_FORMATS } from "../document/content-formats.js";
import {
  GUTENBERG_CONTENT,
  gutenbergBlocks,
  gutenbergInlineText,
} from "../document/structured-content/gutenberg.js";
import { segmentInline } from "../inline.js";
import type { BlockNode, InlineNode } from "../nodes.js";
import type { StandardSiteDocument } from "../types.js";

interface RawBlock {
  name: string;
  attributes?: Record<string, unknown>;
  innerBlocks?: Array<RawBlock>;
}

function gutenbergDoc(...blocks: Array<RawBlock>): StandardSiteDocument {
  return {
    authorDid: "did:plc:testauthor",
    content: { $type: GUTENBERG_CONTENT, blocks, version: 1 },
  };
}

function paragraph(content: string, extra: Record<string, unknown> = {}) {
  return { attributes: { content, ...extra }, name: "core/paragraph" };
}

const types = (nodes: Array<BlockNode>) => nodes.map((node) => node.type);

/** The rich text of a node that carries one (`button.text` is a plain string). */
const richText = (node: BlockNode | undefined) =>
  node && "text" in node && typeof node.text !== "string"
    ? node.text
    : undefined;

const plaintext = (node: BlockNode | undefined) => richText(node)?.plaintext;

const inline = (node: BlockNode | undefined): Array<InlineNode> => {
  const text = richText(node);
  return text ? segmentInline(text) : [];
};

describe("gutenberg — format registry", () => {
  it("registers itself as a structured content format", () => {
    expect(STRUCTURED_BLOCK_FORMATS).toContain(GUTENBERG_CONTENT);
    expect(gutenbergBlocks({ $type: "pub.leaflet.content" })).toBeNull();
    expect(
      gutenbergBlocks({ $type: GUTENBERG_CONTENT, blocks: [] }),
    ).toBeNull();
  });

  it("reads the format from contentFormat when the record omits $type", () => {
    const blocks = gutenbergBlocks(
      { blocks: [paragraph("hi")] },
      GUTENBERG_CONTENT,
    );
    expect(blocks).toEqual([{ kind: "text", text: { plaintext: "hi" } }]);
  });
});

describe("buildRenderTree — gutenberg blocks", () => {
  it("maps the core block set onto the unified vocabulary", () => {
    const tree = buildRenderTree(
      gutenbergDoc(
        paragraph("Hello."),
        { attributes: { content: "Title", level: 3 }, name: "core/heading" },
        {
          innerBlocks: [
            { attributes: { content: "one" }, name: "core/list-item" },
            { attributes: { content: "two" }, name: "core/list-item" },
          ],
          name: "core/list",
        },
        {
          innerBlocks: [paragraph("quoted")],
          name: "core/quote",
        },
        { attributes: { content: "const x = 1" }, name: "core/code" },
        { name: "core/separator" },
      ),
    );
    expect(tree?.format).toBe(GUTENBERG_CONTENT);
    expect(types(tree?.children ?? [])).toEqual([
      "paragraph",
      "heading",
      "bulletList",
      "blockquote",
      "code",
      "horizontalRule",
    ]);
    expect(tree?.children[1]).toMatchObject({ level: 3 });
  });

  it("numbers ordered lists and reads legacy `values` markup", () => {
    const ordered = buildRenderTree(
      gutenbergDoc({
        attributes: { ordered: true, start: 3 },
        innerBlocks: [
          { attributes: { content: "third" }, name: "core/list-item" },
        ],
        name: "core/list",
      }),
    );
    expect(ordered?.children[0]).toMatchObject({
      start: 3,
      type: "orderedList",
    });

    const legacy = buildRenderTree(
      gutenbergDoc({
        attributes: { values: "<li>alpha</li><li>beta</li>" },
        name: "core/list",
      }),
    );
    const [list] = legacy?.children ?? [];
    expect(list?.type).toBe("bulletList");
    expect(
      list?.type === "bulletList"
        ? list.items.map((item) => item.runs[0]?.plaintext)
        : [],
    ).toEqual(["alpha", "beta"]);
  });

  it("carries image url, alt, and caption", () => {
    const tree = buildRenderTree(
      gutenbergDoc({
        attributes: {
          alt: "A cat",
          caption: "Photo by <em>someone</em>",
          url: "https://example.com/cat.jpg",
        },
        name: "core/image",
      }),
    );
    expect(tree?.children[0]).toEqual({
      alt: "A cat",
      aspectRatio: 16 / 9,
      caption: "Photo by someone",
      source: { externalSrc: "https://example.com/cat.jpg" },
      src: "https://example.com/cat.jpg",
      type: "image",
    });
  });

  it("maps embeds to a website card and drops sourceless images", () => {
    const tree = buildRenderTree(
      gutenbergDoc(
        { attributes: { url: "https://example.com/post" }, name: "core/embed" },
        { attributes: { alt: "no source" }, name: "core/image" },
      ),
    );
    expect(tree?.children).toEqual([
      { src: "https://example.com/post", type: "website" },
    ]);
  });

  it("keeps the body of unknown blocks and flattens layout wrappers", () => {
    const unknown = buildRenderTree(
      gutenbergDoc({
        attributes: { content: "still text" },
        name: "core/verse",
      }),
    );
    expect(plaintext(unknown?.children[0])).toBe("still text");

    const grouped = buildRenderTree(
      gutenbergDoc({
        innerBlocks: [paragraph("inside a group")],
        name: "core/group",
      }),
    );
    expect(plaintext(grouped?.children[0])).toBe("inside a group");
  });
});

describe("gutenberg — inline HTML", () => {
  it("turns inline markup into marks, links, and line breaks", () => {
    const nodes = inline(
      buildRenderTree(
        gutenbergDoc(
          paragraph(
            'A <strong>bold</strong> <em>italic</em> <code>x</code> <a href="https://example.com">link</a><br>next',
          ),
        ),
      )?.children[0],
    );
    expect(nodes).toEqual([
      { type: "text", value: "A " },
      {
        children: [{ type: "text", value: "bold" }],
        mark: "strong",
        type: "mark",
      },
      { type: "text", value: " " },
      {
        children: [{ type: "text", value: "italic" }],
        mark: "emphasis",
        type: "mark",
      },
      { type: "text", value: " " },
      { children: [{ type: "text", value: "x" }], mark: "code", type: "mark" },
      { type: "text", value: " " },
      {
        children: [{ type: "text", value: "link" }],
        href: "https://example.com",
        type: "link",
      },
      { type: "lineBreak" },
      { type: "text", value: "next" },
    ]);
  });

  it("keeps a mark and a link on the same run", () => {
    const nodes = inline(
      buildRenderTree(
        gutenbergDoc(
          paragraph('<a href="https://example.com"><strong>go</strong></a>'),
        ),
      )?.children[0],
    );
    // segmentInline composes the link first, then wraps it in the marks.
    expect(nodes).toEqual([
      {
        children: [
          {
            children: [{ type: "text", value: "go" }],
            href: "https://example.com",
            type: "link",
          },
        ],
        mark: "strong",
        type: "mark",
      },
    ]);
  });

  it("decodes entities and emits no markup", () => {
    const text = gutenbergInlineText(
      "5 &lt;em&gt;not italic&lt;/em&gt; &amp; caf&#233;&nbsp;done",
    );
    expect(text.plaintext).toBe("5 <em>not italic</em> & café done");
    expect(text.facets).toBeUndefined();
  });

  it("drops script, style, and comment subtrees", () => {
    const text = gutenbergInlineText(
      "before<script>alert(1)</script><style>p{}</style><!-- hi -->after",
    );
    expect(text.plaintext).toBe("beforeafter");
  });

  it("survives unbalanced and unknown tags", () => {
    const text = gutenbergInlineText(
      "<strong>open <span>span</strong> tail</p>",
    );
    expect(text.plaintext).toBe("open span tail");
  });
});
