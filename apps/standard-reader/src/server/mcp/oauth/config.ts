import { getPublicUrl } from "#/lib/public-url";

import { MCP_SUPPORTED_SCOPES } from "../session";

/** Path the MCP endpoint is served from. */
export const MCP_PATH = "/mcp";

/** How long an authorization code stays redeemable. Single use either way. */
export const AUTH_CODE_TTL_MS = 60_000;

/** Access-token lifetime. Short — clients refresh. */
export const ACCESS_TOKEN_TTL_MS = 60 * 60_000;

/** Refresh-token lifetime, extended on every rotation. */
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60_000;

/** Scopes this authorization server will issue. */
export const SUPPORTED_SCOPES = MCP_SUPPORTED_SCOPES;

/** Granted when a client asks for no scope in particular. */
export const DEFAULT_SCOPE = SUPPORTED_SCOPES.join(" ");

function origin(): string {
  return getPublicUrl().replace(/\/+$/, "");
}

/** OAuth issuer identifier — the app's own origin. */
export function issuer(): string {
  return origin();
}

/** Canonical URI of the protected resource MCP tokens are minted for. */
export function resourceUrl(): string {
  return `${origin()}${MCP_PATH}`;
}

export function authorizationEndpoint(): string {
  return `${origin()}/mcp/authorize`;
}

export function tokenEndpoint(): string {
  return `${origin()}/api/mcp/token`;
}

export function registrationEndpoint(): string {
  return `${origin()}/api/mcp/register`;
}

export function revocationEndpoint(): string {
  return `${origin()}/api/mcp/revoke`;
}

/** Where a 401 from `/mcp` points clients to start discovery (RFC 9728). */
export function protectedResourceMetadataUrl(): string {
  return `${origin()}/.well-known/oauth-protected-resource/mcp`;
}

/**
 * Accept a client's RFC 8707 `resource` only when it names this MCP server.
 * Binding the token to an audience is the control that stops a token minted
 * for someone else's server from being replayed against ours.
 */
export function isAcceptableResource(value: string): boolean {
  try {
    const requested = new URL(value);
    const ours = new URL(resourceUrl());
    return (
      requested.origin === ours.origin &&
      requested.pathname.replace(/\/+$/, "") ===
        ours.pathname.replace(/\/+$/, "")
    );
  } catch {
    return false;
  }
}
