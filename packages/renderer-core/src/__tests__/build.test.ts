import { describe, expect, it } from "vitest";

import { buildRenderTree } from "../build.js";
import { segmentInline } from "../inline.js";
import type { BlockNode } from "../nodes.js";
import type { StandardSiteDocument } from "../types.js";

const AUTHOR = "did:plc:testauthor";

function leafletDoc(
  blocks: Array<Record<string, unknown>>,
  extra?: Partial<StandardSiteDocument>,
): StandardSiteDocument {
  return {
    content: {
      $type: "pub.leaflet.content",
      pages: [{ $type: "pub.leaflet.pages.linearDocument", id: "p1", blocks }],
    },
    authorDid: AUTHOR,
    ...extra,
  };
}

const lf = {
  text: (plaintext: string, facets?: Array<unknown>) => ({
    $type: "pub.leaflet.blocks.text",
    plaintext,
    ...(facets ? { facets } : {}),
  }),
  header: (plaintext: string, level = 2) => ({
    $type: "pub.leaflet.blocks.header",
    level,
    plaintext,
  }),
  image: (cid: string, alt = "") => ({
    $type: "pub.leaflet.blocks.image",
    image: { ref: { $link: cid }, mimeType: "image/png" },
    alt,
  }),
  poll: (uri: string) => ({
    $type: "pub.leaflet.blocks.poll",
    pollRef: { uri },
  }),
  html: (html: string, height?: number) => ({
    $type: "pub.leaflet.blocks.html",
    html,
    ...(height == null ? {} : { height }),
  }),
  unorderedList: (items: Array<string>) => ({
    $type: "pub.leaflet.blocks.unorderedList",
    children: items.map((plaintext) => ({
      $type: "pub.leaflet.blocks.unorderedList#listItem",
      content: { $type: "pub.leaflet.blocks.text", plaintext },
    })),
  }),
};

function facet(byteStart: number, byteEnd: number, ...features: Array<object>) {
  return { index: { byteStart, byteEnd }, features };
}

/** buildRenderTree, asserting a non-null tree so tests can use it directly. */
function build(
  doc: StandardSiteDocument,
  opts?: Parameters<typeof buildRenderTree>[1],
) {
  const tree = buildRenderTree(doc, opts);
  if (tree === null) throw new Error("expected a render tree");
  return tree;
}

describe("buildRenderTree — leaflet", () => {
  it("maps blocks onto the unified node vocabulary", () => {
    const tree = build(
      leafletDoc([lf.header("Title", 1), lf.text("Body"), lf.poll("at://p/1")]),
    );
    expect(tree).not.toBeNull();
    expect(tree.format).toBe("pub.leaflet.content");
    expect(tree.children.map((n) => n.type)).toEqual([
      "heading",
      "paragraph",
      "leaflet.poll",
    ]);
    const heading = tree.children[0] as Extract<BlockNode, { type: "heading" }>;
    expect(heading.level).toBe(1);
    expect(heading.text.plaintext).toBe("Title");
  });

  it("resolves blob images to CDN URLs", () => {
    const tree = build(leafletDoc([lf.image("bafycid", "Alt")]));
    const image = tree.children[0] as Extract<BlockNode, { type: "image" }>;
    expect(image.type).toBe("image");
    expect(image.src).toBe(
      `https://cdn.bsky.app/img/feed_fullsize/plain/${encodeURIComponent(
        AUTHOR,
      )}/bafycid@png`,
    );
    expect(image.alt).toBe("Alt");
  });

  it("collects and numbers footnotes", () => {
    const tree = build(
      leafletDoc([
        lf.text("A claim.[n]", [
          facet(8, 11, {
            $type: "pub.leaflet.richtext.facet#footnote",
            footnoteId: "fn1",
            contentPlaintext: "Evidence.",
          }),
        ]),
      ]),
    );
    expect(tree.footnotes).toHaveLength(1);
    expect(tree.footnotes[0]).toMatchObject({ id: "fn1", number: 1 });
    expect(tree.footnoteNumbers.get("fn1")).toBe(1);
  });

  it("carries an html block through as a sized embed", () => {
    const tree = build(
      leafletDoc([lf.html("<p>widget</p>", 243), lf.text("After")]),
    );
    expect(tree.children.map((n) => n.type)).toEqual([
      "htmlEmbed",
      "paragraph",
    ]);
    const embed = tree.children[0] as Extract<BlockNode, { type: "htmlEmbed" }>;
    expect(embed.html).toBe("<p>widget</p>");
    expect(embed.height).toBe(243);
  });

  it("drops an html block with no markup rather than rendering an empty frame", () => {
    const tree = build(leafletDoc([lf.html("   "), lf.text("After")]));
    expect(tree.children.map((n) => n.type)).toEqual(["paragraph"]);
  });

  it("builds nested list items", () => {
    const tree = build(leafletDoc([lf.unorderedList(["a", "b"])]));
    const list = tree.children[0] as Extract<BlockNode, { type: "bulletList" }>;
    expect(list.type).toBe("bulletList");
    expect(list.items).toHaveLength(2);
    expect(list.items[0]?.runs[0]?.plaintext).toBe("a");
  });

  it("splits a text block's blank-line-separated markdown into separate paragraphs", () => {
    // Skyreader linkblogs stuff markdown into a single `text` block's plaintext
    // instead of using Leaflet's structured blocks.
    const tree = build(
      leafletDoc([lf.text("First paragraph.\n\nSecond paragraph.")]),
    );
    expect(tree.children.map((n) => n.type)).toEqual([
      "paragraph",
      "paragraph",
    ]);
    const [first, second] = tree.children as Array<
      Extract<BlockNode, { type: "paragraph" }>
    >;
    expect(first?.text.plaintext).toBe("First paragraph.");
    expect(second?.text.plaintext).toBe("Second paragraph.");
  });

  it("renders a leading '> ' markdown line as a blockquote and keeps facets aligned", () => {
    const plaintext =
      "> Quoted from @renderg.host here.\n\nA reply that mentions @mu.social too.";
    const quoteFacetStart = plaintext.indexOf("@renderg.host");
    const replyFacetStart = plaintext.indexOf("@mu.social");
    const facets = [
      facet(quoteFacetStart, quoteFacetStart + "@renderg.host".length, {
        $type: "pub.leaflet.richtext.facet#didMention",
        did: "did:plc:a",
      }),
      facet(replyFacetStart, replyFacetStart + "@mu.social".length, {
        $type: "pub.leaflet.richtext.facet#didMention",
        did: "did:plc:b",
      }),
    ];
    const tree = build(leafletDoc([lf.text(plaintext, facets)]));
    expect(tree.children.map((n) => n.type)).toEqual([
      "blockquote",
      "paragraph",
    ]);

    const quote = tree.children[0] as Extract<
      BlockNode,
      { type: "blockquote" }
    >;
    expect(quote.paragraphs[0]?.plaintext).toBe(
      "Quoted from @renderg.host here.",
    );
    expect(quote.paragraphs[0]?.facets).toHaveLength(1);
    const quoteFacet = quote.paragraphs[0]?.facets?.[0] as {
      index: { byteStart: number; byteEnd: number };
    };
    expect(
      quote.paragraphs[0]?.plaintext.slice(
        quoteFacet.index.byteStart,
        quoteFacet.index.byteEnd,
      ),
    ).toBe("@renderg.host");

    const reply = tree.children[1] as Extract<BlockNode, { type: "paragraph" }>;
    expect(reply.text.plaintext).toBe("A reply that mentions @mu.social too.");
    expect(reply.text.facets).toHaveLength(1);
    const replyFacet = reply.text.facets?.[0] as {
      index: { byteStart: number; byteEnd: number };
    };
    expect(
      reply.text.plaintext.slice(
        replyFacet.index.byteStart,
        replyFacet.index.byteEnd,
      ),
    ).toBe("@mu.social");
  });

  it("leaves single-paragraph text untouched", () => {
    const tree = build(leafletDoc([lf.text("Just one line, no markdown.")]));
    expect(tree.children.map((n) => n.type)).toEqual(["paragraph"]);
  });
});

describe("buildRenderTree — options", () => {
  it("marks the first paragraph for a drop cap", () => {
    const tree = build(leafletDoc([lf.text("First"), lf.text("Second")]), {
      dropCap: true,
    });
    const paras = tree.children.filter((n) => n.type === "paragraph");
    expect(
      (paras[0] as Extract<BlockNode, { type: "paragraph" }>).dropCap,
    ).toBe(true);
    expect(
      (paras[1] as Extract<BlockNode, { type: "paragraph" }>).dropCap,
    ).toBe(false);
  });

  it("skips a leading image", () => {
    const tree = build(leafletDoc([lf.image("cid", "hero"), lf.text("Body")]), {
      skipLeadingImage: true,
    });
    expect(tree.children.map((n) => n.type)).toEqual(["paragraph"]);
  });

  it("drops a leading heading matching the description", () => {
    const tree = build(
      leafletDoc([lf.header("Title", 1), lf.text("Body")], {
        description: "Title",
      }),
    );
    expect(tree.children.map((n) => n.type)).toEqual(["paragraph"]);
  });

  it("returns null for an unknown format", () => {
    expect(buildRenderTree({ content: { $type: "com.unknown/x" } })).toBeNull();
  });
});

describe("buildRenderTree — pckt + offprint", () => {
  it("renders pckt blocks", () => {
    const tree = build({
      content: {
        $type: "blog.pckt.content",
        items: [
          { $type: "blog.pckt.block.heading", level: 2, plaintext: "H" },
          { $type: "blog.pckt.block.gallery", ref: "at://g/1" },
        ],
      },
    });
    expect(tree.children.map((n) => n.type)).toEqual([
      "heading",
      "pckt.gallery",
    ]);
  });

  it("renders offprint callouts and components", () => {
    const tree = build({
      content: {
        $type: "app.offprint.content",
        items: [
          {
            $type: "app.offprint.block.callout",
            plaintext: "Note",
            emoji: "💡",
          },
          {
            $type: "app.offprint.block.component",
            component: "at://c/1",
          },
        ],
      },
    });
    expect(tree.children.map((n) => n.type)).toEqual([
      "callout",
      "offprint.component",
    ]);
  });
});

describe("segmentInline", () => {
  it("builds a nested mark tree", () => {
    const nodes = segmentInline({
      plaintext: "Hello bold world",
      facets: [facet(6, 10, { $type: "pub.leaflet.richtext.facet#bold" })],
    });
    expect(nodes[0]).toEqual({ type: "text", value: "Hello " });
    expect(nodes[1]).toMatchObject({ type: "mark", mark: "strong" });
    expect(nodes[2]).toEqual({ type: "text", value: " world" });
  });

  it("produces link and mention nodes", () => {
    const link = segmentInline({
      plaintext: "see here",
      facets: [
        facet(4, 8, {
          $type: "pub.leaflet.richtext.facet#link",
          uri: "https://x.test",
        }),
      ],
    });
    expect(link[1]).toMatchObject({ type: "link", href: "https://x.test" });

    const mention = segmentInline({
      plaintext: "hi @me",
      facets: [
        facet(3, 6, {
          $type: "pub.leaflet.richtext.facet#didMention",
          did: "did:plc:me",
        }),
      ],
    });
    expect(mention[1]).toMatchObject({ type: "mention", did: "did:plc:me" });
  });

  it("resolves footnote reference numbers from the map", () => {
    const nodes = segmentInline(
      {
        plaintext: "x[n]",
        facets: [
          facet(1, 4, {
            $type: "pub.leaflet.richtext.facet#footnote",
            footnoteId: "fn1",
          }),
        ],
      },
      new Map([["fn1", 3]]),
    );
    const ref = nodes.find((n) => n.type === "footnoteRef");
    expect(ref).toMatchObject({
      type: "footnoteRef",
      footnoteId: "fn1",
      number: 3,
    });
  });
});
