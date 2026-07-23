import { describe, expect, it } from "vitest";

import { ipldToLexJson } from "./ipld-json";

describe("ipldToLexJson", () => {
  it("converts a dag-json CID link to a lex $link", () => {
    expect(ipldToLexJson({ "/": "bafkreiabc" })).toEqual({
      $link: "bafkreiabc",
    });
  });

  it("converts a dag-json bytes node to a lex $bytes", () => {
    expect(ipldToLexJson({ "/": { bytes: "AAEC" } })).toEqual({
      $bytes: "AAEC",
    });
  });

  it("rewrites blob refs inside a nested content payload", () => {
    const content = {
      $type: "pub.leaflet.content",
      pages: [
        {
          blocks: [
            {
              block: {
                image: {
                  ref: { "/": "bafkreiimg" },
                  size: 42,
                  $type: "blob",
                  mimeType: "image/jpeg",
                },
              },
            },
          ],
        },
      ],
    };
    expect(ipldToLexJson(content)).toEqual({
      $type: "pub.leaflet.content",
      pages: [
        {
          blocks: [
            {
              block: {
                image: {
                  ref: { $link: "bafkreiimg" },
                  size: 42,
                  $type: "blob",
                  mimeType: "image/jpeg",
                },
              },
            },
          ],
        },
      ],
    });
  });

  it("leaves an object that merely has a '/' key among others untouched", () => {
    const input = { "/": "not-a-link", other: 1 };
    expect(ipldToLexJson(input)).toEqual({ "/": "not-a-link", other: 1 });
  });

  it("passes through primitives, arrays, and already-lex $link forms", () => {
    expect(ipldToLexJson("x")).toBe("x");
    expect(ipldToLexJson(7)).toBe(7);
    expect(ipldToLexJson(null)).toBe(null);
    expect(ipldToLexJson([{ "/": "bafk1" }, { $link: "bafk2" }])).toEqual([
      { $link: "bafk1" },
      { $link: "bafk2" },
    ]);
  });
});
