import { describe, expect, it } from "vitest";

import { previewText } from "./document-content";

describe("previewText", () => {
  it("collapses whitespace and trims", () => {
    expect(previewText("  hello\n\n  world\t")).toBe("hello world");
  });

  it("returns an empty string for null", () => {
    expect(previewText(null)).toBe("");
  });

  it("passes short text through untouched", () => {
    expect(previewText("A short intro.")).toBe("A short intro.");
  });

  it("truncates long text with an ellipsis at the limit", () => {
    const long = "x".repeat(200);
    const out = previewText(long, 140);
    expect(out).toHaveLength(140);
    expect(out.endsWith("…")).toBe(true);
    expect(out.slice(0, -1)).toBe("x".repeat(139));
  });

  it("honors a custom max length", () => {
    expect(previewText("abcdef", 4)).toBe("abc…");
  });
});
