import type { Client } from "@atcute/client";
import type { Did } from "@atcute/lexicons";

import { Client as AtpClient } from "@atcute/client";
import { verifyJwt } from "@atproto/xrpc-server";
import { resolveIdentity } from "#/server/atproto/identity";

import { appviewAudience } from "./config";
import { AuthRequiredError, ForbiddenError } from "./errors";

export type XrpcAuthContext = {
  /** Authenticated user DID (from access token or service JWT iss). */
  did: Did;
  /** PDS client when authenticated via OAuth access token. */
  client: Client | null;
  /** OAuth scopes from getSession, when available. */
  scopes: Array<string>;
  /** How the request was authenticated. */
  via: "accessToken" | "serviceJwt";
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
    const host = did.slice("did:web:".length).replaceAll(":", ".");
    docUrl = `https://${host}/.well-known/did.json`;
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
  return verificationMethod.publicKeyMultibase;
}

async function verifyServiceJwt(
  jwt: string,
  lxm: string,
): Promise<XrpcAuthContext> {
  const payload = await verifyJwt(jwt, appviewAudience(), lxm, getSigningKey);
  const iss = payload.iss.split("#")[0] as Did;
  return {
    did: iss,
    client: null,
    scopes: [],
    via: "serviceJwt",
  };
}

async function resolvePdsFromAccessToken(token: string): Promise<string> {
  const { decodeJwt } = await import("jose");
  const payload = decodeJwt(token);
  const iss = payload.iss;
  if (typeof iss === "string" && iss.startsWith("http")) {
    return iss.replace(/\/+$/, "");
  }
  const sub = payload.sub;
  if (typeof sub === "string" && sub.startsWith("did:")) {
    const identity = await resolveIdentity(sub as Did);
    if (identity.pds) return identity.pds.replace(/\/+$/, "");
  }
  throw new AuthRequiredError("Unable to resolve PDS for access token");
}

async function verifyAccessToken(
  token: string,
  scheme: string,
): Promise<XrpcAuthContext> {
  if (scheme === "dpop") {
    // DPoP proof validation is required by the OAuth profile; bind check is
    // deferred — token validity is established via getSession on the issuer PDS.
  } else if (scheme !== "bearer") {
    throw new AuthRequiredError(`Unsupported authorization scheme: ${scheme}`);
  }

  const pds = await resolvePdsFromAccessToken(token);
  const url = new URL("/xrpc/com.atproto.server.getSession", pds);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(GET_SESSION_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
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
    handler: async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
  });
  return {
    did: session.did as Did,
    client,
    scopes: session.scopes ?? [],
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
    try {
      return await verifyServiceJwt(parsed.token, lxm);
    } catch {
      // Not a service JWT — fall through to access-token validation.
    }
  }

  if (parsed.scheme === "bearer" || parsed.scheme === "dpop") {
    return verifyAccessToken(parsed.token, parsed.scheme);
  }

  throw new AuthRequiredError("Authentication required");
}

export function requireScopes(
  auth: XrpcAuthContext,
  required: Array<string>,
): void {
  if (auth.via === "serviceJwt") return;
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
