import { Secp256k1Keypair } from "@atproto/crypto";
import { createServiceJwt } from "@atproto/xrpc-server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { XrpcAuthContext } from "./auth";
import {
  acceptedServiceJwtAudiences,
  authenticateRequest,
  requireScopes,
} from "./auth";
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

describe("authenticateRequest with a service JWT", () => {
  const LXM = "app.standard-reader.getBookmarkStatus";
  const originalPublicUrl = process.env.PUBLIC_URL;
  const originalFetch = globalThis.fetch;

  let keypair: Secp256k1Keypair;
  const iss = "did:plc:serviceissuer";

  beforeEach(async () => {
    process.env.PUBLIC_URL = "https://standard-reader.app";
    keypair = await Secp256k1Keypair.create();
    // A DID document publishes the *bare* multibase key — the `did:key:` form
    // is `did:key:` + that string. Serving it exactly as plc.directory does is
    // the whole point of this fixture: returning it unwrapped to `verifyJwt`
    // failed every real service JWT with `BadJwtSignature`.
    const multibase = keypair.did().replace("did:key:", "");
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        id: iss,
        verificationMethod: [
          {
            id: `${iss}#atproto`,
            type: "Multikey",
            controller: iss,
            publicKeyMultibase: multibase,
          },
        ],
      }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    if (originalPublicUrl === undefined) {
      delete process.env.PUBLIC_URL;
    } else {
      process.env.PUBLIC_URL = originalPublicUrl;
    }
  });

  const request = (token: string): Request =>
    new Request("https://standard-reader.app/xrpc/" + LXM, {
      headers: { authorization: `Bearer ${token}` },
    });

  it("authenticates a PDS-minted token as its issuer", async () => {
    const token = await createServiceJwt({
      iss,
      aud: "did:web:standard-reader.app",
      lxm: LXM,
      keypair,
    });
    const verified = await authenticateRequest(request(token), LXM);
    expect(verified.did).toBe(iss);
    expect(verified.via).toBe("serviceJwt");
  });

  it("accepts the did#fragment audience too", async () => {
    const token = await createServiceJwt({
      iss,
      aud: "did:web:standard-reader.app#standard_reader_appview",
      lxm: LXM,
      keypair,
    });
    await expect(
      authenticateRequest(request(token), LXM),
    ).resolves.toMatchObject({ via: "serviceJwt" });
  });

  it("rejects a token minted for another audience", async () => {
    const token = await createServiceJwt({
      iss,
      aud: "did:web:api.bsky.app",
      lxm: LXM,
      keypair,
    });
    await expect(authenticateRequest(request(token), LXM)).rejects.toThrow(
      /audience/i,
    );
  });

  it("rejects a token minted for another method", async () => {
    const token = await createServiceJwt({
      iss,
      aud: "did:web:standard-reader.app",
      lxm: "app.standard-reader.bookmarkDocument",
      keypair,
    });
    // The rejection must surface, not fall through to access-token validation:
    // a service JWT has no `sub`, so the fallthrough reported "Unable to
    // resolve PDS for access token" and hid the real reason.
    await expect(authenticateRequest(request(token), LXM)).rejects.toThrow(
      /lexicon method/i,
    );
  });

  it("rejects a token signed by a key the issuer does not publish", async () => {
    const impostor = await Secp256k1Keypair.create();
    const token = await createServiceJwt({
      iss,
      aud: "did:web:standard-reader.app",
      lxm: LXM,
      keypair: impostor,
    });
    await expect(authenticateRequest(request(token), LXM)).rejects.toThrow(
      /signature/i,
    );
  });
});
