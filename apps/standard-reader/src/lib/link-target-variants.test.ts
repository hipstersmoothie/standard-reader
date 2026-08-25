import { describe, expect, it } from "vitest";

import { articleLinkTarget } from "./link-target-variants";

describe("articleLinkTarget", () => {
  it("keeps article-page URLs", () => {
    expect(articleLinkTarget("https://blog.example/some-article")).toBe(
      "https://blog.example/some-article",
    );
  });

  it("rejects bare site roots, with and without the trailing slash", () => {
    expect(articleLinkTarget("https://standard-reader.app")).toBeNull();
    expect(articleLinkTarget("https://standard-reader.app/")).toBeNull();
  });

  it("keeps roots that carry a query or fragment", () => {
    expect(articleLinkTarget("https://blog.example/?p=42")).toBe(
      "https://blog.example/?p=42",
    );
    expect(articleLinkTarget("https://blog.example/#section")).toBe(
      "https://blog.example/#section",
    );
  });

  it("passes through non-absolute URLs untouched", () => {
    expect(articleLinkTarget("blog.example/some-article")).toBe(
      "blog.example/some-article",
    );
  });

  it("returns null for null and blank input", () => {
    expect(articleLinkTarget(null)).toBeNull();
    expect(articleLinkTarget("   ")).toBeNull();
  });
});
