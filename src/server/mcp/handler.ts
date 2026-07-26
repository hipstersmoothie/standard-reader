import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { logEvent } from "#/server/observability/log";
import type { RateLimitResult } from "#/server/rate-limit";
import { rateLimitHeaders } from "#/server/rate-limit";
import { checkRateLimit, checkRateLimitByIp } from "#/server/rate-limit-policy";

import { protectedResourceMetadataUrl } from "./oauth/config";
import {
  corsPreflight,
  jsonResponse,
  OAUTH_CORS_HEADERS,
} from "./oauth/errors";
import { verifyAccessToken } from "./oauth/tokens";
import { createMcpServer } from "./server";
import { McpSession } from "./session";

/**
 * Tell an unauthenticated client where to go and authorize.
 *
 * This 401 is the entire discovery entry point: an MCP client that gets it
 * reads `resource_metadata`, fetches our protected-resource document, finds the
 * authorization server, registers itself, and walks the user through consent.
 * Without the header, clients have nothing to go on and just fail.
 */
function unauthorized(description: string): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32_001, message: description },
      id: null,
    }),
    {
      status: 401,
      headers: {
        ...OAUTH_CORS_HEADERS,
        "Content-Type": "application/json",
        "WWW-Authenticate":
          `Bearer realm="standard-reader", error="invalid_token", ` +
          `error_description="${description}", ` +
          `resource_metadata="${protectedResourceMetadataUrl()}"`,
      },
    },
  );
}

/** JSON-RPC shaped 429, so an MCP client sees an error it can parse. */
function rateLimited(result: RateLimitResult): Response {
  return jsonResponse(
    {
      jsonrpc: "2.0",
      error: {
        code: -32_000,
        message: `Rate limit exceeded. Retry in ${Math.ceil(
          result.retryAfterMs / 1000,
        )}s.`,
      },
      id: null,
    },
    429,
    rateLimitHeaders(result),
  );
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const space = header.indexOf(" ");
  if (space === -1) return null;
  if (header.slice(0, space).toLowerCase() !== "bearer") return null;
  const token = header.slice(space + 1).trim();
  return token.length > 0 ? token : null;
}

/**
 * Handle one request to `/mcp`.
 *
 * Stateless: a transport and server are built per request and torn down with
 * it. The MCP session identity lives in the presented token, not in server
 * memory, so any instance behind the load balancer can serve any request —
 * which is what lets this run as an ordinary route on the web service.
 */
export async function handleMcpRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return corsPreflight();
  }

  // Stateless mode has no stream to resume and no session to delete.
  if (request.method === "GET" || request.method === "DELETE") {
    return jsonResponse(
      {
        jsonrpc: "2.0",
        error: {
          code: -32_000,
          message:
            "This MCP endpoint is stateless: use POST for JSON-RPC. Server-" +
            "initiated streams and session deletion are not supported.",
        },
        id: null,
      },
      405,
      { Allow: "POST, OPTIONS" },
    );
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, {
      Allow: "POST, OPTIONS",
    });
  }

  // Before the token lookup, so an unauthenticated flood can't spend a
  // database round trip per request.
  const ipLimit = checkRateLimitByIp("mcpIp", request);
  if (!ipLimit.allowed) {
    return rateLimited(ipLimit);
  }

  const token = bearerToken(request);
  if (!token) {
    return unauthorized("Authorization required");
  }

  let verified: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    verified = await verifyAccessToken(token);
  } catch (error) {
    // A token lookup that *failed* is not a token that was *rejected*. Saying
    // 401 here would send every client off to re-authorize during a database
    // blip, and they'd all come back with tokens we still couldn't read.
    logEvent("mcp.token_lookup_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(
      {
        jsonrpc: "2.0",
        error: { code: -32_603, message: "Could not verify the access token" },
        id: null,
      },
      503,
    );
  }
  if (!verified) {
    return unauthorized("The access token is expired, revoked, or unknown");
  }

  // Charge the grant, not the IP: one connector shouldn't be able to spend
  // another reader's budget by sharing an egress address.
  const grantLimit = checkRateLimit("mcpGrant", `grant:${verified.grantId}`);
  if (!grantLimit.allowed) {
    return rateLimited(grantLimit);
  }

  const session = new McpSession({
    did: verified.did,
    scopes: verified.scopes,
    clientName: verified.clientName,
  });

  const server = createMcpServer(session);
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: no session id, and a buffered JSON reply rather than an SSE
    // stream, so the whole exchange fits in one request/response.
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    // Buffer the reply before the `finally` tears the transport down — with
    // `enableJsonResponse` it is a complete JSON document, so this costs
    // nothing and removes any chance of returning a stream we then abort.
    const body = await response.text();
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries({
      ...OAUTH_CORS_HEADERS,
      ...rateLimitHeaders(grantLimit),
    })) {
      headers.set(key, value);
    }
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    logEvent("mcp.request_failed", {
      client: verified.clientId,
      did: verified.did,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(
      {
        jsonrpc: "2.0",
        error: { code: -32_603, message: "Internal error" },
        id: null,
      },
      500,
    );
  } finally {
    void server.close().catch(() => {});
  }
}
