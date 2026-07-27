import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";

import { DEFAULT_SCOPE, SUPPORTED_SCOPES } from "./config";
import { hashToken, narrowScope, randomToken, secretsMatch } from "./crypto";
import { OAuthError } from "./errors";

export type McpClientRow = typeof schema.mcpClient.$inferSelect;

export interface RegisteredClient {
  row: McpClientRow;
  redirectUris: Array<string>;
}

const MAX_REDIRECT_URIS = 10;
const MAX_NAME_LENGTH = 200;

function parseRedirectUris(value: string): Array<string> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry) => isString(entry))
      : [];
  } catch {
    return [];
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * A redirect URI we're willing to send an authorization code to.
 *
 * `https` anywhere, plus loopback `http` for desktop clients that spin up a
 * local listener (RFC 8252), plus custom app schemes for native clients. Never
 * plain `http` on a non-loopback host — that would leak the code in transit.
 */
function isAllowedRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") {
    return (
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "[::1]"
    );
  }
  // A custom scheme (e.g. `cursor://`) — allowed, but it must actually be a
  // scheme with a body, not something degenerate.
  return (
    /^[a-z][a-z0-9+.-]*:$/i.test(url.protocol) &&
    value.length > url.protocol.length + 2
  );
}

function stringField(
  body: Record<string, unknown>,
  key: string,
): string | null {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * RFC 7591 dynamic client registration.
 *
 * Open registration: any MCP client can register itself, which is what makes
 * "paste the URL into your client" work. That is safe because a registration
 * grants nothing on its own — every token still requires a reader to sign in
 * and approve this specific client on the consent screen.
 */
export async function registerClient(
  body: Record<string, unknown>,
): Promise<{ client: McpClientRow; secret: string | null }> {
  const rawRedirects = body.redirect_uris;
  if (!Array.isArray(rawRedirects) || rawRedirects.length === 0) {
    throw new OAuthError(
      "invalid_redirect_uri",
      "`redirect_uris` is required and must be a non-empty array.",
    );
  }
  if (rawRedirects.length > MAX_REDIRECT_URIS) {
    throw new OAuthError(
      "invalid_redirect_uri",
      `At most ${MAX_REDIRECT_URIS} redirect URIs.`,
    );
  }
  const redirectUris = rawRedirects.filter((entry) => isString(entry));
  const bad = redirectUris.find((uri) => !isAllowedRedirectUri(uri));
  if (redirectUris.length !== rawRedirects.length || bad !== undefined) {
    throw new OAuthError(
      "invalid_redirect_uri",
      `Unsupported redirect URI: ${bad ?? "(non-string entry)"}. Use https, a ` +
        "loopback http URL, or a custom app scheme.",
    );
  }

  const grantTypes = Array.isArray(body.grant_types)
    ? body.grant_types.filter(isString)
    : ["authorization_code", "refresh_token"];
  const unsupportedGrant = grantTypes.find(
    (grant) => grant !== "authorization_code" && grant !== "refresh_token",
  );
  if (unsupportedGrant) {
    throw new OAuthError(
      "invalid_request",
      `Unsupported grant type: ${unsupportedGrant}.`,
    );
  }

  const requestedAuthMethod =
    stringField(body, "token_endpoint_auth_method") ?? "none";
  if (
    requestedAuthMethod !== "none" &&
    requestedAuthMethod !== "client_secret_post" &&
    requestedAuthMethod !== "client_secret_basic"
  ) {
    throw new OAuthError(
      "invalid_request",
      `Unsupported token_endpoint_auth_method: ${requestedAuthMethod}.`,
    );
  }

  const { scope, unsupported } = narrowScope(
    stringField(body, "scope"),
    SUPPORTED_SCOPES,
    DEFAULT_SCOPE,
  );
  if (unsupported.length > 0) {
    throw new OAuthError(
      "invalid_scope",
      `Unsupported scope(s): ${unsupported.join(", ")}. Supported: ` +
        SUPPORTED_SCOPES.join(", "),
    );
  }

  const secret = requestedAuthMethod === "none" ? null : randomToken();
  const [row] = await db
    .insert(schema.mcpClient)
    .values({
      id: `mcp_${randomUUID()}`,
      secretHash: secret ? hashToken(secret) : null,
      name: (stringField(body, "client_name") ?? "Unnamed MCP client").slice(
        0,
        MAX_NAME_LENGTH,
      ),
      redirectUris: JSON.stringify(redirectUris),
      tokenEndpointAuthMethod: requestedAuthMethod,
      scope,
      clientUri: stringField(body, "client_uri"),
      logoUri: stringField(body, "logo_uri"),
      softwareId: stringField(body, "software_id"),
    })
    .returning();

  if (!row) {
    throw new OAuthError("server_error", "Could not register the client.");
  }
  return { client: row, secret };
}

/** Look a client up by `client_id`. */
export async function findClient(
  clientId: string,
): Promise<RegisteredClient | null> {
  const row = await db.query.mcpClient.findFirst({
    where: eq(schema.mcpClient.id, clientId),
  });
  if (!row) return null;
  return { row, redirectUris: parseRedirectUris(row.redirectUris) };
}

/** Look a client up, or throw the OAuth error the endpoints should return. */
export async function requireClient(
  clientId: string | null,
): Promise<RegisteredClient> {
  if (!clientId) {
    throw new OAuthError("invalid_client", "`client_id` is required.");
  }
  const client = await findClient(clientId);
  if (!client) {
    throw new OAuthError("invalid_client", "Unknown client_id.");
  }
  return client;
}

/**
 * Exact-match a redirect URI against what the client registered. No prefix or
 * wildcard matching — an open redirect here would hand out authorization codes.
 */
export function assertRegisteredRedirectUri(
  client: RegisteredClient,
  redirectUri: string | null,
): string {
  if (!redirectUri) {
    // With exactly one registered URI, omitting it is unambiguous.
    const only =
      client.redirectUris.length === 1 ? client.redirectUris[0] : undefined;
    if (only) return only;
    throw new OAuthError(
      "invalid_redirect_uri",
      "`redirect_uri` is required when a client registers more than one.",
    );
  }
  if (!client.redirectUris.includes(redirectUri)) {
    throw new OAuthError(
      "invalid_redirect_uri",
      "redirect_uri does not match a registered URI for this client.",
    );
  }
  return redirectUri;
}

/** Authenticate a confidential client at the token/revocation endpoint. */
export function authenticateClient(
  client: RegisteredClient,
  presentedSecret: string | null,
): void {
  if (client.row.tokenEndpointAuthMethod === "none") {
    // Public client: PKCE is the proof, there is no secret to check.
    return;
  }
  if (!presentedSecret || !client.row.secretHash) {
    throw new OAuthError("invalid_client", "Client authentication failed.");
  }
  if (!secretsMatch(hashToken(presentedSecret), client.row.secretHash)) {
    throw new OAuthError("invalid_client", "Client authentication failed.");
  }
}
