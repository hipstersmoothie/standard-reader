import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { reactNodeHasText, splitLeadingChar } from "./react-node-text";

describe("splitLeadingChar", () => {
  it("splits the first character off a plain string", () => {
    expect(splitLeadingChar("hello")).toEqual({ first: "h", rest: "ello" });
  });

  it("splits by code point, not UTF-16 unit", () => {
    // A drop cap on an emoji-led paragraph must not tear a surrogate pair.
    expect(splitLeadingChar("😀 hi")).toEqual({ first: "😀", rest: " hi" });
  });

  it("stringifies a leading number", () => {
    expect(splitLeadingChar(42)).toEqual({ first: "4", rest: "2" });
  });

  it("returns null for empty or non-text nodes", () => {
    const missing: string | undefined = undefined;
    expect(splitLeadingChar("")).toBeNull();
    expect(splitLeadingChar(null)).toBeNull();
    expect(splitLeadingChar(missing)).toBeNull();
    expect(splitLeadingChar(true)).toBeNull();
  });

  it("returns null when the node opens with a React element", () => {
    const link = createElement("a", { href: "https://example.com" }, "link");
    expect(splitLeadingChar(link)).toBeNull();
    // …and the same when that element leads an array.
    expect(splitLeadingChar([link, " after"])).toBeNull();
  });

  it("keeps trailing inline markup intact when the paragraph opens with text", () => {
    // Regression: a paragraph that opens with a plain letter but then carries a
    // link must still get its drop cap, with the link preserved in `rest`.
    const link = createElement(
      "a",
      { href: "https://herrmontag.de/atproto" },
      "ATProto",
    );
    const paragraph = ["Hallo ", link, " — weiter."];
    const split = splitLeadingChar(paragraph);
    expect(split?.first).toBe("H");
    expect(split?.rest).toEqual(["allo ", link, " — weiter."]);
  });

  it("skips empty leading array entries", () => {
    expect(splitLeadingChar([null, "", "hi"])).toEqual({
      first: "h",
      rest: ["i"],
    });
  });
});

describe("reactNodeHasText", () => {
  it("is true for strings with visible characters and for numbers", () => {
    expect(reactNodeHasText("hi")).toBe(true);
    expect(reactNodeHasText(0)).toBe(true);
  });

  it("is false for whitespace-only, nullish, and boolean nodes", () => {
    expect(reactNodeHasText("   ")).toBe(false);
    expect(reactNodeHasText(null)).toBe(false);
    expect(reactNodeHasText(false)).toBe(false);
  });

  it("descends into element children (a link paragraph has text)", () => {
    const link = createElement("a", { href: "https://example.com" }, "link");
    expect(reactNodeHasText([link, " after"])).toBe(true);
  });

  it("is false for a media-only paragraph (a lone image)", () => {
    const image = createElement("img", { src: "x.png", alt: "" });
    expect(reactNodeHasText(image)).toBe(false);
  });
});
