import type { Did } from "@atcute/lexicons";

import { restoreAuthenticatedClient } from "#/integrations/auth/restore-client.server";
import { getPublicUrl } from "#/lib/public-url";
import type { XrpcAuthContext } from "#/server/xrpc/auth";
import { getXrpcDbContext } from "#/server/xrpc/db";
import { AuthRequiredError } from "#/server/xrpc/errors";
import { XRPC_REGISTRY } from "#/server/xrpc/registry";
import type { XrpcQueryParams, XrpcRequestContext } from "#/server/xrpc/types";

import { InvalidInputError } from "./errors";

/** Value types a tool may pass as an XRPC query parameter. */
type ParamValue = string | number | boolean | undefined;

export type XrpcParams = Record<string, ParamValue>;

/**
 * Build the auth context an XRPC handler sees for an MCP-authenticated reader.
 *
 * The MCP server runs inside the app, so it does not present a token to itself
 * — it restores the reader's own stored AT Protocol OAuth session, exactly as
 * the web UI's server functions do. Write procedures use that session's client
 * to write to the reader's repo, which means the PDS remains the authority on
 * what the reader actually granted.
 *
 * Returns `null` when the reader's OAuth session is gone (revoked on the PDS,
 * or expired past refresh). Callers surface that as "sign in to Standard Reader
 * again" rather than a generic failure.
 */
export async function readerAuthContext(
  did: string,
): Promise<XrpcAuthContext | null> {
  const client = await restoreAuthenticatedClient(did as Did);
  if (!client) return null;
  return { did: did as Did, client, scopes: null, via: "internal" };
}

function serializeParams(params: XrpcParams | undefined): XrpcQueryParams {
  const out: XrpcQueryParams = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue;
    out[key] = String(value);
  }
  return out;
}

/**
 * Invoke an `app.standard-reader.*` method in-process.
 *
 * This is the MCP server's whole transport layer. Rather than making an HTTP
 * request back to our own `/xrpc`, it looks the method up in the same
 * {@link XRPC_REGISTRY} the public API dispatches through and calls its handler
 * directly — same handler, same read-model context, same auth rules, one less
 * network hop and no token to mint for ourselves.
 */
export async function invokeXrpc(
  nsid: string,
  input: { params?: XrpcParams; body?: unknown },
  auth: XrpcAuthContext | null,
): Promise<unknown> {
  const entry = XRPC_REGISTRY.get(nsid);
  if (!entry) {
    throw new InvalidInputError(`Unknown method: ${nsid}`);
  }

  if (entry.auth === "required" && !auth) {
    throw new AuthRequiredError("Authentication required");
  }

  const params = serializeParams(input.params);
  const db = await getXrpcDbContext();

  // A couple of handlers read the raw URL for repeated query params, so give
  // them a request that actually reflects this call.
  const url = new URL(`/xrpc/${nsid}`, getPublicUrl());
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const ctx: XrpcRequestContext = {
    request: new Request(url, {
      method: entry.method === "procedure" ? "POST" : "GET",
    }),
    auth,
    db: db.db,
    schema: db.schema,
    trackReadingEnabled: db.trackReadingEnabled,
    countOldPostsAsUnreadEnabled: db.countOldPostsAsUnreadEnabled,
    excludeWebBridgeEnabled: db.excludeWebBridgeEnabled,
    params,
    body: input.body ?? null,
  };

  return entry.handler(ctx);
}

/** Invoke a query method with typed-ish params. */
export function query(
  nsid: string,
  params: XrpcParams,
  auth: XrpcAuthContext | null,
): Promise<unknown> {
  return invokeXrpc(nsid, { params }, auth);
}

/** Invoke a procedure method with a JSON body. */
export function procedure(
  nsid: string,
  body: Record<string, unknown>,
  auth: XrpcAuthContext | null,
): Promise<unknown> {
  return invokeXrpc(nsid, { body }, auth);
}

/** Narrow a `{ active: boolean }` status response. */
export function activeOf(result: unknown): boolean {
  return Boolean((result as { active?: boolean } | null)?.active);
}
