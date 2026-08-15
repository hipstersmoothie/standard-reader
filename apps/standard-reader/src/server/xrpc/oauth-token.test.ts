import { createHash, randomUUID } from "node:crypto";

import type { Did } from "@atcute/lexicons";
import {
  SignJWT,
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
} from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authenticateRequest } from "./auth";
import { AuthRequiredError, ForbiddenError } from "./errors";
import {
  resetOauthTokenCachesForTests,
  verifyOauthJwtAccessToken,
} from "./oauth-token";

vi.mock("#/server/atproto/identity", () => ({
  resolveIdentity: async () => ({
    did: "did:plc:reader123",
    pds: "https://pds.test",
    handle: "reader.test",
  }),
}));

/**
 * A full, cryptographically real fixture of the external-OAuth-caller flow the
 * userinput.app report exercised: an authorization server (the reader's PDS)
 * mints an ES256 `at+jwt` access token carrying only an `rpc:` scope for this
 * AppView, DPoP-bound to the client's key. Only the network is mocked — token
 * signatures, JWKS resolution, DPoP proofs, thumbprints, and scope matching
 * all run for real.
 */

const DID = "did:plc:reader123" as Did;
const PDS = "https://pds.test";
const ISS = "https://pds.test";
const LXM = "app.standard-reader.getBookmarkStatus";
const APPVIEW_AUD = "did:web:standard-reader.app#standard_reader_appview";
const REQUEST_URL = `https://standard-reader.app/xrpc/${LXM}`;

type Keys = Awaited<ReturnType<typeof generateKeyPair>>;

let serverKeys: Keys;
let clientKeys: Keys;
let clientJwk: Awaited<ReturnType<typeof exportJWK>>;
let clientJkt: string;

async function mintAccessToken(options?: {
  scope?: string;
  bound?: boolean;
  signWith?: Keys;
  sub?: string;
  typ?: string;
}): Promise<string> {
  const scope =
    options?.scope ?? `rpc:${LXM}?aud=${encodeURIComponent(APPVIEW_AUD)}`;
  const bound = options?.bound ?? true;
  const jwt = new SignJWT({
    scope,
    ...(bound ? { cnf: { jkt: clientJkt } } : {}),
  })
    .setProtectedHeader({
      alg: "ES256",
      typ: options?.typ ?? "at+jwt",
      kid: "test-key",
    })
    .setIssuer(ISS)
    .setSubject(options?.sub ?? DID)
    .setAudience("did:web:pds.test")
    .setIssuedAt()
    .setExpirationTime("10m");
  return jwt.sign((options?.signWith ?? serverKeys).privateKey);
}

async function mintDpopProof(options?: {
  accessToken?: string;
  htm?: string;
  htu?: string;
  iat?: number;
  jti?: string;
  ath?: string;
}): Promise<string> {
  const accessToken = options?.accessToken ?? "";
  const proof = new SignJWT({
    htm: options?.htm ?? "GET",
    htu: options?.htu ?? REQUEST_URL,
    jti: options?.jti ?? randomUUID(),
    ath:
      options?.ath ??
      createHash("sha256").update(accessToken).digest("base64url"),
  }).setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: clientJwk });
  if (options?.iat === undefined) {
    proof.setIssuedAt();
  } else {
    proof.setIssuedAt(options.iat);
  }
  return proof.sign(clientKeys.privateKey);
}

function dpopRequest(token: string, proof: string): Request {
  return new Request(REQUEST_URL, {
    method: "GET",
    headers: { Authorization: `DPoP ${token}`, DPoP: proof },
  });
}

async function verify(token: string, proof: string) {
  return verifyOauthJwtAccessToken({
    token,
    scheme: "dpop",
    request: dpopRequest(token, proof),
    lxm: LXM,
    did: DID,
    pds: PDS,
  });
}

const originalPublicUrl = process.env.PUBLIC_URL;

beforeEach(async () => {
  process.env.PUBLIC_URL = "https://standard-reader.app";
  resetOauthTokenCachesForTests();

  serverKeys ??= await generateKeyPair("ES256");
  if (!clientKeys) {
    clientKeys = await generateKeyPair("ES256");
    clientJwk = await exportJWK(clientKeys.publicKey);
    clientJkt = await calculateJwkThumbprint(clientJwk, "sha256");
  }

  const serverJwk = await exportJWK(serverKeys.publicKey);
  const routes = new Map<string, unknown>([
    [
      `${PDS}/.well-known/oauth-protected-resource`,
      { authorization_servers: [ISS] },
    ],
    [
      `${ISS}/.well-known/oauth-authorization-server`,
      { issuer: ISS, jwks_uri: `${ISS}/oauth/jwks` },
    ],
    [
      `${ISS}/oauth/jwks`,
      { keys: [{ ...serverJwk, kid: "test-key", alg: "ES256", use: "sig" }] },
    ],
  ]);

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      // The PDS rejects getSession for rpc-scope-only tokens — the exact
      // behavior that forces the JWT-verification fallback in the wild.
      if (url === `${PDS}/xrpc/com.atproto.server.getSession`) {
        return new Response(JSON.stringify({ error: "InvalidToken" }), {
          status: 401,
        });
      }
      const body = routes.get(url.replace(/\?.*$/, ""));
      if (body === undefined) {
        return new Response("not found", { status: 404 });
      }
      return new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalPublicUrl === undefined) {
    delete process.env.PUBLIC_URL;
  } else {
    process.env.PUBLIC_URL = originalPublicUrl;
  }
});

describe("verifyOauthJwtAccessToken", () => {
  it("accepts a DPoP-bound token with an rpc scope for this service", async () => {
    const token = await mintAccessToken();
    const proof = await mintDpopProof({ accessToken: token });

    const verified = await verify(token, proof);
    expect(verified.did).toBe(DID);
    expect(verified.scopes).toContain(
      `rpc:${LXM}?aud=${encodeURIComponent(APPVIEW_AUD)}`,
    );
  });

  it("accepts a wildcard-lxm rpc scope", async () => {
    const token = await mintAccessToken({
      scope: `rpc:*?aud=${encodeURIComponent(APPVIEW_AUD)}`,
    });
    const proof = await mintDpopProof({ accessToken: token });
    await expect(verify(token, proof)).resolves.toMatchObject({ did: DID });
  });

  it("rejects a token whose rpc scope names another service", async () => {
    const token = await mintAccessToken({
      scope: `rpc:${LXM}?aud=${encodeURIComponent("did:web:api.bsky.app#bsky_appview")}`,
    });
    const proof = await mintDpopProof({ accessToken: token });
    await expect(verify(token, proof)).rejects.toThrow(ForbiddenError);
  });

  it("rejects a token whose rpc scope covers a different method", async () => {
    const token = await mintAccessToken({
      scope: `rpc:app.standard-reader.bookmarkDocument?aud=${encodeURIComponent(APPVIEW_AUD)}`,
    });
    const proof = await mintDpopProof({ accessToken: token });
    await expect(verify(token, proof)).rejects.toThrow(ForbiddenError);
  });

  it("rejects a token signed by a key the issuer does not publish", async () => {
    const rogue = await generateKeyPair("ES256");
    const token = await mintAccessToken({ signWith: rogue });
    const proof = await mintDpopProof({ accessToken: token });
    await expect(verify(token, proof)).rejects.toThrow(AuthRequiredError);
  });

  it("rejects an issuer the subject's PDS does not advertise", async () => {
    const token = await mintAccessToken();
    const proof = await mintDpopProof({ accessToken: token });
    await expect(
      verifyOauthJwtAccessToken({
        token,
        scheme: "dpop",
        request: dpopRequest(token, proof),
        lxm: LXM,
        did: DID,
        pds: "https://other-pds.test",
      }),
    ).rejects.toThrow(AuthRequiredError);
  });

  it("rejects a bound token presented as plain Bearer", async () => {
    const token = await mintAccessToken();
    await expect(
      verifyOauthJwtAccessToken({
        token,
        scheme: "bearer",
        request: new Request(REQUEST_URL, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        lxm: LXM,
        did: DID,
        pds: PDS,
      }),
    ).rejects.toThrow("DPoP-bound token presented without the DPoP scheme");
  });

  it("rejects a proof signed by a different key than the token binding", async () => {
    const token = await mintAccessToken();
    const otherClient = await generateKeyPair("ES256");
    const otherJwk = await exportJWK(otherClient.publicKey);
    const proof = await new SignJWT({
      htm: "GET",
      htu: REQUEST_URL,
      jti: randomUUID(),
      ath: createHash("sha256").update(token).digest("base64url"),
    })
      .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: otherJwk })
      .setIssuedAt()
      .sign(otherClient.privateKey);
    await expect(verify(token, proof)).rejects.toThrow(
      "DPoP proof key does not match token binding",
    );
  });

  it("rejects a proof whose ath covers a different token", async () => {
    const token = await mintAccessToken();
    const proof = await mintDpopProof({
      accessToken: token,
      ath: createHash("sha256").update("other-token").digest("base64url"),
    });
    await expect(verify(token, proof)).rejects.toThrow(
      "DPoP proof does not cover this access token",
    );
  });

  it("rejects a proof for a different URL", async () => {
    const token = await mintAccessToken();
    const proof = await mintDpopProof({
      accessToken: token,
      htu: "https://evil.example/xrpc/app.standard-reader.getBookmarkStatus",
    });
    await expect(verify(token, proof)).rejects.toThrow(
      "DPoP proof URL mismatch",
    );
  });

  it("rejects a stale proof", async () => {
    const token = await mintAccessToken();
    const proof = await mintDpopProof({
      accessToken: token,
      iat: Math.floor(Date.now() / 1000) - 3600,
    });
    await expect(verify(token, proof)).rejects.toThrow(
      "DPoP proof is too old or from the future",
    );
  });

  it("rejects a replayed proof", async () => {
    const token = await mintAccessToken();
    const proof = await mintDpopProof({ accessToken: token });
    await expect(verify(token, proof)).resolves.toBeDefined();
    await expect(verify(token, proof)).rejects.toThrow("DPoP proof replayed");
  });

  it("accepts an unbound bearer token (no cnf) with the right scope", async () => {
    const token = await mintAccessToken({ bound: false });
    const verified = await verifyOauthJwtAccessToken({
      token,
      scheme: "bearer",
      request: new Request(REQUEST_URL, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      lxm: LXM,
      did: DID,
      pds: PDS,
    });
    expect(verified.did).toBe(DID);
  });
});

describe("authenticateRequest fallback", () => {
  it("verifies an rpc-scoped token itself when getSession rejects it", async () => {
    // End-to-end through the real entry point: the PDS 401s getSession (an
    // rpc-only grant can't call it), and authentication still succeeds via
    // JWKS + DPoP verification — the exact scenario from the bug report.
    const token = await mintAccessToken();
    const proof = await mintDpopProof({ accessToken: token });

    const auth = await authenticateRequest(dpopRequest(token, proof), LXM);
    expect(auth.did).toBe(DID);
    expect(auth.via).toBe("oauthJwt");
    expect(auth.client).toBeNull();
  });

  it("still rejects a garbage token with a generic message", async () => {
    const request = new Request(REQUEST_URL, {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    await expect(authenticateRequest(request, LXM)).rejects.toThrow(
      "Invalid or expired access token",
    );
  });
});
