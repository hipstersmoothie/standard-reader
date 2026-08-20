import { describe, expect, it } from "vitest";

import { didFromParam } from "#/lib/opds/did-param";
import { opdsShelfUrl, opdsPublicationUrl } from "#/lib/opds/urls";

const DID = "did:plc:wt6bh5dtjdps7umi7yhidooi";

describe("didFromParam", () => {
  it("passes through the DID the router already decoded", () => {
    expect(didFromParam(DID)).toBe(DID);
  });

  it("recovers a DID a client re-encoded on its way back to us", () => {
    // Panels stores a catalog as host + path and rebuilds the URL, which turns
    // a `%3A` into `%253A`. After the router's single decode we see this.
    expect(didFromParam("did%3Aplc%3Awt6bh5dtjdps7umi7yhidooi")).toBe(DID);
  });

  it("rejects anything that is not a DID", () => {
    expect(didFromParam("not-a-did")).toBeNull();
    expect(didFromParam("")).toBeNull();
    expect(didFromParam("https%3A%2F%2Fexample.com")).toBeNull();
  });

  it("rejects a malformed escape rather than throwing", () => {
    expect(didFromParam("%E0%A4%A")).toBeNull();
  });

  it("decodes at most one extra time", () => {
    // Triple-encoded is not a real client behaviour, and looping until a string
    // stops changing is how a parameter gets decoded onto something it should
    // not reach.
    expect(didFromParam("did%253Aplc%253Aabc")).toBeNull();
  });
});

describe("catalog URLs", () => {
  it("leaves the colon in a DID unencoded", () => {
    // RFC 3986 allows `:` in a path segment, and a URL with no `%` in it is one
    // a third-party client cannot mangle by re-encoding.
    const url = opdsShelfUrl("https://standard-reader.app", DID);
    expect(url).toBe(`https://standard-reader.app/opds/u/${DID}`);
    expect(url).not.toContain("%3A");
  });

  it("still encodes anything a segment cannot carry literally", () => {
    const url = opdsPublicationUrl("https://standard-reader.app", DID, "a/b c");
    expect(url).toContain("a%2Fb%20c");
  });
});
