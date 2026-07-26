import { authenticateClient, registerClient, requireClient } from "./clients";
import { isAcceptableResource, SUPPORTED_SCOPES } from "./config";
import { jsonResponse, OAuthError, oauthErrorResponse } from "./errors";
import {
  exchangeAuthorizationCode,
  pruneExpired,
  refreshGrant,
  revokeToken,
} from "./tokens";

/**
 * Read a request body as form fields.
 *
 * OAuth specifies `application/x-www-form-urlencoded` for the token and
 * revocation endpoints, but enough clients post JSON that rejecting it would
 * just produce mystery failures. Accept both.
 */
async function readFields(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  const fields: Record<string, string> = {};

  if (contentType.includes("application/json")) {
    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      throw new OAuthError("invalid_request", "Body is not valid JSON.");
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string") fields[key] = value;
      }
    }
    return fields;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new OAuthError(
      "invalid_request",
      "Body must be application/x-www-form-urlencoded or application/json.",
    );
  }
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}

/** Client credentials from either `client_secret_basic` or `_post`. */
function clientCredentials(
  request: Request,
  fields: Record<string, string>,
): { clientId: string | null; secret: string | null } {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(header.slice(6).trim(), "base64").toString(
      "utf8",
    );
    const colon = decoded.indexOf(":");
    if (colon !== -1) {
      return {
        clientId: decodeURIComponent(decoded.slice(0, colon)),
        secret: decodeURIComponent(decoded.slice(colon + 1)),
      };
    }
  }
  return {
    clientId: fields.client_id ?? null,
    secret: fields.client_secret ?? null,
  };
}

function optional(fields: Record<string, string>, key: string): string | null {
  const value = fields[key]?.trim();
  return value || null;
}

/** `POST /api/mcp/register` — RFC 7591 dynamic client registration. */
export async function handleRegister(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new OAuthError(
        "invalid_request",
        "Registration body must be JSON.",
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new OAuthError(
        "invalid_request",
        "Registration body must be a JSON object.",
      );
    }

    const { client, secret } = await registerClient(
      body as Record<string, unknown>,
    );
    return jsonResponse(
      {
        client_id: client.id,
        ...(secret ? { client_secret: secret } : {}),
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        // Secrets do not expire; a client that loses one re-registers.
        ...(secret ? { client_secret_expires_at: 0 } : {}),
        client_name: client.name,
        redirect_uris: JSON.parse(client.redirectUris) as Array<string>,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
        scope: client.scope,
      },
      201,
    );
  } catch (error) {
    return oauthErrorResponse(error);
  }
}

/** `POST /api/mcp/token` — authorization-code exchange and refresh. */
export async function handleToken(request: Request): Promise<Response> {
  try {
    const fields = await readFields(request);
    const grantType = optional(fields, "grant_type");
    const { clientId, secret } = clientCredentials(request, fields);
    const client = await requireClient(clientId);
    authenticateClient(client, secret);

    const resource = optional(fields, "resource");
    if (resource !== null && !isAcceptableResource(resource)) {
      throw new OAuthError(
        "invalid_target",
        "`resource` does not name this MCP server.",
      );
    }

    // Opportunistic cleanup — cheap, and keeps the code table from growing
    // without needing a dedicated cron entry.
    void pruneExpired().catch(() => {});

    if (grantType === "authorization_code") {
      const code = optional(fields, "code");
      if (!code) {
        throw new OAuthError("invalid_request", "`code` is required.");
      }
      return jsonResponse(
        await exchangeAuthorizationCode({
          code,
          clientId: client.row.id,
          redirectUri: optional(fields, "redirect_uri"),
          codeVerifier: optional(fields, "code_verifier"),
          resource,
        }),
      );
    }

    if (grantType === "refresh_token") {
      const refreshToken = optional(fields, "refresh_token");
      if (!refreshToken) {
        throw new OAuthError("invalid_request", "`refresh_token` is required.");
      }
      return jsonResponse(
        await refreshGrant({ refreshToken, clientId: client.row.id }),
      );
    }

    throw new OAuthError(
      "unsupported_grant_type",
      "Supported grant types: authorization_code, refresh_token.",
    );
  } catch (error) {
    return oauthErrorResponse(error);
  }
}

/** `POST /api/mcp/revoke` — RFC 7009 token revocation. */
export async function handleRevoke(request: Request): Promise<Response> {
  try {
    const fields = await readFields(request);
    const token = optional(fields, "token");
    if (!token) {
      throw new OAuthError("invalid_request", "`token` is required.");
    }
    const { clientId, secret } = clientCredentials(request, fields);
    const client = await requireClient(clientId);
    authenticateClient(client, secret);

    await revokeToken({ token, clientId: client.row.id });
    // RFC 7009: revoking an unknown token is a success, so a client can't probe
    // for which tokens exist.
    return jsonResponse({}, 200);
  } catch (error) {
    return oauthErrorResponse(error);
  }
}

export { SUPPORTED_SCOPES };
