import { describe, expect, it } from "vitest";

import { InvalidInputError } from "./errors.js";
import { asActor, asAtUri, asDid, asOptionalDid } from "./refs.js";

const URI = "at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/site.standard.document/abc";

describe("asAtUri", () => {
  it("accepts an AT-URI and trims it", () => {
    expect(asAtUri(` ${URI} `, "article")).toBe(URI);
  });

  it("rejects anything else with an actionable message", () => {
    expect(() => asAtUri("https://example.com/post", "article")).toThrow(
      InvalidInputError,
    );
    expect(() => asAtUri("not-a-uri", "article")).toThrow(/`article`/);
    expect(() => asAtUri("not-a-uri", "article")).toThrow(/resolve/);
  });
});

describe("asDid", () => {
  it("accepts plc and web DIDs", () => {
    expect(asDid("did:plc:ewvi7nxzyoun6zhxrhs64oiz", "did")).toBe(
      "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
    );
    expect(asDid("did:web:example.com", "did")).toBe("did:web:example.com");
  });

  it("rejects a handle passed where a DID belongs", () => {
    expect(() => asDid("alice.bsky.social", "did")).toThrow(InvalidInputError);
  });
});

describe("asActor", () => {
  it("accepts a handle, with or without a leading @", () => {
    expect(asActor("@alice.bsky.social", "actor")).toBe("alice.bsky.social");
  });

  it("accepts a DID", () => {
    expect(asActor("did:web:example.com", "actor")).toBe("did:web:example.com");
  });
});

describe("asOptionalDid", () => {
  it("passes undefined through", () => {
    expect(asOptionalDid(undefined, "did")).toBeUndefined();
  });

  it("still validates a value that is present", () => {
    expect(() => asOptionalDid("nope", "did")).toThrow(InvalidInputError);
  });
});
