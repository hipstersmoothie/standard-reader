import { describe, expect, it } from "vitest";

import {
  isSerialDirection,
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

  it("is null for an ordinary publication, derived kind or not", () => {
    expect(resolveSerialPublication("rtl", null)).toBeNull();
    // NULL direction means "never mirrored" rather than "ordinary" — the read
    // path backfills it (`ensurePublicationSerial`) before this is consulted, so
    // reading it as non-serial here is the safe holding answer, not a verdict.
    expect(resolveSerialPublication(null, null)).toBeNull();
    // A stale `serial_kind` on a publication that flipped back to `rtl` must
    // not resurrect the serial treatment.
    expect(resolveSerialPublication("rtl", "comic")).toBeNull();
  });
});
