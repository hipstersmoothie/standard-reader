/** OAuth 2.1 error codes we emit (RFC 6749 §4.1.2.1, §5.2 + RFC 8707). */
export type OAuthErrorCode =
  | "access_denied"
  | "invalid_client"
  | "invalid_grant"
  | "invalid_redirect_uri"
  | "invalid_request"
  | "invalid_scope"
  | "invalid_target"
  | "invalid_token"
  | "server_error"
  | "unauthorized_client"
  | "unsupported_grant_type"
  | "unsupported_response_type";

export class OAuthError extends Error {
  readonly code: OAuthErrorCode;
  readonly status: number;

  constructor(code: OAuthErrorCode, message: string, status?: number) {
    super(message);
    this.name = "OAuthError";
    this.code = code;
    this.status = status ?? defaultStatus(code);
  }
}

function defaultStatus(code: OAuthErrorCode): number {
  switch (code) {
    case "invalid_client":
    case "invalid_token": {
      return 401;
    }
    case "access_denied":
    case "unauthorized_client": {
      return 403;
    }
    case "server_error": {
      return 500;
    }
    default: {
      return 400;
    }
  }
}

/**
 * CORS for the OAuth + MCP endpoints. Browser-hosted MCP clients (claude.ai)
 * call these cross-origin, so the preflight has to allow the headers the MCP
 * transport sets, and `WWW-Authenticate` has to be readable for the client to
 * discover where to authorize.
 */
export const OAUTH_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Last-Event-ID, Mcp-Session-Id, " +
    "MCP-Protocol-Version",
  "Access-Control-Expose-Headers":
    "Mcp-Session-Id, WWW-Authenticate, MCP-Protocol-Version, RateLimit-Limit, " +
    "RateLimit-Remaining, RateLimit-Reset, Retry-After",
  "Access-Control-Max-Age": "86400",
};

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...OAUTH_CORS_HEADERS,
      ...extraHeaders,
      "Content-Type": "application/json",
      // Token and metadata responses must never be cached by an intermediary.
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
}

/** A throttled OAuth endpoint, in the shape RFC 6749 error responses use. */
export function oauthRateLimitedResponse(
  result: { retryAfterMs: number },
  headers: Record<string, string>,
): Response {
  return jsonResponse(
    {
      error: "slow_down",
      error_description: `Rate limit exceeded. Retry in ${Math.ceil(
        result.retryAfterMs / 1000,
      )}s.`,
    },
    429,
    headers,
  );
}

/** Render any thrown value as an OAuth error response. */
export function oauthErrorResponse(cause: unknown): Response {
  if (cause instanceof OAuthError) {
    const headers =
      cause.status === 401
        ? { "WWW-Authenticate": `Bearer error="${cause.code}"` }
        : undefined;
    return jsonResponse(
      { error: cause.code, error_description: cause.message },
      cause.status,
      headers,
    );
  }
  // Never leak an internal message to an unauthenticated caller.
  console.error("[mcp/oauth] unhandled error", cause);
  return jsonResponse(
    { error: "server_error", error_description: "Internal error" },
    500,
  );
}
