import type { Client } from "@atcute/client";
import { Client as AtpClient } from "@atcute/client";
import type { Did } from "@atcute/lexicons";
import { verifyJwt } from "@atproto/xrpc-server";

import { didWebDocumentUrl } from "#/lib/atproto/did-web";
import { resolveIdentity } from "#/server/atproto/identity";
import { assertSafeFetchUrl } from "#/server/security/ssrf-guard";

import { appviewAudience, appviewDid } from "./config";
import { AuthRequiredError, ForbiddenError } from "./errors";
import {
  looksLikeOauthAccessToken,
  verifyOauthJwtAccessToken,
} from "./oauth-token";

export type XrpcAuthContext = {
  /** Authenticated user DID (from access token or service JWT iss). */
  did: Did;
  /**
   * PDS client when the credential can be replayed at the caller's PDS
   * (`via: "accessToken"`). Null for service JWTs and self-verified OAuth
   * JWTs — those prove identity but give us nothing to write with.
   */
  client: Client | null;
  /**
   * Scopes granted to the presented credential.
   *
   * `null` means the credential carries no scope restriction at all — an
   * app-password session, whose `getSession` response has no `scopes` field
   * because the token grants unrestricted repo access. There is nothing to
   * enforce in that case, so {@link requireScopes} lets it through. An empty
   * array is different: the auth server answered with a scope list and it was
   * empty, so every scoped write is denied.
   */
  scopes: Array<string> | null;
  /**
   * How the request was authenticated.
   *
   * `internal` means it never came over HTTP as an XRPC request at all — the
   * in-process MCP server (`src/server/mcp/`) calls the same handlers with the
   * reader's own restored OAuth session. Authorization for those calls happens
   * one layer up (the MCP token's `mcp:write` scope) and one layer down (the
   * PDS rejects any repo write the reader's grant doesn't cover), so there is
   * no scope list to check in between.
   *
   * `oauthJwt` is a PDS-minted OAuth access token we verified ourselves
   * (signature against the issuer's JWKS + DPoP binding + `rpc:` scope for
   * this service) because the token cannot call `getSession` — the path an
   * rpc-scope-only grant arrives on. Scopes are the verified `scope` claim.
   */
  via: "accessToken" | "internal" | "oauthJwt" | "serviceJwt";
};

const GET_SESSION_TIMEOUT_MS = 8000;

function parseAuthorization(
  header: string | null,
): { scheme: string; token: string } | null {
  if (!header) return null;
  const space = header.indexOf(" ");
  if (space === -1) return null;
  return {
    scheme: header.slice(0, space).toLowerCase(),
    token: header.slice(space + 1).trim(),
  };
}

/**
 * Whether a bearer token is an inter-service auth JWT rather than a PDS access
 * token. A service JWT names the method it may call (`lxm`) and identifies its
 * subject through `iss` alone — an access token always carries `sub`.
 */
function looksLikeServiceJwt(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { lxm?: unknown; sub?: unknown };
    return typeof payload.lxm === "string" && payload.sub === undefined;
  } catch {
    return false;
  }
}

async function getSigningKey(
  iss: string,
  _forceRefresh: boolean,
): Promise<string> {
  const did = iss.split("#")[0] as Did;
  let docUrl: string | null = null;
  if (did.startsWith("did:plc:")) {
    const plcUrl = process.env.TAP_PLC_URL || "https://plc.directory";
    docUrl = `${plcUrl}/${encodeURIComponent(did)}`;
  } else if (did.startsWith("did:web:")) {
    docUrl = didWebDocumentUrl(did);
    // did:web host is attacker-controlled (from the unverified JWT iss) —
    // validate before fetching to prevent SSRF (security audit C1).
    try {
      if (!docUrl) throw new Error("malformed did:web");
      assertSafeFetchUrl(docUrl);
    } catch {
      throw new AuthRequiredError("Unable to resolve signing key for issuer");
    }
  }
  if (!docUrl) {
    throw new AuthRequiredError("Unable to resolve signing key for issuer");
  }

  const response = await fetch(docUrl, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new AuthRequiredError("Unable to resolve signing key for issuer");
  }

  const doc = (await response.json()) as {
    verificationMethod?: Array<{
      id?: string;
      publicKeyMultibase?: string;
    }>;
  };
  const verificationMethod = doc.verificationMethod?.find((method) =>
    String(method.id ?? "").endsWith("#atproto"),
  );
  if (!verificationMethod?.publicKeyMultibase) {
    throw new AuthRequiredError("Unable to resolve signing key for issuer");
  }
  // `verifyJwt` hands this straight to `@atproto/crypto`'s `verifySignature`,
  // which parses it as a **did:key**. A DID document publishes the bare
  // multibase key (`zQ3sh…`), so returning it unwrapped made every real
  // PDS-minted service JWT fail with `BadJwtSignature` — silently, because
  // `authenticateRequest` swallowed that and retried the token as an access
  // token. Every `atproto-proxy` call therefore fell back to anonymous.
  const multibase = verificationMethod.publicKeyMultibase;
  return multibase.startsWith("did:key:") ? multibase : `did:key:${multibase}`;
}

/**
 * Audiences we accept on a PDS-minted service JWT.
 *
 * `pipethrough` splits the `atproto-proxy` header and signs the token with the
 * **bare DID** as `aud`, keeping the `did#fragment` form only for matching
 * OAuth `rpc:` scopes. Requiring the fragment form rejected every proxied call
 * with `BadJwtAudience`; accepting only the bare form would break any
 * implementation that echoes the whole header back. Take either — but nothing
 * else, so a token minted for a different service still cannot be replayed at
 * us.
 */
export function acceptedServiceJwtAudiences(): ReadonlySet<string> {
  return new Set([appviewDid(), appviewAudience()]);
}

async function verifyServiceJwt(
  jwt: string,
  lxm: string,
): Promise<XrpcAuthContext> {
  // `null` skips xrpc-server's built-in single-value audience check so we can
  // accept both spellings below; every other claim is still verified there.
  const payload = await verifyJwt(jwt, null, lxm, getSigningKey);
  if (!acceptedServiceJwtAudiences().has(payload.aud)) {
    throw new AuthRequiredError("jwt audience does not match service did");
  }
  const iss = payload.iss.split("#")[0] as Did;
  return {
    did: iss,
    client: null,
    scopes: [],
    via: "serviceJwt",
  };
}

async function verifyAccessToken(
  token: string,
  scheme: "bearer" | "dpop",
  request: Request,
  lxm: string,
): Promise<XrpcAuthContext> {
  // Never trust the unverified `iss` claim as a URL — it is attacker-controlled
  // and would allow SSRF (see security audit C2). Resolve the PDS exclusively
  // from `sub` (a DID) via proper identity resolution.
  const { decodeJwt } = await import("jose");
  let decoded: { sub?: string; iss?: string; scope?: unknown };
  try {
    decoded = decodeJwt(token);
  } catch {
    throw new AuthRequiredError("Invalid or expired access token");
  }
  const sub = decoded.sub;
  if (typeof sub !== "string" || !sub.startsWith("did:")) {
    throw new AuthRequiredError("Unable to resolve PDS for access token");
  }
  const identity = await resolveIdentity(sub as Did);
  const pds = identity.pds?.replace(/\/+$/, "");
  if (!pds) {
    throw new AuthRequiredError("Unable to resolve PDS for access token");
  }

  const url = new URL("/xrpc/com.atproto.server.getSession", pds);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(GET_SESSION_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    // An OAuth token granted only an `rpc:` scope cannot call `getSession` at
    // all, so this rejection proves nothing about the token. Verify such a
    // token cryptographically instead (issuer JWKS + DPoP binding + rpc scope
    // for this method) — see oauth-token.ts. Errors from that path propagate
    // as-is: their specificity is the point for external OAuth callers.
    if (looksLikeOauthAccessToken(decoded)) {
      const verified = await verifyOauthJwtAccessToken({
        token,
        scheme,
        request,
        lxm,
        did: sub as Did,
        pds,
      });
      return {
        did: verified.did,
        client: null,
        scopes: verified.scopes,
        via: "oauthJwt",
      };
    }
    throw new AuthRequiredError("Invalid or expired access token");
  }
  const session = (await response.json()) as {
    did?: string;
    scopes?: Array<string>;
  };
  if (!session.did?.startsWith("did:")) {
    throw new AuthRequiredError("Invalid session response");
  }
  const client = new AtpClient({
    // atcute hands the handler a *pathname*, not an absolute URL — it is the
    // handler's job to bind it to a service origin. Resolving against the
    // issuer PDS is what makes repo writes on behalf of a token-authenticated
    // caller work at all; without it every write threw on `fetch("/xrpc/…")`.
    handler: async (pathname, init) => {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${token}`);
      return fetch(new URL(pathname, pds), { ...init, headers });
    },
  });
  return {
    did: session.did as Did,
    client,
    scopes: session.scopes ?? null,
    via: "accessToken",
  };
}

/** Validate Authorization per AT Proto (service JWT or OAuth access token + getSession). */
export async function authenticateRequest(
  request: Request,
  lxm: string,
): Promise<XrpcAuthContext> {
  const parsed = parseAuthorization(request.headers.get("authorization"));
  if (!parsed) {
    throw new AuthRequiredError("Authentication required");
  }

  if (parsed.scheme === "bearer") {
    if (looksLikeServiceJwt(parsed.token)) {
      // Unambiguously a service JWT, so its verification error is the real
      // answer. Falling through here reported "Unable to resolve PDS for
      // access token" (a service JWT has no `sub`) and, on optionally
      // authenticated queries, downgraded the caller to anonymous instead of
      // telling them their token was rejected.
      return verifyServiceJwt(parsed.token, lxm);
    }
    try {
      return await verifyServiceJwt(parsed.token, lxm);
    } catch {
      // Not a service JWT — fall through to access-token validation.
    }
  }

  if (parsed.scheme === "bearer" || parsed.scheme === "dpop") {
    return verifyAccessToken(parsed.token, parsed.scheme, request, lxm);
  }

  throw new AuthRequiredError("Authentication required");
}

export function requireScopes(
  auth: XrpcAuthContext,
  required: Array<string>,
): void {
  // Neither of these carries an OAuth scope list to check: a service JWT
  // authenticates the PDS-proxied caller, and `internal` is the in-process MCP
  // server (see the `via` docs on XrpcAuthContext).
  if (auth.via === "serviceJwt" || auth.via === "internal") return;
  // No scope list on the credential — an app-password session, which grants
  // unrestricted repo access. There is no narrower grant to check against.
  if (auth.scopes === null) return;
  for (const scope of required) {
    if (!auth.scopes.includes(scope)) {
      throw new ForbiddenError(`Missing required scope: ${scope}`);
    }
  }
}

export function resolveSubjectDid(options: {
  didParam: string | undefined;
  auth: XrpcAuthContext | null;
  authRequired: boolean;
  allowDidParam: boolean;
}): Did {
  const { didParam, auth, authRequired, allowDidParam } = options;

  if (allowDidParam && didParam) {
    if (!didParam.startsWith("did:")) {
      throw new AuthRequiredError("Invalid did parameter");
    }
    return didParam as Did;
  }

  if (auth) {
    return auth.did;
  }

  if (authRequired) {
    throw new AuthRequiredError("Authentication required");
  }

  throw new AuthRequiredError("did parameter or authentication required");
}
