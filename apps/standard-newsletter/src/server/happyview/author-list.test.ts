import { describe, expect, it } from "vitest";

import { parseEmails } from "./author-list.server";

describe("parseEmails", () => {
  it("splits on commas, semicolons, and whitespace", () => {
    expect(parseEmails("a@x.com, b@x.com; c@x.com\n d@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
    ]);
  });

  it("lowercases and drops invalid tokens", () => {
    expect(parseEmails("Good@Example.COM notanemail also bad@")).toEqual([
      "good@example.com",
    ]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseEmails("   \n  ")).toEqual([]);
  });
});
