import { describe, expect, it } from "vitest";

import { convertDocumentContent } from "../convert.js";
import type { ConversionResult, ConversionTarget } from "../types.js";
import {
  AUTHOR_DID,
  facet,
  leafletContent,
  leafletFacet,
  lf,
  markpubContent,
  offprintContent,
  op,
  pcktContent,
  pcktFacet,
  pk,
} from "./fixtures.js";

function convert(content: unknown, target: ConversionTarget): ConversionResult {
  return convertDocumentContent({ authorDid: AUTHOR_DID, content, target });
}

function codes(result: ConversionResult): Array<string> {
  return result.issues.map((issue) => issue.code);
}

function unsupported(result: ConversionResult) {
  return result.issues.filter((issue) => issue.severity === "unsupported");
}

/** Every block emitted into a leaflet page, unwrapped from its `#block` shell. */
function leafletBlocks(
  result: ConversionResult,
): Array<Record<string, unknown>> {
  const pages = result.content?.pages as Array<{
    blocks: Array<{ block: Record<string, unknown> }>;
  }>;
  return pages[0]?.blocks.map((entry) => entry.block) ?? [];
}

function items(result: ConversionResult): Array<Record<string, unknown>> {
  return (result.content?.items ?? []) as Array<Record<string, unknown>>;
}

function markdown(result: ConversionResult): string {
  const text = result.content?.text as { markdown: string };
  return text.markdown;
}

describe("convertDocumentContent — shape of the result", () => {
  it("reports a source it cannot parse instead of throwing", () => {
    const result = convert(
      { $type: "com.example.unknown", body: "hi" },
      "pckt",
    );
    expect(result.content).toBeNull();
    expect(result.lossless).toBe(false);
    expect(codes(result)).toEqual(["source-unreadable"]);
  });

  it("treats a document already in the target format as unchanged", () => {
    const content = leafletContent([lf.text("Hello")]);
    const result = convert(content, "leaflet");
    expect(result.unchanged).toBe(true);
    expect(result.lossless).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.content).toBe(content);
  });

  it("treats a bare at.markpub.text body as already Markpub", () => {
    const result = convert(
      { $type: "at.markpub.text", markdown: "# Hi" },
      "markpub",
    );
    expect(result.unchanged).toBe(true);
  });

  it("counts source blocks and marks a clean conversion lossless", () => {
    const result = convert(
      leafletContent([lf.header("Title", 1), lf.text("Body")]),
      "pckt",
    );
    expect(result.blockCount).toBe(2);
    expect(result.lossless).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.contentType).toBe("blog.pckt.content");
    expect(result.sourceFormat).toBe("pub.leaflet.content");
  });
});

describe("leaflet → pckt", () => {
  it("carries headings, paragraphs and code across", () => {
    const result = convert(
      leafletContent([
        lf.header("Title", 1),
        lf.text("Body text"),
        lf.code("const x = 1;", "ts"),
      ]),
      "pckt",
    );
    expect(items(result)).toEqual([
      { $type: "blog.pckt.block.heading", level: 1, plaintext: "Title" },
      { $type: "blog.pckt.block.text", plaintext: "Body text" },
      {
        $type: "blog.pckt.block.codeBlock",
        language: "ts",
        plaintext: "const x = 1;",
      },
    ]);
  });

  it("rewrites facets into the pckt dialect, offsets untouched", () => {
    const result = convert(
      leafletContent([
        lf.text("bold and link", [
          facet(0, 4, leafletFacet("bold")),
          facet(9, 13, leafletFacet("link", { uri: "https://example.com" })),
        ]),
      ]),
      "pckt",
    );
    expect(items(result)[0]).toEqual({
      $type: "blog.pckt.block.text",
      facets: [
        {
          features: [{ $type: "blog.pckt.richtext.facet#bold" }],
          index: { byteEnd: 4, byteStart: 0 },
        },
        {
          features: [
            {
              $type: "blog.pckt.richtext.facet#link",
              uri: "https://example.com",
            },
          ],
          index: { byteEnd: 13, byteStart: 9 },
        },
      ],
      plaintext: "bold and link",
    });
  });

  it("degrades a math block to a latex code block and says so", () => {
    const result = convert(
      leafletContent([lf.math(String.raw`e^{i\pi}`)]),
      "pckt",
    );
    expect(items(result)[0]).toEqual({
      $type: "blog.pckt.block.codeBlock",
      language: "latex",
      plaintext: String.raw`e^{i\pi}`,
    });
    const issue = result.issues[0];
    expect(issue?.severity).toBe("lossy");
    expect(issue?.blockType).toBe("math");
    expect(issue?.fallback).toContain("code block");
  });

  it("drops a Leaflet HTML embed, which pckt has no block for", () => {
    const result = convert(
      leafletContent([lf.text("intro"), lf.html("<p>widget</p>", 243)]),
      "pckt",
    );
    expect(items(result)).toHaveLength(1);
    const [issue] = unsupported(result);
    expect(issue?.blockType).toBe("htmlEmbed");
    expect(issue?.blockIndex).toBe(1);
  });

  it("drops a Leaflet poll and flags it as unsupported", () => {
    const result = convert(
      leafletContent([
        lf.text("intro"),
        lf.poll("at://did:plc:x/pub.leaflet.poll/1"),
      ]),
      "pckt",
    );
    expect(items(result)).toHaveLength(1);
    const [issue] = unsupported(result);
    expect(issue?.blockType).toBe("leaflet.poll");
    expect(issue?.blockIndex).toBe(1);
    expect(result.lossless).toBe(false);
  });

  it("keeps nested list structure", () => {
    const result = convert(
      leafletContent([
        lf.unorderedList([lf.listItem("outer", [lf.listItem("inner")])]),
      ]),
      "pckt",
    );
    const list = items(result)[0] as {
      content: Array<{ content: Array<Record<string, unknown>> }>;
    };
    const outerItem = list.content[0];
    expect(outerItem?.content[0]).toMatchObject({ plaintext: "outer" });
    expect(outerItem?.content[1]).toMatchObject({
      $type: "blog.pckt.block.bulletList",
    });
  });

  it("warns when a Bluesky embed has no CID for the strongRef", () => {
    const withCid = convert(
      leafletContent([
        lf.bskyPost("at://did:plc:a/app.bsky.feed.post/1", "bafy"),
      ]),
      "pckt",
    );
    expect(withCid.issues).toEqual([]);

    const withoutCid = convert(
      leafletContent([lf.bskyPost("at://did:plc:a/app.bsky.feed.post/1")]),
      "pckt",
    );
    expect(codes(withoutCid)).toEqual(["strongref-incomplete"]);
    expect(withoutCid.issues[0]?.severity).toBe("lossy");
  });
});

describe("pckt → leaflet", () => {
  it("drops a table, which Leaflet has no block for", () => {
    const result = convert(
      pcktContent([
        pk.text("before"),
        pk.table([
          [
            { header: true, text: "Name" },
            { header: true, text: "Value" },
          ],
          [{ text: "a" }, { text: "1" }],
        ]),
      ]),
      "leaflet",
    );
    expect(leafletBlocks(result)).toHaveLength(1);
    const [issue] = unsupported(result);
    expect(issue?.blockType).toBe("table");
    expect(issue?.message).toContain("no table block");
  });

  it("turns a task list into a bullet list with checkbox glyphs", () => {
    const result = convert(
      pcktContent([
        pk.taskList([
          { checked: true, text: "done" },
          { checked: false, text: "todo" },
        ]),
      ]),
      "leaflet",
    );
    const list = leafletBlocks(result)[0] as {
      children: Array<{ content: { plaintext: string } }>;
    };
    expect(list.children.map((child) => child.content.plaintext)).toEqual([
      "☑ done",
      "☐ todo",
    ]);
    expect(result.issues[0]?.severity).toBe("lossy");
  });

  it("shifts facets when a checkbox glyph is prefixed", () => {
    const result = convert(
      pcktContent([
        {
          $type: "blog.pckt.block.taskList",
          content: [
            {
              $type: "blog.pckt.block.taskItem",
              attrs: { checked: true },
              content: [
                {
                  $type: "blog.pckt.block.text",
                  facets: [facet(0, 4, pcktFacet("bold"))],
                  plaintext: "bold rest",
                },
              ],
            },
          ],
        },
      ]),
      "leaflet",
    );
    const list = leafletBlocks(result)[0] as {
      children: Array<{
        content: { plaintext: string; facets: Array<{ index: object }> };
      }>;
    };
    const content = list.children[0]?.content;
    // "☑ " is four UTF-8 bytes plus a space.
    expect(content?.plaintext).toBe("☑ bold rest");
    expect(content?.facets[0]?.index).toEqual({ byteEnd: 8, byteStart: 4 });
  });

  it("drops highlight formatting Leaflet cannot name, once per block", () => {
    const result = convert(
      pcktContent([
        pk.text("aaa bbb", [
          facet(0, 3, pcktFacet("highlight")),
          facet(4, 7, pcktFacet("highlight")),
        ]),
      ]),
      "leaflet",
    );
    const dropped = result.issues.filter(
      (issue) => issue.code === "facet-dropped",
    );
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.message).toContain("highlight");
    expect(leafletBlocks(result)[0]).toEqual({
      $type: "pub.leaflet.blocks.text",
      plaintext: "aaa bbb",
    });
  });

  it("refuses a pckt gallery, whose images live in another record", () => {
    const result = convert(
      pcktContent([pk.gallery("at://did:plc:x/blog.pckt.gallery/1")]),
      "leaflet",
    );
    expect(result.content).toBeNull();
    expect(codes(result)).toEqual(["block-unsupported", "empty-result"]);
  });
});

describe("offprint → leaflet", () => {
  it("flattens a callout into a blockquote led by its emoji", () => {
    const result = convert(
      offprintContent([op.callout("Careful", "⚠️", "amber")]),
      "leaflet",
    );
    expect(leafletBlocks(result)[0]).toEqual({
      $type: "pub.leaflet.blocks.blockquote",
      plaintext: "⚠️ Careful",
    });
    expect(result.issues[0]?.fallback).toContain("blockquote");
  });

  it("keeps an image grid as a Leaflet gallery but loses the caption", () => {
    const result = convert(
      offprintContent([op.imageGrid(2, "Two views")]),
      "leaflet",
    );
    const gallery = leafletBlocks(result)[0] as {
      format: string;
      images: Array<Record<string, unknown>>;
    };
    expect(gallery.format).toBe("grid");
    expect(gallery.images).toHaveLength(2);
    expect(codes(result)).toEqual(["detail-dropped"]);
  });

  it("cannot carry an Offprint component reference anywhere else", () => {
    const result = convert(
      offprintContent([
        op.text("body"),
        op.component("at://did:plc:x/app.offprint.component/footer"),
      ]),
      "leaflet",
    );
    expect(unsupported(result)[0]?.blockType).toBe("offprint.component");
  });
});

describe("leaflet → offprint", () => {
  it("cannot nest lists and says the nesting is lost", () => {
    const result = convert(
      leafletContent([
        lf.unorderedList([lf.listItem("outer", [lf.listItem("inner")])]),
      ]),
      "offprint",
    );
    const [issue] = unsupported(result);
    expect(issue?.code).toBe("list-nesting-dropped");
    const list = items(result)[0] as { children: Array<unknown> };
    expect(list.children).toHaveLength(1);
  });

  it("drops footnotes, which only Leaflet carries", () => {
    const result = convert(
      leafletContent([
        lf.text("claim", [
          facet(
            0,
            5,
            leafletFacet("footnote", {
              contentPlaintext: "the evidence",
              footnoteId: "fn1",
            }),
          ),
        ]),
      ]),
      "offprint",
    );
    expect(codes(result)).toContain("footnotes-unsupported");
    expect(result.lossless).toBe(false);
  });

  it("keeps footnotes when the target is Leaflet itself", () => {
    const result = convert(
      {
        $type: "pub.leaflet.document",
        pages: [
          {
            $type: "pub.leaflet.pages.linearDocument",
            blocks: [
              {
                $type: "pub.leaflet.pages.linearDocument#block",
                block: {
                  $type: "pub.leaflet.blocks.text",
                  facets: [
                    facet(
                      0,
                      5,
                      leafletFacet("footnote", {
                        contentPlaintext: "the evidence",
                        footnoteId: "fn1",
                      }),
                    ),
                  ],
                  plaintext: "claim",
                },
              },
            ],
          },
        ],
      },
      "leaflet",
    );
    const block = leafletBlocks(result)[0] as {
      facets: Array<{ features: Array<Record<string, unknown>> }>;
    };
    expect(block.facets[0]?.features[0]).toEqual({
      $type: "pub.leaflet.richtext.facet#footnote",
      contentPlaintext: "the evidence",
      footnoteId: "fn1",
    });
    expect(result.issues).toEqual([]);
  });

  it("round-trips an HTML embed with its height", () => {
    const result = convert(
      leafletContent([lf.html("<p>widget</p>", 243)]),
      "leaflet",
    );
    expect(leafletBlocks(result)[0]).toEqual({
      $type: "pub.leaflet.blocks.html",
      height: 243,
      html: "<p>widget</p>",
    });
    expect(result.issues).toEqual([]);
  });
});

describe("→ markpub", () => {
  it("writes a gfm record with the body under text.markdown", () => {
    const result = convert(
      leafletContent([lf.header("Title", 1), lf.text("Body")]),
      "markpub",
    );
    expect(result.content).toEqual({
      $type: "at.markpub.markdown",
      flavor: "gfm",
      text: { $type: "at.markpub.text", markdown: "# Title\n\nBody" },
    });
  });

  it("renders marks, links and code as markdown syntax", () => {
    const result = convert(
      pcktContent([
        pk.text("bold link code", [
          facet(0, 4, pcktFacet("bold")),
          facet(5, 9, pcktFacet("link", { uri: "https://example.com" })),
          facet(10, 14, pcktFacet("code")),
        ]),
      ]),
      "markpub",
    );
    expect(markdown(result)).toBe(
      "**bold** [link](https://example.com) `code`",
    );
  });

  it("keeps an HTML embed sandboxed instead of inlining its markup", () => {
    const result = convert(
      leafletContent([lf.html('<script>alert("x")</script>', 243)]),
      "markpub",
    );
    expect(markdown(result)).toBe(
      '<iframe srcdoc="&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"' +
        ' height="243" sandbox="allow-scripts" loading="lazy"' +
        ' title="Embedded content"></iframe>',
    );
    expect(result.issues[0]?.severity).toBe("lossy");
    expect(result.issues[0]?.fallback).toContain("srcdoc");
  });

  it("keeps a multi-line HTML embed on one line so the html block survives", () => {
    const result = convert(
      leafletContent([
        lf.html("<style>\n\np { color: red }\n\n</style><p>hi</p>"),
      ]),
      "markpub",
    );
    // A literal blank line inside the attribute would end the markdown HTML
    // block and render the rest of the tag as prose.
    expect(markdown(result)).not.toContain("\n");
    expect(markdown(result)).toContain("&#10;&#10;p { color: red }");
  });

  it("keeps text whose formatting markdown lacks, and warns once", () => {
    const result = convert(
      pcktContent([
        pk.text("hi there", [
          facet(0, 2, pcktFacet("highlight")),
          facet(3, 8, pcktFacet("underline")),
        ]),
      ]),
      "markpub",
    );
    expect(markdown(result)).toBe("hi there");
    const dropped = result.issues.filter(
      (issue) => issue.code === "facet-dropped",
    );
    expect(dropped.map((issue) => issue.message).toSorted()).toEqual([
      "markdown has no syntax for highlighted text",
      "markdown has no syntax for underlined text",
    ]);
  });

  it("writes a GFM table", () => {
    const result = convert(
      pcktContent([
        pk.table([
          [
            { header: true, text: "Name" },
            { header: true, text: "Value" },
          ],
          [{ text: "a" }, { text: "1" }],
        ]),
      ]),
      "markpub",
    );
    expect(markdown(result)).toBe("| Name | Value |\n| --- | --- |\n| a | 1 |");
  });

  it("declares the latex extension when it emits a math block", () => {
    const result = convert(leafletContent([lf.math("x^2")]), "markpub");
    expect(result.content?.extensions).toEqual(["latex"]);
    expect(markdown(result)).toBe("$$\nx^2\n$$");
  });

  it("rewrites a blob-backed image to its CDN URL and flags the swap", () => {
    const result = convert(leafletContent([lf.image("A cat")]), "markpub");
    expect(markdown(result)).toContain("![A cat](https://cdn.bsky.app/img/");
    expect(codes(result)).toEqual(["blob-to-url"]);
  });

  it("links a Bluesky embed to bsky.app", () => {
    const result = convert(
      leafletContent([
        lf.bskyPost("at://did:plc:abc/app.bsky.feed.post/3k", "bafy"),
      ]),
      "markpub",
    );
    expect(markdown(result)).toBe(
      "[View post on Bluesky](https://bsky.app/profile/did:plc:abc/post/3k)",
    );
  });

  it("escapes markdown syntax in the source text", () => {
    const result = convert(
      leafletContent([lf.text("a * b _c_ [d]")]),
      "markpub",
    );
    expect(markdown(result)).toBe(String.raw`a \* b \_c\_ \[d\]`);
  });

  it("emits GFM footnotes and warns they do not round-trip", () => {
    const result = convert(
      leafletContent([
        lf.text("claim", [
          facet(
            0,
            5,
            leafletFacet("footnote", {
              contentPlaintext: "the evidence",
              footnoteId: "fn1",
            }),
          ),
        ]),
      ]),
      "markpub",
    );
    expect(markdown(result)).toBe("claim[^1]\n\n[^1]: the evidence");
    expect(codes(result)).toContain("footnotes-degraded");
  });

  it("keeps a nested list indented under its parent item", () => {
    const result = convert(
      leafletContent([
        lf.unorderedList([lf.listItem("outer", [lf.listItem("inner")])]),
      ]),
      "markpub",
    );
    expect(markdown(result)).toBe("- outer\n  - inner");
  });
});

describe("callouts and footnotes now survive markdown", () => {
  it("carries a markdown callout into Offprint's callout block", () => {
    const result = convert(
      markpubContent("> [!WARNING] Careful\n> Mind the gap."),
      "offprint",
    );
    expect(items(result)[0]).toMatchObject({
      $type: "app.offprint.block.callout",
      plaintext: "Mind the gap.",
    });
    // Offprint has a callout block but no marker type or title to put them in.
    expect(codes(result)).toContain("detail-dropped");
  });

  it("round-trips a callout marker through markpub", () => {
    const result = convert(
      markpubContent("> [!WARNING]- Careful\n> Mind the gap."),
      "markpub",
    );
    expect(result.unchanged).toBe(true);

    // Via a block format and back, the marker is reconstructed.
    const viaOffprint = convert(
      markpubContent("> [!WARNING] Careful\n> Mind the gap."),
      "offprint",
    );
    const back = convert(viaOffprint.content, "markpub");
    expect(markdown(back)).toContain("> Mind the gap.");
  });

  it("carries markdown footnotes into Leaflet, which has real footnotes", () => {
    const result = convert(
      markpubContent("A claim[^1].\n\n[^1]: The evidence."),
      "leaflet",
    );
    const block = leafletBlocks(result)[0] as {
      facets: Array<{ features: Array<Record<string, unknown>> }>;
    };
    const footnote = block.facets[0]?.features.find((feature) =>
      String(feature.$type).endsWith("#footnote"),
    );
    expect(footnote).toMatchObject({
      $type: "pub.leaflet.richtext.facet#footnote",
      footnoteId: "1",
    });
    expect(result.lossless).toBe(true);
  });

  it("reports markdown footnotes as lost when the target has none", () => {
    const result = convert(
      markpubContent("A claim[^1].\n\n[^1]: The evidence."),
      "pckt",
    );
    expect(codes(result)).toContain("footnotes-unsupported");
    expect(result.lossless).toBe(false);
  });
});

describe("markpub → block formats", () => {
  it("parses markdown back into pckt blocks", () => {
    const result = convert(
      markpubContent("# Title\n\nSome **bold** text.\n\n- one\n- two"),
      "pckt",
    );
    const emitted = items(result);
    expect(emitted[0]).toMatchObject({
      $type: "blog.pckt.block.heading",
      plaintext: "Title",
    });
    expect(emitted[1]).toMatchObject({ plaintext: "Some bold text." });
    expect(emitted[2]).toMatchObject({ $type: "blog.pckt.block.bulletList" });
  });

  it("carries markdown emphasis into the target's facet dialect", () => {
    const result = convert(markpubContent("Some **bold** text."), "leaflet");
    const block = leafletBlocks(result)[0] as {
      facets: Array<{ features: Array<{ $type: string }> }>;
    };
    expect(block.facets[0]?.features[0]?.$type).toBe(
      "pub.leaflet.richtext.facet#bold",
    );
  });
});
