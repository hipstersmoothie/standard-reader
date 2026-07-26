import { describe, expect, it } from "vitest";

import { errorResult, jsonResult, slim } from "./format.js";

describe("slim", () => {
  it("drops the renderable body by default", () => {
    expect(slim({ title: "Post", content: [{ type: "paragraph" }] })).toEqual({
      title: "Post",
    });
  });

  it("keeps the renderable body when asked", () => {
    const view = { title: "Post", content: [{ type: "paragraph" }] };
    expect(slim(view, { includeContent: true })).toEqual(view);
  });

  it("drops null and undefined so absent fields don't fill the context", () => {
    expect(slim({ a: 1, b: null, c: undefined })).toEqual({ a: 1 });
  });

  it("recurses through arrays and nested objects", () => {
    expect(
      slim({
        items: [
          { title: "a", searchSnippetHtml: "<b>a</b>", nested: { content: 1 } },
        ],
      }),
    ).toEqual({ items: [{ title: "a", nested: {} }] });
  });

  it("leaves primitives alone", () => {
    expect(slim("hello")).toBe("hello");
    expect(slim(3)).toBe(3);
    expect(slim(false)).toBe(false);
  });
});

describe("results", () => {
  it("serialises JSON payloads as text content", () => {
    const result = jsonResult({ ok: true });
    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({
      ok: true,
    });
  });

  it("marks errors in-band with their message", () => {
    const result = errorResult(new Error("nope"));
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toBe("nope");
  });
});
