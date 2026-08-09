import type { RateLimitResult } from "#/server/rate-limit";
import { getClientIp, rateLimitHeaders } from "#/server/rate-limit";
import { checkRateLimit, checkRateLimitByIp } from "#/server/rate-limit-policy";

import { authenticateRequest, requireScopes } from "./auth";
import { getXrpcDbContext } from "./db";
import {
  AuthRequiredError,
  InvalidRequestError,
  handleXrpcError,
  xrpcJsonResponse,
} from "./errors";
import { parseProcedureBody, parseQueryParams } from "./params";
import { XRPC_REGISTRY, parseXrpcNsid } from "./registry";
import type { XrpcAuthContext, XrpcRequestContext } from "./types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  // Browser clients can only read these off a cross-origin response if we say
  // so — without it they can't pace themselves or see how long to back off.
  "Access-Control-Expose-Headers":
    "RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After",
  "Access-Control-Max-Age": "86400",
} as const;

function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * The AT Protocol error for a throttled request. Not an `XRPCError` subclass
 * because `@atproto/xrpc-server` has no 429 type — the shape still matches what
 * every other error on this surface returns.
 */
function rateLimitedResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "RateLimitExceeded",
      message: `Rate limit exceeded. Retry in ${Math.ceil(
        result.retryAfterMs / 1000,
      )}s.`,
    }),
    {
      status: 429,
      headers: {
        ...CORS_HEADERS,
        ...rateLimitHeaders(result),
        "Content-Type": "application/json",
      },
    },
  );
}

async function resolveAuth(
  request: Request,
  nsid: string,
  mode: "none" | "required" | "optional-did",
): Promise<XrpcAuthContext | null> {
  if (mode === "none") return null;

  if (mode === "required") {
    return authenticateRequest(request, nsid);
  }

  try {
    return await authenticateRequest(request, nsid);
  } catch {
    return null;
  }
}

export async function dispatchXrpc(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  const url = new URL(request.url);
  const nsid = parseXrpcNsid(url.pathname);
  if (!nsid) {
    return handleXrpcError(new InvalidRequestError("Invalid XRPC path"));
  }

  const entry = XRPC_REGISTRY.get(nsid);
  if (!entry) {
    return handleXrpcError(new InvalidRequestError("Method not found"));
  }

  if (entry.method === "query" && request.method !== "GET") {
    return handleXrpcError(
      new InvalidRequestError("Query methods must use GET"),
    );
  }
  if (entry.method === "procedure" && request.method !== "POST") {
    return handleXrpcError(
      new InvalidRequestError("Procedure methods must use POST"),
    );
  }

  // Coarse per-IP guard first, before we touch the database or make the
  // `getSession` call that authentication needs — otherwise a flood of
  // unauthenticated requests costs us a network round trip each.
  const ipLimit = checkRateLimitByIp("xrpcIp", request);
  if (!ipLimit.allowed) {
    return rateLimitedResponse(ipLimit);
  }

  // Held outside the try so an error response can still report the budget —
  // a caller burning their allowance on 400s should see it draining.
  let methodLimit: RateLimitResult | null = null;

  try {
    const [
      {
        db,
        schema,
        trackReadingEnabled,
        countOldPostsAsUnreadEnabled,
        excludeWebBridgeEnabled,
      },
      auth,
    ] = await Promise.all([
      getXrpcDbContext(),
      resolveAuth(request, nsid, entry.auth),
    ]);

    // Now that the caller is known, charge them rather than their IP: a shared
    // NAT shouldn't throttle everyone behind it, and one account shouldn't get
    // a fresh budget per address. Writes get a much tighter budget than reads
    // because each one fans out to the caller's PDS.
    const subject = auth ? `did:${auth.did}` : `ip:${getClientIp(request)}`;
    methodLimit = checkRateLimit(
      entry.method === "procedure" ? "xrpcProcedure" : "xrpcQuery",
      subject,
    );
    if (!methodLimit.allowed) {
      return rateLimitedResponse(methodLimit);
    }

    if (entry.auth === "required" && !auth) {
      throw new AuthRequiredError("Authentication required");
    }

    if (entry.scopes?.length) {
      if (!auth) {
        throw new AuthRequiredError("Authentication required");
      }
      requireScopes(auth, entry.scopes);
    }

    const params = parseQueryParams(url);
    const body =
      entry.method === "procedure"
        ? await parseProcedureBody(request)
        : undefined;

    const ctx: XrpcRequestContext = {
      request,
      auth,
      db,
      schema,
      trackReadingEnabled,
      countOldPostsAsUnreadEnabled,
      excludeWebBridgeEnabled,
      params,
      body: body ?? null,
    };

    const result = await entry.handler(ctx);
    return xrpcJsonResponse(result, 200, {
      ...CORS_HEADERS,
      ...rateLimitHeaders(methodLimit),
    });
  } catch (error) {
    return handleXrpcError(error, {
      ...CORS_HEADERS,
      ...(methodLimit ? rateLimitHeaders(methodLimit) : {}),
    });
  }
}
