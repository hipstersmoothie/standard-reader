import { describe, expect, it } from "vitest";

import { articleSharePath, buildQuoteShareUrl } from "./quote-share.ts";

const DID = "did:plc:7ztoas5m6664r5bwab56byec";
const RKEY = "3mqfxjkfbjuas";

describe("articleSharePath", () => {
  // Discussion looks these URLs up in Constellation by exact string match, so
  // they have to be byte-identical to what the router emits. Percent-encoding
  // the DID's colons builds a URL no real post ever contains.
  it("leaves the DID's colons literal", () => {
    expect(articleSharePath(DID, RKEY)).toBe(`/a/${DID}/${RKEY}`);
  });

  it("survives URL resolution against a base", () => {
    const url = new URL(
      articleSharePath(DID, RKEY),
      "https://standard-reader.app",
    ).toString();
    expect(url).toBe(`https://standard-reader.app/a/${DID}/${RKEY}`);
  });
});

describe("buildQuoteShareUrl", () => {
  it("keeps the DID literal and appends the quote id", () => {
    expect(
      buildQuoteShareUrl(DID, RKEY, "abc", "https://standard-reader.app"),
    ).toBe(`https://standard-reader.app/a/${DID}/${RKEY}?q=abc`);
  });
});
