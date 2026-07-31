/**
 * Emit → re-parse invariants.
 *
 * `convert.test.ts` asserts the emitters produce the right *shape*. That cannot
 * catch the worst failure available to a converter: emitting a record no parser
 * can read back. A record that writes cleanly and renders as an empty page is
 * worse than one that fails on `putRecord`, because nothing reports it.
 *
 * So every target here is converted and then fed straight back through
 * `buildRenderTree` — the same parser the reader and every framework renderer
 * use. If the emitted blocks are misnamed, mis-nested, or missing a field the
 * parser requires, the text simply does not come back and the assertion fails.
 *
 * The expectations are written out per target rather than shared, because the
 * differences *are* the documentation: they show exactly what a reader of the
 * converted document ends up seeing.
 */

import type { BlockNode, DocumentTree } from "@standard-reader/renderer-core";
import { buildRenderTree, segmentInline } from "@standard-reader/renderer-core";
import { describe, expect, it } from "vitest";

import { convertDocumentContent } from "../convert.js";
import type { ConversionTarget } from "../types.js";
import {
  AUTHOR_DID,
  facet,
  leafletContent,
  leafletFacet,
  lf,
} from "./fixtures.js";

/**
 * A source document shaped like the ones this actually runs against: a hero
 * image, prose carrying mentions and links, a nested list, a quote, code, and
 * an embed. The prose is invented — the *structures* are the point.
 */
const SOURCE = leafletContent([
  lf.image("A castle with a drawbridge"),
  lf.header("Moats", 2),
  lf.text("Every platform wants a moat around its users.", [
    facet(6, 14, leafletFacet("bold")),
    facet(27, 31, leafletFacet("link", { uri: "https://example.com/moats" })),
  ]),
  lf.text("As @someone.example put it, the walls are the product.", [
    facet(3, 19, leafletFacet("didMention", { did: "did:plc:someone" })),
  ]),
  lf.unorderedList([
    lf.listItem("Drawbridges", [lf.listItem("go both ways")]),
    lf.listItem("Moats do not"),
  ]),
  lf.code("const moat = false;", "ts"),
  lf.bskyPost("at://did:plc:abc/app.bsky.feed.post/3k", "bafypost"),
  lf.text("Literal [brackets] and * asterisks stay literal."),
]);

/** `[type, visible text]` for every block a parse produced. */
function outline(tree: DocumentTree): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const visit = (nodes: Array<BlockNode>) => {
    for (const node of nodes) {
      switch (node.type) {
        case "paragraph":
        case "heading": {
          rows.push([node.type, node.text.plaintext]);
          break;
        }
        case "blockquote": {
          for (const p of node.paragraphs)
            rows.push(["blockquote", p.plaintext]);
          break;
        }
        case "code": {
          rows.push(["code", node.code]);
          break;
        }
        case "image": {
          rows.push(["image", node.alt]);
          break;
        }
        case "bulletList":
        case "orderedList": {
          for (const item of node.items) {
            for (const run of item.runs) rows.push([node.type, run.plaintext]);
            visit(item.children);
          }
          break;
        }
        case "blueskyEmbed": {
          rows.push(["blueskyEmbed", node.postUri]);
          break;
        }
        default: {
          rows.push([node.type, ""]);
        }
      }
    }
  };
  visit(tree.children);
  return rows;
}

/** Every inline mark and link href the parse recovered, in document order. */
function inlineFeatures(tree: DocumentTree): Array<string> {
  const found: Array<string> = [];
  const walk = (nodes: ReturnType<typeof segmentInline>) => {
    for (const node of nodes) {
      switch (node.type) {
        case "mark": {
          found.push(node.mark);
          walk(node.children);
          break;
        }
        case "link": {
          found.push(`link:${node.href}`);
          walk(node.children);
          break;
        }
        case "mention": {
          found.push(`mention:${node.did ?? node.atUri ?? ""}`);
          walk(node.children);
          break;
        }
        default: {
          break;
        }
      }
    }
  };
  for (const node of tree.children) {
    if (node.type === "paragraph" || node.type === "heading") {
      walk(segmentInline(node.text));
    }
  }
  return found;
}

/** Convert, then parse the result back with the reader's own parser. */
function roundTrip(target: ConversionTarget): DocumentTree {
  const result = convertDocumentContent({
    authorDid: AUTHOR_DID,
    content: SOURCE,
    target,
  });
  expect(result.content).not.toBeNull();

  const reparsed = buildRenderTree({
    authorDid: AUTHOR_DID,
    content: result.content,
  });
  // A null tree here means the converter wrote a record its own parser cannot
  // read — the failure this whole file exists to catch.
  expect(reparsed).not.toBeNull();
  return reparsed as DocumentTree;
}

describe("round trip: leaflet → pckt", () => {
  it("comes back with every block intact", () => {
    expect(outline(roundTrip("pckt"))).toEqual([
      ["image", "A castle with a drawbridge"],
      ["heading", "Moats"],
      ["paragraph", "Every platform wants a moat around its users."],
      ["paragraph", "As @someone.example put it, the walls are the product."],
      ["bulletList", "Drawbridges"],
      ["bulletList", "go both ways"],
      ["bulletList", "Moats do not"],
      ["code", "const moat = false;"],
      ["blueskyEmbed", "at://did:plc:abc/app.bsky.feed.post/3k"],
      ["paragraph", "Literal [brackets] and * asterisks stay literal."],
    ]);
  });

  it("keeps the inline marks, links and mentions", () => {
    expect(inlineFeatures(roundTrip("pckt"))).toEqual([
      "strong",
      "link:https://example.com/moats",
      "mention:did:plc:someone",
    ]);
  });
});

describe("round trip: leaflet → offprint", () => {
  it("comes back intact except for the nesting Offprint cannot hold", () => {
    expect(outline(roundTrip("offprint"))).toEqual([
      ["image", "A castle with a drawbridge"],
      ["heading", "Moats"],
      ["paragraph", "Every platform wants a moat around its users."],
      ["paragraph", "As @someone.example put it, the walls are the product."],
      // "go both ways" is gone — Offprint list items hold a single line.
      ["bulletList", "Drawbridges"],
      ["bulletList", "Moats do not"],
      ["code", "const moat = false;"],
      ["blueskyEmbed", "at://did:plc:abc/app.bsky.feed.post/3k"],
      ["paragraph", "Literal [brackets] and * asterisks stay literal."],
    ]);
  });

  it("drops the mention its facet vocabulary has no name for", () => {
    expect(inlineFeatures(roundTrip("offprint"))).toEqual([
      "strong",
      "link:https://example.com/moats",
    ]);
  });
});

describe("round trip: leaflet → markpub", () => {
  it("comes back as markdown blocks, embeds flattened to links", () => {
    expect(outline(roundTrip("markpub"))).toEqual([
      ["image", "A castle with a drawbridge"],
      ["heading", "Moats"],
      ["paragraph", "Every platform wants a moat around its users."],
      ["paragraph", "As @someone.example put it, the walls are the product."],
      ["bulletList", "Drawbridges"],
      ["bulletList", "go both ways"],
      ["bulletList", "Moats do not"],
      ["code", "const moat = false;"],
      // No Bluesky embed in markdown — it became a link.
      ["paragraph", "View post on Bluesky"],
      ["paragraph", "Literal [brackets] and * asterisks stay literal."],
    ]);
  });

  /**
   * Asserted on the emitted source as well as on the re-parse above, because
   * the two can fail independently: the markdown could carry the nesting while
   * the parser drops it (which it did until the parser learned to nest), or the
   * emitter could stop indenting and the parse would go quietly flat.
   */
  it("writes the nesting into the markdown source", () => {
    const result = convertDocumentContent({
      authorDid: AUTHOR_DID,
      content: SOURCE,
      target: "markpub",
    });
    const text = result.content?.text as { markdown: string } | undefined;
    const markdown = text?.markdown ?? "";
    expect(markdown).toContain("- Drawbridges\n  - go both ways");
  });

  it("survives the trip through markdown syntax without double-escaping", () => {
    const tree = roundTrip("markpub");
    const literal = tree.children.find(
      (node) =>
        node.type === "paragraph" && node.text.plaintext.includes("Literal"),
    );
    expect(literal).toBeDefined();
    // The backslashes the emitter added to protect `[`, `]` and `*` must be
    // consumed by the markdown parser, not delivered to the reader.
    expect(
      (literal as Extract<BlockNode, { type: "paragraph" }>).text.plaintext,
    ).toBe("Literal [brackets] and * asterisks stay literal.");
  });

  it("keeps marks and links, and turns the mention into a profile link", () => {
    expect(inlineFeatures(roundTrip("markpub"))).toEqual([
      "strong",
      "link:https://example.com/moats",
      "link:https://bsky.app/profile/did:plc:someone",
      "link:https://bsky.app/profile/did:plc:abc/post/3k",
    ]);
  });
});

describe("round trip: markpub → the block formats", () => {
  // Going the other way is the migration an author does to leave markdown.
  const markpub = convertDocumentContent({
    authorDid: AUTHOR_DID,
    content: SOURCE,
    target: "markpub",
  }).content;

  it.each(["leaflet", "offprint", "pckt"] as const)(
    "markdown → %s keeps the prose",
    (target) => {
      const result = convertDocumentContent({
        authorDid: AUTHOR_DID,
        content: markpub,
        target,
      });
      const tree = buildRenderTree({
        authorDid: AUTHOR_DID,
        content: result.content,
      });
      expect(tree).not.toBeNull();
      const text = outline(tree as DocumentTree).map(([, value]) => value);
      expect(text).toContain("Moats");
      expect(text).toContain("Every platform wants a moat around its users.");
      expect(text).toContain(
        "Literal [brackets] and * asterisks stay literal.",
      );
    },
  );
});

describe("round trip: an image keeps pointing at the same blob", () => {
  it.each(["leaflet", "offprint", "pckt"] as const)("%s", (target) => {
    const result = convertDocumentContent({
      authorDid: AUTHOR_DID,
      content: SOURCE,
      target,
    });
    const tree = buildRenderTree({
      authorDid: AUTHOR_DID,
      content: result.content,
    }) as DocumentTree;
    const image = tree.children.find((node) => node.type === "image");
    expect(image).toBeDefined();
    // Same CID as the source blob: converted records reference the original
    // upload rather than a re-hosted copy.
    expect((image as Extract<BlockNode, { type: "image" }>).src).toContain(
      "bafkreiimageblobcid",
    );
  });
});
