import { PCKT_BLOCK, PCKT_CONTENT } from "#/lib/pckt/types";
import { describe, expect, it } from "vitest";

import { asTextBlock, pcktBlocks } from "./blocks";

describe("pcktBlocks", () => {
  it("parses iframe url from attrs", () => {
    const blocks = pcktBlocks({
      $type: PCKT_CONTENT,
      items: [
        {
          $type: PCKT_BLOCK.iframe,
          attrs: { url: "https://www.youtube.com/embed/example" },
        },
      ],
    });

    expect(blocks).toEqual([
      {
        kind: "iframe",
        block: expect.objectContaining({
          url: "https://www.youtube.com/embed/example",
        }),
      },
    ]);
  });

  it("parses empty top-level text blocks without marking unknown", () => {
    const blocks = pcktBlocks({
      $type: PCKT_CONTENT,
      items: [{ $type: PCKT_BLOCK.text }],
    });

    expect(blocks).toEqual([
      {
        kind: "text",
        block: expect.objectContaining({ plaintext: "" }),
      },
    ]);
  });

  it("flattens inline content with hard breaks into plaintext", () => {
    const blocks = pcktBlocks({
      $type: PCKT_CONTENT,
      items: [
        {
          $type: PCKT_BLOCK.text,
          content: [
            { $type: PCKT_BLOCK.text, plaintext: "line one" },
            { $type: PCKT_BLOCK.hardBreak },
            { $type: PCKT_BLOCK.text, plaintext: "line two" },
          ],
        },
      ],
    });

    expect(blocks[0]).toMatchObject({
      kind: "text",
      block: { plaintext: "line one\nline two" },
    });
  });

  it("parses heading plaintext from inline content", () => {
    const blocks = pcktBlocks({
      $type: PCKT_CONTENT,
      items: [
        {
          $type: PCKT_BLOCK.heading,
          level: 3,
          content: [
            { $type: PCKT_BLOCK.text, plaintext: "Section" },
            { $type: PCKT_BLOCK.hardBreak },
          ],
        },
      ],
    });

    expect(blocks[0]).toMatchObject({
      kind: "heading",
      block: { plaintext: "Section\n", level: 3 },
    });
  });

  it("does not surface supported block types as unknown", () => {
    const blocks = pcktBlocks({
      $type: PCKT_CONTENT,
      items: [
        {
          $type: PCKT_BLOCK.iframe,
          attrs: { url: "https://example.com/embed" },
        },
        { $type: PCKT_BLOCK.text },
        {
          $type: PCKT_BLOCK.heading,
          level: 2,
          content: [{ $type: PCKT_BLOCK.text }],
        },
      ],
    });

    expect(blocks.every((block) => block.kind !== "unknown")).toBe(true);
  });
});

describe("asTextBlock", () => {
  it("returns null for non-text blocks", () => {
    expect(asTextBlock({ $type: PCKT_BLOCK.heading, plaintext: "Hi" })).toBe(
      null,
    );
  });
});
