import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";
import {
  approveAuthorization,
  checkAuthorizationRequest,
  denyAuthorization,
  listGrantsForUser,
} from "#/server/mcp/oauth/authorize";
import { revokeGrantForUser } from "#/server/mcp/oauth/tokens";

/**
 * Search params of `/mcp/authorize`, named exactly as OAuth specifies them so
 * the URL a client builds works verbatim.
 */
export const mcpAuthorizeSearchSchema = z.object({
  response_type: z.string().optional(),
  client_id: z.string().optional(),
  redirect_uri: z.string().optional(),
  scope: z.string().optional(),
  state: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
  resource: z.string().optional(),
});

export type McpAuthorizeSearch = z.infer<typeof mcpAuthorizeSearchSchema>;

/** What the consent screen needs to render. */
export type McpAuthorizeView =
  | {
      status: "ok";
      clientName: string;
      clientUri: string | null;
      scopes: Array<string>;
      reader: { did: string; handle: string; name: string };
    }
  | { status: "error"; code: string; message: string }
  | { status: "redirect"; url: string };

const checkAuthorization = createServerFn({ method: "GET" })
  .validator(mcpAuthorizeSearchSchema)
  .handler(async ({ data }): Promise<McpAuthorizeView> => {
    const session = await getAtprotoSessionForRequest(getRequest());
    if (!session?.session.user.did) {
      return {
        status: "error",
        code: "login_required",
        message: "Sign in to Standard Reader to approve this connection.",
      };
    }

    const check = await checkAuthorizationRequest(data);
    if (!check.ok) {
      return check.kind === "redirect"
        ? { status: "redirect", url: check.url }
        : { status: "error", code: check.code, message: check.message };
    }

    return {
      status: "ok",
      clientName: check.request.clientName,
      clientUri: check.request.clientUri,
      scopes: check.request.scope.split(/\s+/).filter(Boolean),
      reader: {
        did: session.session.user.did,
        handle: session.session.user.name,
        name: session.session.user.name,
      },
    };
  });

/**
 * Approve the request and mint a code.
 *
 * The parameters are re-validated here rather than trusting anything the
 * consent screen posts back — the browser is not a trusted carrier for the
 * client id, redirect URI or PKCE challenge.
 */
const approve = createServerFn({ method: "POST" })
  .validator(mcpAuthorizeSearchSchema)
  .handler(async ({ data }): Promise<{ url: string }> => {
    const session = await getAtprotoSessionForRequest(getRequest());
    const did = session?.session.user.did;
    if (!session || !did) {
      throw new Error("Sign in to Standard Reader to approve this connection.");
    }

    const check = await checkAuthorizationRequest(data);
    if (!check.ok) {
      if (check.kind === "redirect") return { url: check.url };
      throw new Error(check.message);
    }

    return {
      url: await approveAuthorization({
        request: check.request,
        userId: session.session.user.id,
        did,
      }),
    };
  });

const deny = createServerFn({ method: "POST" })
  .validator(mcpAuthorizeSearchSchema)
  .handler(async ({ data }): Promise<{ url: string | null }> => {
    const check = await checkAuthorizationRequest(data);
    if (!check.ok) {
      return { url: check.kind === "redirect" ? check.url : null };
    }
    return { url: denyAuthorization(check.request) };
  });

/** Connected MCP clients, for settings. */
const listConnections = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getAtprotoSessionForRequest(getRequest());
  if (!session) return { connections: [] };
  return { connections: await listGrantsForUser(session.session.user.id) };
});

const revokeConnection = createServerFn({ method: "POST" })
  .validator(z.object({ grantId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await getAtprotoSessionForRequest(getRequest());
    if (!session) throw new Error("Not signed in.");
    await revokeGrantForUser({
      grantId: data.grantId,
      userId: session.session.user.id,
    });
    return { revoked: true };
  });

// ── React Query options (for the UI) ────────────────────────────────────────

function listConnectionsQueryOptions() {
  return queryOptions({
    queryKey: ["reader", "mcpConnections"] as const,
    queryFn: async () => listConnections(),
    staleTime: 60_000,
  });
}

function revokeConnectionMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "revokeMcpConnection"] as const,
    mutationFn: async (grantId: string) =>
      revokeConnection({ data: { grantId } }),
  });
}

export const mcpApi = {
  checkAuthorization,
  approve,
  deny,
  listConnections,
  listConnectionsQueryOptions,
  revokeConnection,
  revokeConnectionMutationOptions,
};
