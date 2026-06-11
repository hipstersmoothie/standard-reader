import { describe, expect, it } from "vitest";

import {
  sanitizeTsHeadlineHtml,
  tsHeadlineHasMatch,
} from "./search-headline.ts";

describe("sanitizeTsHeadlineHtml", () => {
  it("preserves mark wrappers and escapes other HTML", () => {
    expect(
      sanitizeTsHeadlineHtml(
        'A <mark>climate</mark> story about <script>alert(1)</script>',
      ),
    ).toBe(
      "A <mark>climate</mark> story about &lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("returns null for blank input", () => {
    expect(sanitizeTsHeadlineHtml("   ")).toBeNull();
  });
});

describe("tsHeadlineHasMatch", () => {
  it("detects highlighted terms", () => {
    expect(tsHeadlineHasMatch("No hits here")).toBe(false);
    expect(tsHeadlineHasMatch("A <mark>match</mark> here")).toBe(true);
  });
});
