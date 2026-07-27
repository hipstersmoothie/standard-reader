import { describe, expect, it } from "vitest";

import { sanitizeArticleHtml } from "./sanitize-html";

/**
 * `renderer-core` hands raw HTML from a markdown body to the host untouched and
 * renders nothing for it by default, so this function is the only thing between
 * a publisher's markup and `dangerouslySetInnerHTML`. It runs the same schema
 * the markdown pipeline has always used.
 */
describe("sanitizeArticleHtml", () => {
  it("keeps markup publishers are allowed to write", () => {
    expect(sanitizeArticleHtml("<mark>highlighted</mark>")).toBe(
      "<mark>highlighted</mark>",
    );
    expect(
      sanitizeArticleHtml('<article class="playlist-card">x</article>'),
    ).toBe('<article class="playlist-card">x</article>');
    expect(sanitizeArticleHtml("<p><em>kept</em></p>")).toBe(
      "<p><em>kept</em></p>",
    );
  });

  it("unwraps a tag outside the schema but keeps its text", () => {
    // The schema is an allow-list, so `<aside>` is not permitted — the same
    // rule the markdown pipeline has always applied. Losing a wrapper is
    // acceptable; losing the words would not be.
    expect(sanitizeArticleHtml("<aside>Hello</aside>")).toBe("Hello");
  });

  it("drops a class the schema does not allow", () => {
    // Only `playlist-*` classes are permitted on a div.
    // The attribute survives with an empty value rather than being removed,
    // which is how `hast-util-sanitize` filters an allow-listed class list.
    expect(sanitizeArticleHtml('<div class="evil">x</div>')).toBe(
      '<div class="">x</div>',
    );
    expect(sanitizeArticleHtml('<div class="playlist-card">x</div>')).toBe(
      '<div class="playlist-card">x</div>',
    );
  });

  it("strips a script tag entirely", () => {
    expect(sanitizeArticleHtml('<script>alert("xss")</script>')).toBe("");
  });

  it("strips event handlers while keeping the element", () => {
    const result = sanitizeArticleHtml('<div onclick="steal()">Text</div>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("Text");
  });

  it("drops a javascript: URL from a link", () => {
    const result = sanitizeArticleHtml(
      `<a href="${"javascript"}:alert(1)">click</a>`,
    );
    expect(result).not.toContain("javascript:");
    expect(result).toContain("click");
  });

  it("keeps an ordinary link intact", () => {
    expect(sanitizeArticleHtml('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com">x</a>',
    );
  });

  it("returns empty for blank input, so callers can skip the block", () => {
    expect(sanitizeArticleHtml("")).toBe("");
    expect(sanitizeArticleHtml("   \n  ")).toBe("");
  });
});
