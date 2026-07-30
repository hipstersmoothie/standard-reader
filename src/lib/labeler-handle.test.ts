import { describe, expect, test } from "vitest";

import {
  didWebHost,
  labelerHandle,
  labelerHandleOrDid,
} from "./labeler-handle.ts";

describe("didWebHost", () => {
  test("maps a bare did:web to its host", () => {
    expect(didWebHost("did:web:botlabeler.standard-reader.app")).toBe(
      "botlabeler.standard-reader.app",
    );
  });

  test("rejects a path-bearing did:web, which is a location not a handle", () => {
    expect(didWebHost("did:web:example.com:user:alice")).toBeNull();
  });

  test("returns null for did:plc and for an empty host", () => {
    expect(didWebHost("did:plc:newitj5jo3uel7o4mnf3vj2o")).toBeNull();
    expect(didWebHost("did:web:")).toBeNull();
  });
});

describe("labelerHandle", () => {
  test("prefers a resolved handle", () => {
    expect(
      labelerHandle("did:plc:newitj5jo3uel7o4mnf3vj2o", "xblock.aendra.dev"),
    ).toBe("xblock.aendra.dev");
  });

  test("derives the handle for a did:web labeler with no alsoKnownAs", () => {
    // Our own labelers are did:web and their documents carry no alsoKnownAs.
    expect(labelerHandle("did:web:botlabeler.standard-reader.app", null)).toBe(
      "botlabeler.standard-reader.app",
    );
  });

  test("ignores handle.invalid rather than displaying it", () => {
    expect(
      labelerHandle("did:plc:newitj5jo3uel7o4mnf3vj2o", "handle.invalid"),
    ).toBeNull();
  });

  test("normalizes case and whitespace", () => {
    expect(labelerHandle("did:plc:abc", "  Skywatch.Blue  ")).toBe(
      "skywatch.blue",
    );
  });

  test("returns null when a did:plc labeler has no handle", () => {
    expect(labelerHandle("did:plc:abc", null)).toBeNull();
    expect(labelerHandle("did:plc:abc", "   ")).toBeNull();
  });
});

describe("labelerHandleOrDid", () => {
  test("prefixes a resolved handle with @", () => {
    expect(labelerHandleOrDid("did:plc:abc", "skywatch.blue")).toBe(
      "@skywatch.blue",
    );
  });

  test("falls back to the DID so the identifier is never lost", () => {
    expect(labelerHandleOrDid("did:plc:abc", null)).toBe("did:plc:abc");
  });
});
