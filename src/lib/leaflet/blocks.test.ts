import {
  LEAFLET_BLOCK,
  LEAFLET_CONTENT,
  LEAFLET_PAGE,
} from "#/lib/leaflet/types";
import { describe, expect, it } from "vitest";

import { leafletBlocks, leafletWebsiteSrc } from "./blocks";

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

    expect(blocks.map((block) => block.kind)).toEqual([
      "text",
      "pageEmbed",
    ]);
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
