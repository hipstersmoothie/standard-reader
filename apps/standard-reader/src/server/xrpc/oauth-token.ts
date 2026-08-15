import { createHash } from "node:crypto";

import type { Did } from "@atcute/lexicons";
import { ScopePermissions } from "@atproto/oauth-scopes";
import type {
  JWTHeaderParameters,
  JWTPayload,
  ProtectedHeaderParameters,
  createRemoteJWKSet,
} from "jose";

import { getPublicUrl } from "#/lib/public-url";
import { assertSafeFetchUrl } from "#/server/security/ssrf-guard";

import { appviewAudience, appviewDid } from "./config";
import { AuthRequiredError, ForbiddenError } from "./errors";

/**
 * Direct validation of a PDS-minted OAuth access token, for callers that hit
 * the AppView without going through their PDS.
 *
 * The primary validation path (`verifyAccessToken` in auth.ts) proves a token
 * by calling `com.atproto.server.getSession` on the issuer PDS — which works
 * for app passwords and full-session tokens, but not for a token granted only
 * an `rpc:` scope: such a token cannot call `getSession` at all, so the check
 * failed and every correctly-scoped external caller saw `invalid_token`
 * (reported at
 * https://userinput.app/d/did:plc:7qubw2z53qzfturlblaozz4a/3msqg3okp3kc7).
 *
 * This module verifies the token cryptographically instead:
 *
 * 1. `sub` must be the DID the caller claims to be; the PDS is resolved from
 *    it (never from the unverified `iss` — SSRF, see security audit C2).
 * 2. `iss` must be an authorization server the PDS itself advertises in its
 *    `/.well-known/oauth-protected-resource` metadata.
 * 3. The signature must verify against that authorization server's JWKS.
 * 4. A `cnf.jkt`-bound token must arrive under the DPoP scheme with a valid
 *    proof (RFC 9449: signature by the embedded key, `htm`/`htu` match, fresh
 *    `iat`, unseen `jti`, `ath` = hash of this token, thumbprint = `jkt`).
 * 5. The verified `scope` claim must grant `rpc` to *this* service for the
 *    method being called — mirroring the `assertRpc` check a PDS performs
 *    before proxying.
 *
 * What this deliberately does not enable: repo writes. The token is DPoP-bound
 * to the caller's key, so the AppView cannot replay it against the caller's
 * PDS — write procedures need a credential we can wield there (app password)
 * or no AppView at all (write the record to your own repo; the firehose
 * mirrors it). The returned context therefore has `client: null`.
 */

export interface OauthJwtVerificationInput {
  token: string;
  scheme: "bearer" | "dpop";
  /** The incoming HTTP request — used to check the DPoP proof's htm/htu. */
  request: Request;
  /** NSID of the method being called; the rpc scope must cover it. */
  lxm: string;
  /** DID the token's `sub` must match (resolved by the caller from `sub`). */
  did: Did;
  /** The subject's PDS base URL (resolved from the DID document). */
  pds: string;
}

export interface VerifiedOauthJwt {
  did: Did;
  /** Scope strings the authorization server granted, verbatim. */
  scopes: Array<string>;
}

const METADATA_TIMEOUT_MS = 8000;
/** Accepted clock skew for token/proof time claims, in seconds. */
const CLOCK_TOLERANCE_S = 60;
/** How old/new a DPoP proof's `iat` may be (RFC 9449 leaves this to us). */
const DPOP_IAT_WINDOW_S = 300;

/**
 * Replay guard for DPoP proof `jti` values. In-memory: this service runs as a
 * single web instance (see railway.json), so a per-instance set is an
 * effective guard; a restart forgetting old `jti`s is harmless because the
 * `iat` window bounds how long a captured proof stays usable anyway.
 */
const seenDpopJti = new Map<string, number>();
const SEEN_JTI_MAX = 10_000;

/** Cached JWKS fetchers per (issuer, jwks_uri) — jose caches keys internally. */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Trailing-slash-insensitive comparison form for issuer/server URLs. */
function normalizedUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Test hook: clear module caches so replay/JWKS state doesn't leak. */
export function resetOauthTokenCachesForTests(): void {
  seenDpopJti.clear();
  jwksCache.clear();
}

function pruneSeenJti(nowS: number): void {
  if (seenDpopJti.size < SEEN_JTI_MAX) return;
  for (const [jti, expiresAt] of seenDpopJti) {
    if (expiresAt <= nowS) seenDpopJti.delete(jti);
  }
  // Still over the cap after pruning expired entries — drop oldest-inserted.
  while (seenDpopJti.size >= SEEN_JTI_MAX) {
    const oldest = seenDpopJti.keys().next().value;
    if (oldest === undefined) break;
    seenDpopJti.delete(oldest);
  }
}

async function fetchJsonMetadata(url: string): Promise<unknown> {
  assertSafeFetchUrl(url);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new AuthRequiredError("Unable to resolve token issuer metadata");
  }
  return response.json();
}

/**
 * The authorization servers a PDS advertises for its resources. `iss` on the
 * token is attacker-controlled until this check passes: only an issuer the
 * subject's own PDS names may vouch for tokens about that subject.
 */
async function assertIssuerServesPds(iss: string, pds: string): Promise<void> {
  const metadataUrl = new URL(
    "/.well-known/oauth-protected-resource",
    pds,
  ).toString();
  const metadata = (await fetchJsonMetadata(metadataUrl)) as {
    authorization_servers?: Array<string>;
  };
  const servers = metadata.authorization_servers ?? [];
  if (!servers.some((server) => normalizedUrl(server) === normalizedUrl(iss))) {
    throw new AuthRequiredError(
      "Token issuer is not an authorization server for the subject's PDS",
    );
  }
}

async function jwksForIssuer(iss: string) {
  const { createRemoteJWKSet } = await import("jose");
  const metadataUrl = new URL(
    "/.well-known/oauth-authorization-server",
    iss,
  ).toString();
  const metadata = (await fetchJsonMetadata(metadataUrl)) as {
    issuer?: string;
    jwks_uri?: string;
  };
  if (
    !metadata.issuer ||
    normalizedUrl(metadata.issuer) !== normalizedUrl(iss)
  ) {
    throw new AuthRequiredError(
      "Authorization server metadata issuer mismatch",
    );
  }
  if (!metadata.jwks_uri) {
    throw new AuthRequiredError("Authorization server publishes no JWKS");
  }
  assertSafeFetchUrl(metadata.jwks_uri);
  const cacheKey = `${iss} ${metadata.jwks_uri}`;
  let jwks = jwksCache.get(cacheKey);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(metadata.jwks_uri));
    jwksCache.set(cacheKey, jwks);
  }
  return jwks;
}

/** RFC 9449 §4.3: htu comparison ignores query and fragment. */
function normalizeHtu(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Verify the `DPoP` proof header binds this request to the key the access
 * token was issued for (`cnf.jkt`). Throws on any mismatch.
 */
async function verifyDpopProof(options: {
  proof: string;
  request: Request;
  accessToken: string;
  expectedJkt: string;
}): Promise<void> {
  const { EmbeddedJWK, calculateJwkThumbprint, jwtVerify } =
    await import("jose");
  const { proof, request, accessToken, expectedJkt } = options;

  let payload: JWTPayload;
  let protectedHeader: JWTHeaderParameters;
  try {
    ({ payload, protectedHeader } = await jwtVerify(proof, EmbeddedJWK, {
      typ: "dpop+jwt",
      clockTolerance: CLOCK_TOLERANCE_S,
    }));
  } catch {
    throw new AuthRequiredError("Invalid DPoP proof");
  }

  if (!protectedHeader.jwk) {
    throw new AuthRequiredError("DPoP proof carries no key");
  }
  const jkt = await calculateJwkThumbprint(protectedHeader.jwk, "sha256");
  if (jkt !== expectedJkt) {
    throw new AuthRequiredError("DPoP proof key does not match token binding");
  }

  if (payload.htm !== request.method) {
    throw new AuthRequiredError("DPoP proof method mismatch");
  }

  // The proof's htu names our public URL; the incoming Request may carry an
  // internal origin (Railway terminates TLS upstream), so accept either the
  // canonical public spelling or the request's own.
  const htu =
    typeof payload.htu === "string" ? normalizeHtu(payload.htu) : null;
  const requestUrl = new URL(request.url);
  const canonicalHtu = `${new URL(getPublicUrl()).origin}${requestUrl.pathname}`;
  const requestHtu = `${requestUrl.origin}${requestUrl.pathname}`;
  if (!htu || (htu !== canonicalHtu && htu !== requestHtu)) {
    throw new AuthRequiredError("DPoP proof URL mismatch");
  }

  const nowS = Math.floor(Date.now() / 1000);
  if (
    typeof payload.iat !== "number" ||
    Math.abs(nowS - payload.iat) > DPOP_IAT_WINDOW_S
  ) {
    throw new AuthRequiredError("DPoP proof is too old or from the future");
  }

  const ath = createHash("sha256").update(accessToken).digest("base64url");
  if (payload.ath !== ath) {
    throw new AuthRequiredError("DPoP proof does not cover this access token");
  }

  if (typeof payload.jti !== "string" || payload.jti.length === 0) {
    throw new AuthRequiredError("DPoP proof carries no jti");
  }
  if (seenDpopJti.has(payload.jti)) {
    throw new AuthRequiredError("DPoP proof replayed");
  }
  pruneSeenJti(nowS);
  seenDpopJti.set(payload.jti, nowS + DPOP_IAT_WINDOW_S + CLOCK_TOLERANCE_S);
}

/**
 * Cheap structural check used to decide whether the fallback path applies at
 * all: an OAuth access token is a JWT carrying `iss` + `scope`. App-password
 * session tokens and service JWTs don't fit this shape.
 */
export function looksLikeOauthAccessToken(payload: {
  iss?: unknown;
  scope?: unknown;
}): boolean {
  return typeof payload.iss === "string" && typeof payload.scope === "string";
}

export async function verifyOauthJwtAccessToken(
  input: OauthJwtVerificationInput,
): Promise<VerifiedOauthJwt> {
  const { decodeJwt, decodeProtectedHeader, jwtVerify } = await import("jose");
  const { token, scheme, request, lxm, did, pds } = input;

  let unverified: JWTPayload;
  let header: ProtectedHeaderParameters;
  try {
    unverified = decodeJwt(token);
    header = decodeProtectedHeader(token);
  } catch {
    throw new AuthRequiredError("Invalid or expired access token");
  }

  // RFC 9068 access tokens are typed `at+jwt`; tolerate an absent typ but
  // never a different one (an id_token or DPoP proof must not pass here).
  if (header.typ !== undefined && header.typ !== "at+jwt") {
    throw new AuthRequiredError("Not an OAuth access token");
  }

  const iss = unverified.iss;
  if (typeof iss !== "string" || !iss.startsWith("https://")) {
    throw new AuthRequiredError("Invalid or expired access token");
  }
  if (unverified.sub !== did) {
    throw new AuthRequiredError("Invalid or expired access token");
  }

  await assertIssuerServesPds(iss, pds);
  const jwks = await jwksForIssuer(iss);

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, jwks, {
      issuer: iss,
      subject: did,
      clockTolerance: CLOCK_TOLERANCE_S,
    }));
  } catch {
    throw new AuthRequiredError("Invalid or expired access token");
  }

  const cnf = payload.cnf as { jkt?: unknown } | undefined;
  const jkt = typeof cnf?.jkt === "string" ? cnf.jkt : null;
  if (jkt) {
    if (scheme !== "dpop") {
      throw new AuthRequiredError(
        "DPoP-bound token presented without the DPoP scheme",
      );
    }
    const proof = request.headers.get("dpop");
    if (!proof) {
      throw new AuthRequiredError("DPoP-bound token requires a DPoP proof");
    }
    await verifyDpopProof({
      proof,
      request,
      accessToken: token,
      expectedJkt: jkt,
    });
  } else if (scheme !== "bearer") {
    throw new AuthRequiredError("Unbound token must use the Bearer scheme");
  }

  const scope = typeof payload.scope === "string" ? payload.scope : "";
  const scopes = scope.split(" ").filter(Boolean);
  const permissions = new ScopePermissions(scopes);
  const allowed =
    permissions.allowsRpc({ aud: appviewAudience(), lxm }) ||
    permissions.allowsRpc({ aud: appviewDid(), lxm });
  if (!allowed) {
    throw new ForbiddenError(
      `Token does not grant rpc access to ${appviewAudience()} for ${lxm}; ` +
        `request scope rpc:${lxm}?aud=${encodeURIComponent(appviewAudience())}`,
    );
  }

  return { did, scopes };
}
