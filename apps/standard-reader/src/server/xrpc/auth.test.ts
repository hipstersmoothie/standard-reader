import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { XrpcAuthContext } from "./auth";
import { acceptedServiceJwtAudiences, requireScopes } from "./auth";
import { APPVIEW_SERVICE_ID } from "./config";
import { ForbiddenError } from "./errors";
import { XRPC_WRITE_SCOPES } from "./scopes";

function auth(overrides: Partial<XrpcAuthContext> = {}): XrpcAuthContext {
  return {
    did: "did:plc:testreader" as XrpcAuthContext["did"],
    client: null,
    scopes: [],
    via: "accessToken",
    ...overrides,
  };
}

describe("acceptedServiceJwtAudiences", () => {
  const originalPublicUrl = process.env.PUBLIC_URL;

  beforeEach(() => {
    process.env.PUBLIC_URL = "https://standard-reader.app";
  });

  afterEach(() => {
    if (originalPublicUrl === undefined) {
      delete process.env.PUBLIC_URL;
    } else {
      process.env.PUBLIC_URL = originalPublicUrl;
    }
  });

  it("accepts the bare DID a PDS actually mints", () => {
    // `pipethrough` strips the fragment off `atproto-proxy` before signing.
    // Requiring the fragment form rejected every proxied call as
    // `BadJwtAudience`.
    expect(
      acceptedServiceJwtAudiences().has("did:web:standard-reader.app"),
    ).toBe(true);
  });

  it("also accepts the did#fragment form", () => {
    expect(
      acceptedServiceJwtAudiences().has(
        `did:web:standard-reader.app#${APPVIEW_SERVICE_ID}`,
      ),
    ).toBe(true);
  });

  it("rejects a token minted for another service", () => {
    expect(acceptedServiceJwtAudiences().has("did:web:api.bsky.app")).toBe(
      false,
    );
    // The old, malformed spelling of our own DID must not be honoured either.
    expect(
      acceptedServiceJwtAudiences().has("did:web:standard-reader:app"),
    ).toBe(false);
  });
});

describe("requireScopes", () => {
  it("allows a scope the credential was granted", () => {
    expect(() =>
      requireScopes(auth({ scopes: [XRPC_WRITE_SCOPES.bookmark] }), [
        XRPC_WRITE_SCOPES.bookmark,
      ]),
    ).not.toThrow();
  });

  it("denies a scope the credential was not granted", () => {
    expect(() =>
      requireScopes(auth({ scopes: [XRPC_WRITE_SCOPES.read] }), [
        XRPC_WRITE_SCOPES.bookmark,
      ]),
    ).toThrow(ForbiddenError);
  });

  it("denies every scope when the granted list is empty", () => {
    expect(() =>
      requireScopes(auth({ scopes: [] }), [XRPC_WRITE_SCOPES.bookmark]),
    ).toThrow(ForbiddenError);
  });

  it("skips the check for service JWTs, which carry no scope list", () => {
    expect(() =>
      requireScopes(auth({ via: "serviceJwt", scopes: [] }), [
        XRPC_WRITE_SCOPES.bookmark,
      ]),
    ).not.toThrow();
  });

  it("skips the check for app-password sessions (no scopes field at all)", () => {
    // `com.atproto.server.getSession` omits `scopes` for a legacy app-password
    // session because the token grants unrestricted repo access — there is no
    // narrower grant to enforce. Coercing that to `[]` used to 403 every write
    // made by a CLI / MCP client.
    expect(() =>
      requireScopes(auth({ scopes: null }), [XRPC_WRITE_SCOPES.bookmark]),
    ).not.toThrow();
  });
});
