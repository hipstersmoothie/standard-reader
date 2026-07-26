import { eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";

import type { RegisteredClient } from "./clients";
import { assertRegisteredRedirectUri, requireClient } from "./clients";
import {
  DEFAULT_SCOPE,
  isAcceptableResource,
  SUPPORTED_SCOPES,
} from "./config";
import { narrowScope } from "./crypto";
import { OAuthError } from "./errors";
import { issueAuthorizationCode } from "./tokens";

/** The authorization request, once it has survived validation. */
export interface AuthorizationRequest {
  clientId: string;
  clientName: string;
  clientUri: string | null;
  redirectUri: string;
  scope: string;
  state: string | null;
  codeChallenge: string;
  resource: string | null;
}

/**
 * Parameters we accept on `/mcp/authorize`. Kept as a plain shape so the route
 * can validate search params with the same names the spec uses.
 */
export interface AuthorizationParams {
  response_type?: string | undefined;
  client_id?: string | undefined;
  redirect_uri?: string | undefined;
  scope?: string | undefined;
  state?: string | undefined;
  code_challenge?: string | undefined;
  code_challenge_method?: string | undefined;
  resource?: string | undefined;
}

/**
 * Errors that can be reported back to the client, versus errors that must be
 * shown to the user.
 *
 * The split matters: we may only redirect once we have established that the
 * `redirect_uri` really belongs to the named client. Before that, redirecting
 * an error would turn this endpoint into an open redirector.
 */
export type AuthorizationCheck =
  | { ok: true; request: AuthorizationRequest }
  | { ok: false; kind: "display"; code: string; message: string }
  | { ok: false; kind: "redirect"; url: string };

function redirectWithError(
  redirectUri: string,
  state: string | null,
  code: string,
  description: string,
): AuthorizationCheck {
  const url = new URL(redirectUri);
  url.searchParams.set("error", code);
  url.searchParams.set("error_description", description);
  if (state !== null) url.searchParams.set("state", state);
  return { ok: false, kind: "redirect", url: url.toString() };
}

/** Validate an authorization request without side effects. */
export async function checkAuthorizationRequest(
  params: AuthorizationParams,
): Promise<AuthorizationCheck> {
  let client: RegisteredClient;
  try {
    client = await requireClient(params.client_id?.trim() ?? null);
  } catch (error) {
    const message =
      error instanceof OAuthError ? error.message : "Unknown client.";
    return { ok: false, kind: "display", code: "invalid_client", message };
  }

  let redirectUri: string;
  try {
    redirectUri = assertRegisteredRedirectUri(
      client,
      params.redirect_uri?.trim() ?? null,
    );
  } catch (error) {
    return {
      ok: false,
      kind: "display",
      code: "invalid_redirect_uri",
      message:
        error instanceof OAuthError ? error.message : "Invalid redirect_uri.",
    };
  }

  // From here the redirect target is trusted, so protocol errors go back to
  // the client rather than into the user's face.
  const state = params.state?.trim() ?? null;

  if (params.response_type?.trim() !== "code") {
    return redirectWithError(
      redirectUri,
      state,
      "unsupported_response_type",
      "Only response_type=code is supported.",
    );
  }

  const challenge = params.code_challenge?.trim();
  const method = params.code_challenge_method?.trim() ?? "S256";
  if (!challenge) {
    return redirectWithError(
      redirectUri,
      state,
      "invalid_request",
      "PKCE is required: send code_challenge with code_challenge_method=S256.",
    );
  }
  if (method !== "S256") {
    return redirectWithError(
      redirectUri,
      state,
      "invalid_request",
      "Only code_challenge_method=S256 is supported.",
    );
  }

  const { scope, unsupported } = narrowScope(
    params.scope,
    SUPPORTED_SCOPES,
    DEFAULT_SCOPE,
  );
  if (unsupported.length > 0) {
    return redirectWithError(
      redirectUri,
      state,
      "invalid_scope",
      `Unsupported scope(s): ${unsupported.join(", ")}.`,
    );
  }

  const resource = params.resource?.trim() ?? null;
  if (resource !== null && !isAcceptableResource(resource)) {
    return redirectWithError(
      redirectUri,
      state,
      "invalid_target",
      "`resource` does not name this MCP server.",
    );
  }

  return {
    ok: true,
    request: {
      clientId: client.row.id,
      clientName: client.row.name,
      clientUri: client.row.clientUri,
      redirectUri,
      scope,
      state,
      codeChallenge: challenge,
      resource,
    },
  };
}

/** Build the URL to send the user back to after they approve. */
export async function approveAuthorization(input: {
  request: AuthorizationRequest;
  userId: string;
  did: string;
}): Promise<string> {
  const code = await issueAuthorizationCode({
    subject: {
      userId: input.userId,
      did: input.did,
      clientId: input.request.clientId,
      scope: input.request.scope,
      resource: input.request.resource,
    },
    redirectUri: input.request.redirectUri,
    codeChallenge: input.request.codeChallenge,
  });

  const url = new URL(input.request.redirectUri);
  url.searchParams.set("code", code);
  if (input.request.state !== null) {
    url.searchParams.set("state", input.request.state);
  }
  return url.toString();
}

/** Build the URL to send the user back to after they decline. */
export function denyAuthorization(request: AuthorizationRequest): string {
  const url = new URL(request.redirectUri);
  url.searchParams.set("error", "access_denied");
  url.searchParams.set(
    "error_description",
    "The reader declined this connection.",
  );
  if (request.state !== null) url.searchParams.set("state", request.state);
  return url.toString();
}

/** Grants a reader can see and revoke in settings. */
export async function listGrantsForUser(userId: string) {
  const rows = await db.query.mcpToken.findMany({
    where: eq(schema.mcpToken.userId, userId),
    with: { client: true },
  });
  return rows
    .filter((row) => row.revokedAt === null)
    .map((row) => ({
      id: row.id,
      clientName: row.client?.name ?? row.clientId,
      clientUri: row.client?.clientUri ?? null,
      scopes: row.scope.split(/\s+/).filter(Boolean),
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    }));
}
