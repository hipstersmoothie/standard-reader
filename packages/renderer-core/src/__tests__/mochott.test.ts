import { describe, expect, it } from "vitest";

import { buildRenderTree } from "../build.js";
import { STRUCTURED_BLOCK_FORMATS } from "../document/content-formats.js";
import {
  isMochottFormat,
  MOCHOTT_ARTICLE,
  MOCHOTT_TIPTAP,
  mochottBlocks,
  mochottDocument,
} from "../document/structured-content/mochott.js";
import { segmentInline } from "../inline.js";
import type { BlockNode, InlineNode } from "../nodes.js";
import type { StandardSiteDocument } from "../types.js";

type TiptapNode = Record<string, unknown>;

/** A `site.mochott.article` record wrapping a TipTap body. */
function mochottDoc(...content: Array<TiptapNode>): StandardSiteDocument {
  return {
    authorDid: "did:plc:testauthor",
    content: {
      $type: MOCHOTT_ARTICLE,
      content: { content, type: "doc" },
      createdAt: "2026-07-01T00:00:00.000Z",
      profile: "at://did:plc:testauthor/site.mochott.profile/self",
      title: "A post",
    },
  };
}

function text(value: string, styles?: Array<TiptapNode>): TiptapNode {
  return styles
    ? { marks: styles, text: value, type: "text" }
    : { text: value, type: "text" };
}

function paragraph(...content: Array<TiptapNode>): TiptapNode {
  return { attrs: { textAlign: null }, content, type: "paragraph" };
}

const CID = "bafkreiftehvjvc6cmsp3sjh62l6coav7brcov3m5owpdpv6ppcv42dtqzq";

function image(attrs: Record<string, unknown>): TiptapNode {
  return {
    attrs: { alt: "", height: null, width: null, ...attrs },
    type: "image",
  };
}

function customBlock(
  values: Record<string, unknown>,
  snapshot: Record<string, unknown>,
): TiptapNode {
  return {
    attrs: {
      blockUri: "at://did:plc:testauthor/site.mochott.block/abc",
      snapshot,
      values,
    },
    type: "customBlock",
  };
}

function footnote(content: string): TiptapNode {
  return { attrs: { content }, type: "footnote" };
}

const types = (nodes: Array<BlockNode>) => nodes.map((node) => node.type);

/** The rich text of a node that carries one (`button.text` is a plain string). */
const richText = (node: BlockNode | undefined) =>
  node && "text" in node && typeof node.text !== "string"
    ? node.text
    : undefined;

const plaintext = (node: BlockNode | undefined) => richText(node)?.plaintext;

/** The inline tree of a node's rich text (empty when it carries none). */
function inlineNodes(
  node: BlockNode | undefined,
  footnoteNumbers?: ReadonlyMap<string, number>,
): Array<InlineNode> {
  const value = richText(node);
  return value ? segmentInline(value, footnoteNumbers) : [];
}

/** The nth block, narrowed to the node type it is expected to be. */
function blockAt<T extends BlockNode["type"]>(
  tree: { children: Array<BlockNode> } | null | undefined,
  index: number,
  type: T,
): Extract<BlockNode, { type: T }> {
  const node = tree?.children[index];
  expect(node?.type).toBe(type);
  return node as Extract<BlockNode, { type: T }>;
}

/** Every mark applied anywhere in a rich-text run. */
function marks(node: BlockNode): Array<string> {
  const value = richText(node);
  if (!value) return [];
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
  walk(segmentInline(value));
  return out;
}

describe("mochott — format registry", () => {
  it("registers itself as a structured content format", () => {
    expect(isMochottFormat(MOCHOTT_ARTICLE)).toBe(true);
    expect(isMochottFormat(MOCHOTT_TIPTAP)).toBe(true);
    expect(isMochottFormat("at.markpub.markdown")).toBe(false);
    expect(isMochottFormat(null)).toBe(false);
    expect(STRUCTURED_BLOCK_FORMATS).toContain(MOCHOTT_ARTICLE);
    expect(STRUCTURED_BLOCK_FORMATS).toContain(MOCHOTT_TIPTAP);
  });

  it("accepts the bare TipTap document when the record is not carried", () => {
    const blocks = mochottBlocks(
      { content: [paragraph(text("hello"))], type: "doc" },
      MOCHOTT_TIPTAP,
    );
    expect(blocks).toEqual([{ kind: "text", text: { plaintext: "hello" } }]);
  });

  it("returns null for a foreign payload or an empty body", () => {
    expect(mochottBlocks({ $type: "pub.leaflet.content" })).toBeNull();
    expect(
      mochottBlocks({ $type: MOCHOTT_ARTICLE, title: "no body" }),
    ).toBeNull();
    expect(mochottBlocks(mochottDoc().content)).toBeNull();
    expect(
      mochottBlocks(mochottDoc(paragraph(text("   "))).content),
    ).toBeNull();
  });
});

describe("buildRenderTree — mochott blocks", () => {
  it("maps the TipTap vocabulary onto the unified blocks", () => {
    const tree = buildRenderTree(
      mochottDoc(
        { attrs: { level: 2 }, content: [text("Title")], type: "heading" },
        paragraph(text("Body text.")),
        {
          content: [
            {
              content: [paragraph(text("one"))],
              type: "listItem",
            },
            {
              content: [paragraph(text("two"))],
              type: "listItem",
            },
          ],
          type: "bulletList",
        },
        { content: [paragraph(text("quoted"))], type: "blockquote" },
        {
          attrs: { language: "ts" },
          content: [text("const a = 1;")],
          type: "codeBlock",
        },
        { type: "horizontalRule" },
      ),
    );

    expect(tree?.format).toBe(MOCHOTT_ARTICLE);
    expect(types(tree?.children ?? [])).toEqual([
      "heading",
      "paragraph",
      "bulletList",
      "blockquote",
      "code",
      "horizontalRule",
    ]);
    expect(plaintext(tree?.children[0])).toBe("Title");
    expect(blockAt(tree, 0, "heading").level).toBe(2);
    expect(tree?.children[4]).toEqual({
      type: "code",
      code: "const a = 1;",
      language: "ts",
    });
  });

  it("turns marks and links into facets and joins hard breaks", () => {
    const tree = buildRenderTree(
      mochottDoc(
        paragraph(
          text("plain "),
          text("bold", [{ type: "bold" }]),
          text(" "),
          text("struck", [{ type: "strike" }]),
          { type: "hardBreak" },
          text("linked", [
            {
              attrs: { href: "https://example.com", target: "_blank" },
              type: "link",
            },
          ]),
        ),
      ),
    );

    const node = blockAt(tree, 0, "paragraph");
    expect(plaintext(node)).toBe("plain bold struck\nlinked");
    expect(marks(node)).toEqual(["strong", "strikethrough"]);
    const link = inlineNodes(node).find((inline) => inline.type === "link");
    expect(link).toMatchObject({ href: "https://example.com" });
  });

  it("nests lists under their parent item and keeps an ordered start", () => {
    const tree = buildRenderTree(
      mochottDoc({
        attrs: { start: 3 },
        content: [
          {
            content: [
              paragraph(text("outer")),
              {
                content: [
                  { content: [paragraph(text("inner"))], type: "listItem" },
                ],
                type: "bulletList",
              },
            ],
            type: "listItem",
          },
        ],
        type: "orderedList",
      }),
    );

    const list = blockAt(tree, 0, "orderedList");
    expect(list.start).toBe(3);
    expect(list.items[0]?.runs[0]?.plaintext).toBe("outer");
    expect(list.items[0]?.children[0]?.type).toBe("bulletList");
  });

  it("builds a table with its header row", () => {
    const cell = (value: string, header = false): TiptapNode => ({
      attrs: { colspan: 1, colwidth: null, rowspan: 1 },
      content: [paragraph(text(value))],
      type: header ? "tableHeader" : "tableCell",
    });
    const tree = buildRenderTree(
      mochottDoc({
        content: [
          { content: [cell("h1", true), cell("h2", true)], type: "tableRow" },
          { content: [cell("a"), cell("b")], type: "tableRow" },
        ],
        type: "table",
      }),
    );

    expect(tree?.children[0]).toEqual({
      type: "table",
      rows: [
        [
          { header: true, text: { plaintext: "h1" } },
          { header: true, text: { plaintext: "h2" } },
        ],
        [
          { header: false, text: { plaintext: "a" } },
          { header: false, text: { plaintext: "b" } },
        ],
      ],
    });
  });

  it("keeps an unrecognized node as an unknown block", () => {
    const tree = buildRenderTree(
      mochottDoc(paragraph(text("body")), { type: "somethingNew" }),
    );
    expect(tree?.children[1]).toEqual({
      type: "unknown",
      blockType: "somethingNew",
    });
  });
});

describe("buildRenderTree — mochott media", () => {
  it("resolves a proxied image URL back to its PDS blob", () => {
    const tree = buildRenderTree(
      mochottDoc(
        image({
          src: `/api/image/did:plc:testauthor/${CID}`,
          title: "A bus at the depot",
        }),
      ),
    );

    const node = blockAt(tree, 0, "image");
    expect(node.src).toContain(CID);
    expect(node.src).toContain("cdn.bsky.app");
    expect(node.caption).toBe("A bus at the depot");
    expect(node.source?.blob).toEqual({ ref: CID });
  });

  it("resolves the imgix mirror and absolute proxy URLs too", () => {
    const fromImgix = buildRenderTree(
      mochottDoc(
        image({
          src: `https://mochott.imgix.net/images/did:plc:x/${CID}?w=1200`,
        }),
      ),
    );
    expect(blockAt(fromImgix, 0, "image").source?.blob).toEqual({ ref: CID });

    const fromProxy = buildRenderTree(
      mochottDoc(
        image({ src: `https://mochott.site/api/image/did:plc:x/${CID}` }),
      ),
    );
    expect(blockAt(fromProxy, 0, "image").source?.blob).toEqual({ ref: CID });
  });

  it("keeps a non-proxied image as an external source", () => {
    const tree = buildRenderTree(
      mochottDoc(
        image({
          alt: "a post",
          height: 200,
          src: "https://cdn.bsky.app/img/feed_fullsize/plain/did/cid@jpeg",
          width: 400,
        }),
      ),
    );
    const node = blockAt(tree, 0, "image");
    expect(node.src).toBe(
      "https://cdn.bsky.app/img/feed_fullsize/plain/did/cid@jpeg",
    );
    expect(node.alt).toBe("a post");
    expect(node.aspectRatio).toBe(2);
  });

  it("drops an image with no usable source", () => {
    const tree = buildRenderTree(
      mochottDoc(paragraph(text("body")), image({ src: "not-a-url" })),
    );
    expect(types(tree?.children ?? [])).toEqual(["paragraph"]);
  });

  it("renders a link card as a website block", () => {
    const tree = buildRenderTree(
      mochottDoc({
        attrs: {
          description: "A game",
          image: "https://example.com/og.jpg",
          siteName: "example.com",
          title: "Example",
          url: "https://example.com/post",
        },
        type: "linkCard",
      }),
    );
    expect(tree?.children[0]).toEqual({
      type: "website",
      src: "https://example.com/post",
      title: "Example",
      description: "A game",
      previewImage: "https://example.com/og.jpg",
    });
  });

  it("renders an embed as an iframe, falling back to the source link", () => {
    const withPlayer = buildRenderTree(
      mochottDoc({
        attrs: {
          embedUrl: "https://www.youtube.com/embed/abc",
          service: "youtube",
          src: "https://www.youtube.com/watch?v=abc",
        },
        type: "embed",
      }),
    );
    expect(withPlayer?.children[0]).toEqual({
      type: "iframe",
      url: "https://www.youtube.com/embed/abc",
      height: undefined,
    });

    const withoutPlayer = buildRenderTree(
      mochottDoc({
        attrs: { service: "other", src: "https://example.com/thing" },
        type: "embed",
      }),
    );
    expect(withoutPlayer?.children[0]).toMatchObject({
      type: "website",
      src: "https://example.com/thing",
    });
  });
});

describe("buildRenderTree — mochott custom blocks", () => {
  it("interpolates the snapshotted template with the block's values", () => {
    const tree = buildRenderTree(
      mochottDoc(
        customBlock(
          { align: "right", contents: "A note", size: "x-small" },
          {
            css: "",
            fields: [
              { default: "medium", key: "size" },
              { default: "left", key: "align" },
              { default: "", key: "contents" },
            ],
            html: '<div style="font-size:{{size}};text-align:{{align}};">{{contents}}</div>',
            name: "size and alignment",
          },
        ),
      ),
    );
    expect(tree?.children[0]).toEqual({
      type: "html",
      html: '<div style="font-size:x-small;text-align:right;">A note</div>',
    });
  });

  it("falls back to a field's default and escapes the values", () => {
    const tree = buildRenderTree(
      mochottDoc(
        customBlock(
          { contents: '<script>alert("x")</script>' },
          {
            fields: [
              { default: "medium", key: "size" },
              { default: "", key: "contents" },
            ],
            html: "<p data-size='{{ size }}'>{{contents}}</p>",
          },
        ),
      ),
    );
    expect(tree?.children[0]).toEqual({
      type: "html",
      html: "<p data-size='medium'>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>",
    });
  });

  it("drops a custom block with no template", () => {
    const tree = buildRenderTree(
      mochottDoc(paragraph(text("body")), customBlock({}, { html: "  " })),
    );
    expect(types(tree?.children ?? [])).toEqual(["paragraph"]);
  });
});

describe("buildRenderTree — mochott footnotes", () => {
  it("lifts inline footnotes into the document footnote channel", () => {
    const tree = buildRenderTree(
      mochottDoc(
        paragraph(text("A claim"), footnote("The source."), text(" and more")),
        paragraph(text("Another"), footnote("Second note.")),
      ),
    );

    expect(tree?.footnotes).toEqual([
      {
        id: "mochott-footnote-1",
        number: 1,
        text: { plaintext: "The source." },
      },
      {
        id: "mochott-footnote-2",
        number: 2,
        text: { plaintext: "Second note." },
      },
    ]);

    const inline = inlineNodes(tree?.children[0], tree?.footnoteNumbers);
    expect(inline).toContainEqual({
      type: "footnoteRef",
      footnoteId: "mochott-footnote-1",
      number: 1,
      contentPlaintext: "The source.",
    });
  });

  it("keeps a note with nothing before it, without an inline marker", () => {
    const document = mochottDocument(
      mochottDoc(paragraph(footnote("Orphan."), text("text after"))).content,
    );
    expect(document?.footnotes).toEqual([
      { id: "mochott-footnote-1", text: { plaintext: "Orphan." } },
    ]);
    expect(document?.blocks[0]).toEqual({
      kind: "text",
      text: { plaintext: "text after" },
    });
  });

  it("ignores an empty footnote", () => {
    const document = mochottDocument(
      mochottDoc(paragraph(text("A claim"), footnote("  "))).content,
    );
    expect(document?.footnotes).toEqual([]);
  });
});
