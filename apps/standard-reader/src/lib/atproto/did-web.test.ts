import { describe, expect, it } from "vitest";

import { didWebDocumentUrl } from "./did-web";

describe("didWebDocumentUrl", () => {
  it("keeps the dots in a domain-root host", () => {
    // The bug this file exists for: `standard-reader.app` must not be spelled
    // `standard-reader:app`, which names the host `standard-reader` instead.
    expect(didWebDocumentUrl("did:web:standard-reader.app")).toBe(
      "https://standard-reader.app/.well-known/did.json",
    );
  });

  it("resolves a path-bearing DID without /.well-known/", () => {
    expect(didWebDocumentUrl("did:web:example.com:user:alice")).toBe(
      "https://example.com/user/alice/did.json",
    );
  });

  it("decodes a percent-escaped port", () => {
    expect(didWebDocumentUrl("did:web:localhost%3A3000")).toBe(
      "https://localhost:3000/.well-known/did.json",
    );
  });

  it("rejects a non-did:web identifier", () => {
    expect(didWebDocumentUrl("did:plc:abc123")).toBeNull();
    expect(didWebDocumentUrl("https://example.com")).toBeNull();
  });

  it("rejects a DID with no host", () => {
    expect(didWebDocumentUrl("did:web:")).toBeNull();
    expect(didWebDocumentUrl("did:web::user")).toBeNull();
  });

  it("rejects empty path segments rather than collapsing them", () => {
    expect(didWebDocumentUrl("did:web:example.com::alice")).toBeNull();
  });

  it("rejects a host smuggling a path, query, or fragment", () => {
    expect(didWebDocumentUrl("did:web:example.com%2Fevil")).toBeNull();
    expect(didWebDocumentUrl("did:web:example.com%3Fa=1")).toBeNull();
    expect(didWebDocumentUrl("did:web:example.com%23frag")).toBeNull();
  });
});
