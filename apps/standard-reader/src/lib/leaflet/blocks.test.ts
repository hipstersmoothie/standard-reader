import { describe, expect, it } from "vitest";

import {
  LEAFLET_BLOCK,
  LEAFLET_CONTENT,
  LEAFLET_PAGE,
} from "#/lib/leaflet/types";

import {
  leafletBlocks,
  leafletHasRootCanvas,
  leafletWebsiteSrc,
} from "./blocks";

describe("leafletBlocks page references", () => {
  it("inlines linear page refs on a canvas in y/x reading order", () => {
    const blocks = leafletBlocks({
      $type: LEAFLET_CONTENT,
      pages: [
        {
          $type: LEAFLET_PAGE.canvas,
          id: "canvas-root",
          blocks: [
            {
              $type: LEAFLET_PAGE.canvasBlock,
              x: 10,
              y: 200,
              block: { $type: LEAFLET_BLOCK.page, id: "child-page" },
            },
            {
              $type: LEAFLET_PAGE.canvasBlock,
              x: 5,
              y: 100,
              block: {
                $type: LEAFLET_BLOCK.text,
                plaintext: "On canvas",
              },
            },
          ],
        },
        {
          $type: LEAFLET_PAGE.linearDocument,
          id: "child-page",
          blocks: [
            {
              $type: LEAFLET_PAGE.linearDocumentBlock,
              block: {
                $type: LEAFLET_BLOCK.text,
                plaintext: "From referenced page",
              },
            },
          ],
        },
      ],
    });

    expect(blocks.map((block) => block.kind)).toEqual(["text", "pageEmbed"]);
    expect(blocks[0]).toMatchObject({
      kind: "text",
      block: { plaintext: "On canvas" },
    });
    expect(blocks[1]).toMatchObject({
      kind: "pageEmbed",
      pageId: "child-page",
      blocks: [
        {
          kind: "text",
          block: { plaintext: "From referenced page" },
        },
      ],
    });
    expect(blocks.every((block) => block.kind !== "unknown")).toBe(true);
  });

  it("inlines linear page refs in linear documents", () => {
    const blocks = leafletBlocks({
      $type: LEAFLET_CONTENT,
      pages: [
        {
          $type: LEAFLET_PAGE.linearDocument,
          id: "root",
          blocks: [
            {
              $type: LEAFLET_PAGE.linearDocumentBlock,
              block: { $type: LEAFLET_BLOCK.page, id: "child-page" },
            },
          ],
        },
        {
          $type: LEAFLET_PAGE.linearDocument,
          id: "child-page",
          blocks: [
            {
              $type: LEAFLET_PAGE.linearDocumentBlock,
              block: {
                $type: LEAFLET_BLOCK.header,
                level: 2,
                plaintext: "Nested section",
              },
            },
          ],
        },
      ],
    });

    expect(blocks).toEqual([
      {
        kind: "pageEmbed",
        pageId: "child-page",
        pageType: LEAFLET_PAGE.linearDocument,
        blocks: [
          {
            kind: "header",
            block: expect.objectContaining({ plaintext: "Nested section" }),
          },
        ],
      },
    ]);
  });
});

describe("leafletBlocks website", () => {
  it("parses website src from current lexicon field", () => {
    const blocks = leafletBlocks({
      $type: LEAFLET_CONTENT,
      pages: [
        {
          $type: "pub.leaflet.pages.linearDocument",
          id: "root",
          blocks: [
            {
              block: {
                $type: LEAFLET_BLOCK.website,
                src: "https://example.com/article",
                title: "Example",
              },
            },
          ],
        },
      ],
    });

    expect(blocks).toEqual([
      {
        kind: "website",
        block: expect.objectContaining({
          src: "https://example.com/article",
          url: "https://example.com/article",
          title: "Example",
        }),
      },
    ]);
  });

  it("falls back to legacy url field", () => {
    const blocks = leafletBlocks({
      $type: LEAFLET_CONTENT,
      pages: [
        {
          $type: "pub.leaflet.pages.linearDocument",
          id: "root",
          blocks: [
            {
              block: {
                $type: LEAFLET_BLOCK.website,
                url: "https://legacy.example.com",
              },
            },
          ],
        },
      ],
    });

    expect(blocks[0]).toMatchObject({
      kind: "website",
      block: {
        src: "https://legacy.example.com",
        url: "https://legacy.example.com",
      },
    });
  });

  it("prefers src over url when both are present", () => {
    expect(
      leafletWebsiteSrc({
        src: "https://current.example.com",
        url: "https://legacy.example.com",
      }),
    ).toBe("https://current.example.com");
  });
});

describe("leafletBlocks html", () => {
  function htmlDoc(block: Record<string, unknown>) {
    return {
      $type: LEAFLET_CONTENT,
      pages: [
        {
          $type: LEAFLET_PAGE.linearDocument,
          id: "root",
          blocks: [{ $type: LEAFLET_PAGE.linearDocumentBlock, block }],
        },
      ],
    };
  }

  it("parses an html block with its requested height", () => {
    const blocks = leafletBlocks(
      htmlDoc({
        $type: LEAFLET_BLOCK.html,
        height: 243,
        html: "<p>widget</p>",
      }),
    );

    expect(blocks).toEqual([
      {
        kind: "html",
        block: expect.objectContaining({ height: 243, html: "<p>widget</p>" }),
      },
    ]);
  });

  it("drops an html block with no markup instead of calling it unsupported", () => {
    const blocks = leafletBlocks(
      htmlDoc({ $type: LEAFLET_BLOCK.html, html: "   " }),
    );

    expect(blocks).toEqual([]);
  });
});

describe("leafletBlocks canvas posts", () => {
  function canvasDoc(
    entries: Array<Record<string, unknown>>,
    extraPages: Array<Record<string, unknown>> = [],
  ) {
    return {
      $type: LEAFLET_CONTENT,
      pages: [
        {
          $type: LEAFLET_PAGE.canvas,
          id: "canvas-root",
          blocks: entries.map((entry, index) => ({
            $type: LEAFLET_PAGE.canvasBlock,
            x: 0,
            y: index * 100,
            width: 600,
            ...entry,
          })),
        },
        ...extraPages,
      ],
    };
  }

  const drawing = {
    $type: LEAFLET_BLOCK.drawing,
    viewBox: { x: 0, y: 0, width: 200, height: 100 },
    strokes: [
      { points: [0, 0, 500, 100, 50, 500], color: "#008DFF", size: 16 },
    ],
  };

  it("drops the blocks Leaflet fills in at render time", () => {
    const blocks = leafletBlocks(
      canvasDoc([
        { block: { $type: LEAFLET_BLOCK.postHeader } },
        { block: { $type: LEAFLET_BLOCK.text, plaintext: "Body" } },
        { block: { $type: LEAFLET_BLOCK.postsList, view: "small" } },
        { block: { $type: LEAFLET_BLOCK.recommendedPubs } },
        { block: { $type: LEAFLET_BLOCK.questions } },
        { block: { $type: LEAFLET_BLOCK.reply, promptText: "Reply!" } },
      ]),
    );

    expect(blocks.map((block) => block.kind)).toEqual(["text"]);
  });

  it("flattens a linear document placed on the canvas into its blocks", () => {
    const blocks = leafletBlocks(
      canvasDoc([
        {
          block: {
            $type: LEAFLET_PAGE.linearDocument,
            blocks: [
              {
                $type: LEAFLET_PAGE.linearDocumentBlock,
                block: { $type: LEAFLET_BLOCK.text, plaintext: "One" },
              },
              {
                $type: LEAFLET_PAGE.linearDocumentBlock,
                block: { $type: LEAFLET_BLOCK.text, plaintext: "Two" },
              },
            ],
          },
        },
      ]),
    );

    expect(blocks).toMatchObject([
      { kind: "text", block: { plaintext: "One" } },
      { kind: "text", block: { plaintext: "Two" } },
    ]);
  });

  it("places every block where the canvas put it, in reading order", () => {
    const blocks = leafletBlocks(
      canvasDoc([
        {
          x: 849,
          y: 58,
          width: 146,
          rotation: -1,
          stackOrder: "a4",
          block: { $type: LEAFLET_BLOCK.image, image: {}, alt: "Vine" },
        },
        {
          x: 503,
          y: 302,
          width: 360,
          stackOrder: "a0",
          block: { $type: LEAFLET_BLOCK.text, plaintext: "Hi" },
        },
        { x: 10, y: 302, width: 77, block: drawing },
      ]),
    );

    expect(blocks.map((block) => block.kind)).toEqual([
      "image",
      "drawing",
      "text",
    ]);
    expect(blocks.map((block) => block.canvas)).toMatchObject([
      { x: 849, y: 58, width: 146, rotation: -1, layer: 3 },
      // No stackOrder: below every layered block.
      { x: 10, y: 302, width: 77, layer: 1 },
      { x: 503, y: 302, width: 360, layer: 2 },
    ]);
    expect(blocks[0]?.canvas?.frame).toMatchObject({
      pageId: "canvas-root",
      root: true,
    });
    expect(blocks[0]?.canvas?.frame).toBe(blocks[2]?.canvas?.frame);
    expect(leafletHasRootCanvas(canvasDoc([{ block: drawing }]))).toBe(true);
  });

  it("gives every block of a placed linear document one placement", () => {
    const blocks = leafletBlocks(
      canvasDoc([
        {
          block: {
            $type: LEAFLET_PAGE.linearDocument,
            blocks: [
              {
                $type: LEAFLET_PAGE.linearDocumentBlock,
                block: { $type: LEAFLET_BLOCK.text, plaintext: "One" },
              },
              {
                $type: LEAFLET_PAGE.linearDocumentBlock,
                block: { $type: LEAFLET_BLOCK.text, plaintext: "Two" },
              },
            ],
          },
        },
      ]),
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.canvas).toBeDefined();
    expect(blocks[0]?.canvas).toBe(blocks[1]?.canvas);
  });

  it("shows an embedded canvas inline, not again as a root page", () => {
    const doc = {
      $type: LEAFLET_CONTENT,
      pages: [
        {
          $type: LEAFLET_PAGE.linearDocument,
          id: "root",
          blocks: [
            {
              $type: LEAFLET_PAGE.linearDocumentBlock,
              block: { $type: LEAFLET_BLOCK.text, plaintext: "Before" },
            },
            {
              $type: LEAFLET_PAGE.linearDocumentBlock,
              block: { $type: LEAFLET_BLOCK.embeddedCanvas, id: "art" },
            },
          ],
        },
        {
          $type: LEAFLET_PAGE.canvas,
          id: "art",
          blocks: [
            {
              $type: LEAFLET_PAGE.canvasBlock,
              x: 0,
              y: 50,
              width: 120,
              block: drawing,
            },
            {
              $type: LEAFLET_PAGE.canvasBlock,
              x: 0,
              y: 0,
              width: 300,
              block: { $type: LEAFLET_BLOCK.text, plaintext: "Caption" },
            },
          ],
        },
      ],
    };
    const blocks = leafletBlocks(doc);

    expect(blocks).toMatchObject([
      { kind: "text", block: { plaintext: "Before" } },
      { kind: "text", block: { plaintext: "Caption" } },
      { kind: "drawing", canvas: { width: 120, y: 50 } },
    ]);
    expect(blocks[0]?.canvas).toBeUndefined();
    expect(blocks[2]?.canvas?.frame).toMatchObject({
      pageId: "art",
      root: false,
    });
    expect(leafletHasRootCanvas(doc)).toBe(false);
  });

  it("hangs a canvas shown on another canvas from its entry there", () => {
    const blocks = leafletBlocks({
      $type: LEAFLET_CONTENT,
      pages: [
        {
          $type: LEAFLET_PAGE.canvas,
          id: "outer",
          blocks: [
            {
              $type: LEAFLET_PAGE.canvasBlock,
              x: 100,
              y: 200,
              width: 640,
              block: {
                $type: LEAFLET_BLOCK.embeddedCanvas,
                id: "inner",
                alt: "A sketch",
              },
            },
          ],
        },
        {
          $type: LEAFLET_PAGE.canvas,
          id: "inner",
          width: 624,
          height: 240,
          blocks: [
            {
              $type: LEAFLET_PAGE.canvasBlock,
              x: 0,
              y: 0,
              width: 120,
              block: drawing,
            },
          ],
        },
      ],
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.canvas).toMatchObject({
      width: 120,
      frame: { pageId: "inner", width: 624, height: 240, alt: "A sketch" },
      parent: { x: 100, y: 200, width: 640, frame: { pageId: "outer" } },
    });
  });

  it("parses a members-only delimiter and drops an inkless drawing", () => {
    const blocks = leafletBlocks(
      canvasDoc([
        { block: { $type: LEAFLET_BLOCK.drawing, strokes: [] } },
        {
          block: {
            $type: LEAFLET_BLOCK.membersOnlyDelimiter,
            audience: "subscribers",
          },
        },
      ]),
    );

    expect(blocks).toMatchObject([
      {
        kind: "membersOnlyDelimiter",
        block: { audience: "subscribers" },
        canvas: { y: 100 },
      },
    ]);
  });
});
