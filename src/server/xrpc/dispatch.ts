import type { XrpcAuthContext, XrpcRequestContext } from "./types";

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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
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

  try {
    const [{ db, schema, trackReadingEnabled }, auth] = await Promise.all([
      getXrpcDbContext(),
      resolveAuth(request, nsid, entry.auth),
    ]);

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
      params,
      body: body ?? null,
    };

    const result = await entry.handler(ctx);
    return xrpcJsonResponse(result, 200, CORS_HEADERS);
  } catch (error) {
    return handleXrpcError(error);
  }
}
