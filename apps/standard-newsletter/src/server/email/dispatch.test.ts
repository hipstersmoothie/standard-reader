import { describe, expect, it } from "vitest";

import { canonicalUrlFor } from "./dispatch.server";

describe("canonicalUrlFor", () => {
  it("prefers an explicit canonical url", () => {
    expect(
      canonicalUrlFor("https://canonical.example/post", "https://x.com", "p"),
    ).toBe("https://canonical.example/post");
  });

  it("joins the publication origin and path", () => {
    expect(canonicalUrlFor(null, "https://blog.example", "hello-world")).toBe(
      "https://blog.example/hello-world",
    );
  });

  it("collapses slashes on either side of the join", () => {
    expect(canonicalUrlFor(null, "https://blog.example/", "/hello")).toBe(
      "https://blog.example/hello",
    );
  });

  it("returns the bare origin when there is no path", () => {
    expect(canonicalUrlFor(null, "https://blog.example/", null)).toBe(
      "https://blog.example",
    );
  });
});
