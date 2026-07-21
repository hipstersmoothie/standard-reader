import { describe, expect, it } from "vitest";

import {
  LEAFLET_BLOCK,
  LEAFLET_CONTENT,
  LEAFLET_PAGE,
} from "#/lib/leaflet/types";

import type { LeafletCommentQuote } from "./comment";
import {
  extractLeafletQuoteText,
  leafletCommentDrawerUrl,
  normalizeLeafletComment,
} from "./comment";

const DOC_URI = "at://did:plc:example/site.standard.document/abc123";

function content(...paragraphs: Array<string>) {
  return {
    $type: LEAFLET_CONTENT,
    pages: [
      {
        $type: LEAFLET_PAGE.linearDocument,
        blocks: paragraphs.map((plaintext) => ({
          $type: LEAFLET_PAGE.linearDocumentBlock,
          block: { $type: LEAFLET_BLOCK.text, plaintext },
        })),
      },
    ],
  };
}

function quote(
  startBlock: Array<number>,
  startOffset: number,
  endBlock: Array<number>,
  endOffset: number,
) {
  return {
    $type: "pub.leaflet.comment#linearDocumentQuote",
    document: DOC_URI,
    quote: {
      start: { block: startBlock, offset: startOffset },
      end: { block: endBlock, offset: endOffset },
    },
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    $type: "pub.leaflet.comment",
    subject: DOC_URI,
    plaintext: "nice piece",
    createdAt: "2026-07-16T23:20:18.024Z",
    ...overrides,
  };
}

function normalize(overrides: Record<string, unknown> = {}) {
  return normalizeLeafletComment(
    "at://did:plc:author/pub.leaflet.comment/xyz",
    "did:plc:author",
    "xyz",
    record(overrides),
  );
}

/** A parsed quote anchor, so the extraction tests read without null juggling. */
function anchor(
  startBlock: Array<number>,
  startOffset: number,
  endBlock: Array<number>,
  endOffset: number,
): LeafletCommentQuote {
  const parsed = normalize({
    attachment: quote(startBlock, startOffset, endBlock, endOffset),
  });
  if (!parsed?.quote) throw new Error("fixture did not parse into a quote");
  return parsed.quote;
}

describe("normalizeLeafletComment", () => {
  it("reads a minimal top-level comment", () => {
    const comment = normalize();
    expect(comment?.plaintext).toBe("nice piece");
    expect(comment?.subject).toBe(DOC_URI);
    expect(comment?.parentUri).toBeNull();
    expect(comment?.quote).toBeNull();
  });

  it("surfaces reply.parent so threaded replies can be filtered out", () => {
    const comment = normalize({
      reply: { parent: "at://did:plc:other/pub.leaflet.comment/parent1" },
    });
    expect(comment?.parentUri).toBe(
      "at://did:plc:other/pub.leaflet.comment/parent1",
    );
  });

  it("parses a linearDocumentQuote attachment", () => {
    const comment = normalize({ attachment: quote([7], 434, [7], 657) });
    expect(comment?.quote).toEqual({
      document: DOC_URI,
      start: { block: [7], offset: 434 },
      end: { block: [7], offset: 657 },
    });
  });

  it("ignores attachments of unknown union types", () => {
    const comment = normalize({
      attachment: { $type: "pub.leaflet.comment#somethingElse" },
    });
    expect(comment?.quote).toBeNull();
  });

  it("rejects records missing required fields or of the wrong type", () => {
    expect(normalize({ subject: undefined })).toBeNull();
    expect(normalize({ plaintext: undefined })).toBeNull();
    expect(normalize({ createdAt: undefined })).toBeNull();
    expect(normalize({ $type: "app.bsky.feed.post" })).toBeNull();
  });
});

describe("extractLeafletQuoteText", () => {
  const doc = content("First paragraph.", "Second paragraph here.", "Third.");

  it("slices a range within a single block by character offset", () => {
    // Character offsets, not UTF-8 bytes — verified against live records.
    expect(extractLeafletQuoteText(doc, anchor([1], 7, [1], 16))).toBe(
      "paragraph",
    );
  });

  it("uses character offsets even when earlier text is multi-byte", () => {
    const accented = content("héllo wörld — foo");
    expect(extractLeafletQuoteText(accented, anchor([0], 14, [0], 17))).toBe(
      "foo",
    );
  });

  it("joins a selection spanning several blocks", () => {
    expect(extractLeafletQuoteText(doc, anchor([0], 6, [2], 5))).toBe(
      "paragraph.\n\nSecond paragraph here.\n\nThird",
    );
  });

  it("truncates very long selections", () => {
    const long = content("a".repeat(900));
    const text = extractLeafletQuoteText(long, anchor([0], 0, [0], 900));
    expect(text).toHaveLength(601);
    expect(text?.endsWith("…")).toBe(true);
  });

  it("returns null when the anchor cannot be resolved", () => {
    expect(extractLeafletQuoteText(doc, anchor([99], 0, [99], 5))).toBeNull();
    expect(extractLeafletQuoteText(doc, anchor([1], 10, [1], 2))).toBeNull();

    const imageBlock = {
      $type: LEAFLET_CONTENT,
      pages: [
        {
          $type: LEAFLET_PAGE.linearDocument,
          blocks: [
            {
              $type: LEAFLET_PAGE.linearDocumentBlock,
              block: { $type: LEAFLET_BLOCK.image, alt: "cover" },
            },
          ],
        },
      ],
    };
    expect(
      extractLeafletQuoteText(imageBlock, anchor([0], 0, [0], 3)),
    ).toBeNull();
  });

  it("returns null for non-Leaflet content", () => {
    const range = anchor([0], 0, [0], 5);
    expect(
      extractLeafletQuoteText({ $type: "blog.pckt.content" }, range),
    ).toBeNull();
    expect(extractLeafletQuoteText(null, range)).toBeNull();
  });
});

describe("leafletCommentDrawerUrl", () => {
  it("builds a drawer link for leaflet.pub-hosted publications", () => {
    expect(
      leafletCommentDrawerUrl("https://foo.leaflet.pub/3mqsc4nqyj22u"),
    ).toBe("https://foo.leaflet.pub/3mqsc4nqyj22u?interactionDrawer=comments");
  });

  it("returns null for publications hosted elsewhere", () => {
    expect(leafletCommentDrawerUrl("https://example.com/post")).toBeNull();
    expect(
      leafletCommentDrawerUrl("https://notleaflet.pub.evil.com/x"),
    ).toBeNull();
    expect(leafletCommentDrawerUrl(null)).toBeNull();
    expect(leafletCommentDrawerUrl("not a url")).toBeNull();
  });
});
