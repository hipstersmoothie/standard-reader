import { describe, expect, it } from "vitest";

import type { XrpcAuthContext } from "./auth";
import { requireScopes } from "./auth";
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
