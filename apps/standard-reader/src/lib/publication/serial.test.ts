import { describe, expect, it } from "vitest";

import {
  isSerialDirection,
  JUDGED_NOT_SERIAL,
  needsSerialResolution,
  parsePrevNextDirection,
  parseSerialKind,
  resolveSerialPublication,
} from "./serial";

describe("parsePrevNextDirection", () => {
  it("keeps the two known values", () => {
    expect(parsePrevNextDirection("ltr")).toBe("ltr");
    expect(parsePrevNextDirection("rtl")).toBe("rtl");
  });

  it("drops anything else", () => {
    expect(parsePrevNextDirection("sideways")).toBeNull();
    // A record with no `preferences` at all reaches this as `undefined`.
    expect(parsePrevNextDirection(({} as { dir?: string }).dir)).toBeNull();
    expect(parsePrevNextDirection(null)).toBeNull();
    expect(parsePrevNextDirection(1)).toBeNull();
  });
});

describe("parseSerialKind", () => {
  it("keeps the derived kinds", () => {
    expect(parseSerialKind("comic")).toBe("comic");
    expect(parseSerialKind("book")).toBe("book");
  });

  it("drops anything else", () => {
    expect(parseSerialKind("magazine")).toBeNull();
    expect(parseSerialKind(null)).toBeNull();
  });
});

describe("isSerialDirection", () => {
  it("is true only for forwards reading", () => {
    expect(isSerialDirection("ltr")).toBe(true);
    // `rtl` is the lexicon default — an ordinary reverse-chronological blog.
    expect(isSerialDirection("rtl")).toBe(false);
    expect(isSerialDirection(null)).toBe(false);
  });
});

describe("resolveSerialPublication", () => {
  it("pairs the publisher's declaration with the derived kind", () => {
    expect(resolveSerialPublication("ltr", "comic")).toEqual({ kind: "comic" });
    expect(resolveSerialPublication("ltr", "book")).toEqual({ kind: "book" });
  });

  it("reads an underived serial as a book", () => {
    // A publication indexed before the derivation sweep ran: prose is the safe
    // default, since it only adds an "Up next" link.
    expect(resolveSerialPublication("ltr", null)).toEqual({ kind: "book" });
    expect(resolveSerialPublication("ltr", "nonsense")).toEqual({
      kind: "book",
    });
  });

  it("is null for an undeclared publication with nothing derived", () => {
    expect(resolveSerialPublication("rtl", null)).toBeNull();
    // NULL direction means "never mirrored" rather than "ordinary" — the read
    // path backfills it (`ensurePublicationSerial`) before this is consulted, so
    // reading it as non-serial here is the safe holding answer, not a verdict.
    expect(resolveSerialPublication(null, null)).toBeNull();
    // The judged-a-blog marker is not a kind, so it reads as no serial at all.
    expect(resolveSerialPublication("rtl", JUDGED_NOT_SERIAL)).toBeNull();
  });

  it("lets a derived comic stand without the declaration", () => {
    // Most comics never set `prevNextDirection`, and `"rtl"` is the lexicon
    // default — so a derived `"comic"` on one is evidence, not a stale flag.
    expect(resolveSerialPublication("rtl", "comic")).toEqual({ kind: "comic" });
    expect(resolveSerialPublication(null, "comic")).toEqual({ kind: "comic" });
  });

  it("never infers a book", () => {
    // Prose that reads front-to-back is indistinguishable from a blog, so a
    // `"book"` without the declaration is a stale row, not a serial.
    expect(resolveSerialPublication("rtl", "book")).toBeNull();
  });
});

describe("needsSerialResolution", () => {
  it("asks again for a row that was never mirrored", () => {
    expect(needsSerialResolution(null, null)).toBe(true);
    expect(needsSerialResolution(undefined, "comic")).toBe(true);
    expect(needsSerialResolution("sideways", "comic")).toBe(true);
  });

  it("asks again for a serial whose kind nobody has judged", () => {
    // The case that loses a comic its shelf and its reader: rendered as a
    // book by `resolveSerialPublication`, but not actually resolved.
    expect(needsSerialResolution("ltr", null)).toBe(true);
    expect(needsSerialResolution("ltr", "nonsense")).toBe(true);
    expect(resolveSerialPublication("ltr", null)).toEqual({ kind: "book" });
  });

  it("is done once the serial has both", () => {
    expect(needsSerialResolution("ltr", "comic")).toBe(false);
    expect(needsSerialResolution("ltr", "book")).toBe(false);
  });

  it("asks about an undeclared publication nobody has judged", () => {
    // It could be a comic that never declared one, and no other read path
    // would ever look.
    expect(needsSerialResolution("rtl", null)).toBe(true);
  });

  it("never re-asks once an undeclared publication has a verdict", () => {
    expect(needsSerialResolution("rtl", JUDGED_NOT_SERIAL)).toBe(false);
    expect(needsSerialResolution("rtl", "comic")).toBe(false);
    // A stale `"book"` is still a verdict — the sweep retires it, not a re-ask
    // on every page view.
    expect(needsSerialResolution("rtl", "book")).toBe(false);
  });
});
