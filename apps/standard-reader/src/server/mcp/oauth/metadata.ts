import {
  authorizationEndpoint,
  issuer,
  registrationEndpoint,
  resourceUrl,
  revocationEndpoint,
  SUPPORTED_SCOPES,
  tokenEndpoint,
} from "./config";

/**
 * RFC 8414 authorization-server metadata.
 *
 * Standard Reader is its own authorization server for MCP clients. It is not
 * an AT Protocol authorization server — the reader's PDS remains that. What
 * this issues are tokens that let an MCP client act *through* Standard Reader
 * as a reader who has already signed in here.
 */
export function authorizationServerMetadata(): Record<string, unknown> {
  return {
    issuer: issuer(),
    authorization_endpoint: authorizationEndpoint(),
    token_endpoint: tokenEndpoint(),
    registration_endpoint: registrationEndpoint(),
    revocation_endpoint: revocationEndpoint(),
    scopes_supported: SUPPORTED_SCOPES,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    // PKCE is mandatory: OAuth 2.1 drops the implicit flow and requires it for
    // every authorization-code exchange, public client or not.
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_basic",
      "client_secret_post",
    ],
    revocation_endpoint_auth_methods_supported: [
      "none",
      "client_secret_basic",
      "client_secret_post",
    ],
    service_documentation: `${issuer()}/docs/api`,
  };
}

/** RFC 9728 protected-resource metadata for the `/mcp` endpoint. */
export function protectedResourceMetadata(): Record<string, unknown> {
  return {
    resource: resourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: `${issuer()}/docs/api`,
  };
}
