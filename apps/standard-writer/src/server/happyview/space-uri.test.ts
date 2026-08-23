import { describe, expect, it } from "vitest";

import {
  isSpaceRecordRef,
  parseSpaceUri,
  spaceRecordUri,
  spaceUri,
} from "./space-uri";

const DID = "did:plc:author";
const TYPE = "app.standard-newsletter.list";

describe("space-uri", () => {
  it("builds and round-trips a space URI", () => {
    const uri = spaceUri({ did: DID, type: TYPE, skey: "abc" });
    expect(uri).toBe(`at://${DID}/space/${TYPE}/abc`);
    const parsed = parseSpaceUri(uri);
    expect(parsed).toEqual({ did: DID, type: TYPE, skey: "abc" });
    expect(parsed && isSpaceRecordRef(parsed)).toBe(false);
  });

  it("builds and round-trips a space-record URI", () => {
    const ref = {
      did: DID,
      type: TYPE,
      skey: "abc",
      author: "did:plc:sub",
      collection: "app.standard-newsletter.subscription",
      rkey: "3l2tk",
    };
    const uri = spaceRecordUri(ref);
    expect(uri).toBe(
      `at://${DID}/space/${TYPE}/abc/did:plc:sub/app.standard-newsletter.subscription/3l2tk`,
    );
    const parsed = parseSpaceUri(uri);
    expect(parsed).toEqual(ref);
    expect(parsed && isSpaceRecordRef(parsed)).toBe(true);
  });

  it("rejects non-space URIs and malformed tails", () => {
    expect(parseSpaceUri("at://did:plc:x/app.bsky.feed.post/1")).toBeNull();
    expect(parseSpaceUri("https://example.com")).toBeNull();
    // 3-segment tail is neither a space nor a full record ref.
    expect(parseSpaceUri(`at://${DID}/space/${TYPE}/abc/extra`)).toBeNull();
  });
});
