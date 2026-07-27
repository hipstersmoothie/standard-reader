import { describe, expect, it } from "vitest";

import { leafletBlocks } from "./blocks";
import { collectLeafletFootnotes } from "./footnotes";
import {
  LEAFLET_BLOCK,
  LEAFLET_CONTENT,
  LEAFLET_FACET,
  LEAFLET_PAGE,
} from "./types";

function footnoteFeature(
  footnoteId: string,
  contentPlaintext: string,
  contentFacets?: Array<unknown>,
) {
  return {
    $type: LEAFLET_FACET.footnote,
    footnoteId,
    contentPlaintext,
    ...(contentFacets ? { contentFacets } : {}),
  };
}

function textBlockEntry(plaintext: string, facets: Array<unknown>) {
  return {
    $type: LEAFLET_PAGE.linearDocumentBlock,
    block: { $type: LEAFLET_BLOCK.text, plaintext, facets },
  };
}

function contentWithBlocks(blocks: Array<unknown>) {
  return {
    $type: LEAFLET_CONTENT,
    pages: [{ $type: LEAFLET_PAGE.linearDocument, id: "root", blocks }],
  };
}

describe("collectLeafletFootnotes", () => {
  it("numbers footnotes in document + byte order", () => {
    const blocks = leafletBlocks(
      contentWithBlocks([
        textBlockEntry("second first", [
          {
            index: { byteStart: 7, byteEnd: 12 },
            features: [footnoteFeature("b", "note b")],
          },
          {
            index: { byteStart: 0, byteEnd: 6 },
            features: [footnoteFeature("a", "note a")],
          },
        ]),
        textBlockEntry("third", [
          {
            index: { byteStart: 0, byteEnd: 5 },
            features: [footnoteFeature("c", "note c")],
          },
        ]),
      ]),
    );

    const { footnotes, numberById } = collectLeafletFootnotes(blocks);

    expect(footnotes.map((f) => [f.id, f.number, f.contentPlaintext])).toEqual([
      ["a", 1, "note a"],
      ["b", 2, "note b"],
      ["c", 3, "note c"],
    ]);
    expect(numberById.get("a")).toBe(1);
    expect(numberById.get("c")).toBe(3);
  });

  it("dedupes a footnote referenced more than once", () => {
    const blocks = leafletBlocks(
      contentWithBlocks([
        textBlockEntry("one", [
          {
            index: { byteStart: 0, byteEnd: 3 },
            features: [footnoteFeature("dup", "shared")],
          },
        ]),
        textBlockEntry("two", [
          {
            index: { byteStart: 0, byteEnd: 3 },
            features: [footnoteFeature("dup", "shared")],
          },
        ]),
      ]),
    );

    const { footnotes, numberById } = collectLeafletFootnotes(blocks);

    expect(footnotes).toHaveLength(1);
    expect(footnotes[0]).toMatchObject({ id: "dup", number: 1 });
    expect(numberById.get("dup")).toBe(1);
  });

  it("carries the footnote's inline content facets through", () => {
    const contentFacets = [
      {
        index: { byteStart: 0, byteEnd: 4 },
        features: [{ $type: LEAFLET_FACET.bold }],
      },
    ];
    const blocks = leafletBlocks(
      contentWithBlocks([
        textBlockEntry("ref", [
          {
            index: { byteStart: 0, byteEnd: 3 },
            features: [footnoteFeature("f", "bold text", contentFacets)],
          },
        ]),
      ]),
    );

    const { footnotes } = collectLeafletFootnotes(blocks);
    expect(footnotes[0]?.contentFacets).toEqual(contentFacets);
  });

  it("collects footnotes from list items and page embeds", () => {
    const blocks = leafletBlocks(
      contentWithBlocks([
        {
          $type: LEAFLET_PAGE.linearDocumentBlock,
          block: {
            $type: LEAFLET_BLOCK.unorderedList,
            children: [
              {
                $type: LEAFLET_BLOCK.unorderedListItem,
                content: {
                  $type: LEAFLET_BLOCK.text,
                  plaintext: "item",
                  facets: [
                    {
                      index: { byteStart: 0, byteEnd: 4 },
                      features: [footnoteFeature("list", "list note")],
                    },
                  ],
                },
              },
            ],
          },
        },
      ]),
    );

    const { footnotes } = collectLeafletFootnotes(blocks);
    expect(footnotes.map((f) => f.id)).toEqual(["list"]);
  });

  it("ignores non-footnote features and malformed footnotes", () => {
    const blocks = leafletBlocks(
      contentWithBlocks([
        textBlockEntry("link me", [
          {
            index: { byteStart: 0, byteEnd: 7 },
            features: [
              { $type: LEAFLET_FACET.link, uri: "https://example.com" },
              { $type: LEAFLET_FACET.footnote, contentPlaintext: "no id" },
            ],
          },
        ]),
      ]),
    );

    const { footnotes } = collectLeafletFootnotes(blocks);
    expect(footnotes).toHaveLength(0);
  });
});
