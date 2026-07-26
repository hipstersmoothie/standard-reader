import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getReaderDidForRequest } from "#/middleware/auth-session.server";
import {
  approveAuthorization,
  checkAuthorizationRequest,
  denyAuthorization,
  listGrantsForUser,
} from "#/server/mcp/oauth/authorize";
import { revokeGrantForUser } from "#/server/mcp/oauth/tokens";

/**
 * One OAuth query parameter.
 *
 * Every value is a string on the wire, but TanStack Router's default search
 * parsing runs each one through `JSON.parse` first — so a parameter that
 * happens to *contain* JSON arrives as an object. Raycast sends
 * `state={"flavor":"release","id":"…"}`, which parsed to an object and made a
 * `z.string()` schema reject the whole request with a Zod dump in the reader's
 * face. Coerce back to a string instead, and never throw: this is a protocol
 * endpoint, so a malformed parameter has to come back as an OAuth error we can
 * redirect with, not a validation crash.
 */
function toParamString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/**
 * One OAuth query parameter, always a string by the time anything reads it.
 *
 * The value survives the router's round trip byte-for-byte even though it looks
 * like it shouldn't: the router parses `{"a":1}` to an object, we stringify it
 * back, the router then re-encodes that as a quoted JSON string and redirects
 * once to canonicalize the URL — and on the way back in, parsing that quoted
 * form yields the original string again. Ugly in the address bar, exact where
 * it matters, which is the `state` we hand back to the client.
 */
const oauthParam = z.preprocess(toParamString, z.string().optional());

/**
 * Search params of `/mcp/authorize`, named exactly as OAuth specifies them so
 * the URL a client builds works verbatim.
 */
export const mcpAuthorizeSearchSchema = z.object({
  response_type: oauthParam,
  client_id: oauthParam,
  redirect_uri: oauthParam,
  scope: oauthParam,
  state: oauthParam,
  code_challenge: oauthParam,
  code_challenge_method: oauthParam,
  resource: oauthParam,
});

export type McpAuthorizeSearch = z.infer<typeof mcpAuthorizeSearchSchema>;

/**
 * The signed-in reader, for the consent flow.
 *
 * Deliberately the DID-only session path plus a `user` row read, rather than
 * `getAtprotoSessionForRequest`: approving a connection mints an authorization
 * code in our own database and never touches the reader's repo, so restoring
 * their AT Protocol client would be a round trip to their PDS for nothing — and
 * would turn a slow or briefly unreachable PDS into "sign in to continue" for a
 * reader who is plainly signed in.
 */
async function readerForConsent() {
  const did = await getReaderDidForRequest(getRequest());
  if (!did) return null;

  const [{ db }, schema] = await Promise.all([
    import("#/db/index.server"),
    import("#/db/schema"),
  ]);

  const [user, profile] = await Promise.all([
    db.query.user.findFirst({
      where: eq(schema.user.did, did),
      columns: { id: true, name: true, image: true },
    }),
    db.query.profiles.findFirst({
      where: eq(schema.profiles.did, did),
      columns: { handle: true },
    }),
  ]);
  if (!user) return null;

  return {
    did,
    userId: user.id,
    // The handle identifies the account to the reader; `user.name` is a display
    // name and can be anything (or absent), so it is only the fallback.
    handle: profile?.handle ?? user.name,
    name: user.name,
    avatar: user.image,
  };
}

/** What the consent screen needs to render. */
export type McpAuthorizeView =
  | {
      status: "ok";
      clientName: string;
      clientUri: string | null;
      /**
       * Host the authorization code will actually be delivered to. Unlike
       * `clientName`, which is free text the client chose at registration, this
       * comes from a redirect URI that was registered up front and is
       * exact-matched at approval time — so it is the one fact on this screen a
       * reader can genuinely check.
       */
      redirectHost: string;
      scopes: Array<string>;
      reader: {
        did: string;
        handle: string;
        name: string;
        avatar: string | null;
      };
    }
  | { status: "error"; code: string; message: string }
  | { status: "redirect"; url: string };

/**
 * How to name the place the authorization code will be delivered.
 *
 * For a web client that is the host. For a native client registered under a
 * custom scheme (`raycast://oauth?package_name=…`) the host segment is
 * arbitrary — "oauth" tells a reader nothing — so name the scheme, which is
 * what actually identifies the app that will receive the code.
 */
function destinationLabel(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.host;
    }
    return `${parsed.protocol}//`;
  } catch {
    return url;
  }
}

const checkAuthorization = createServerFn({ method: "GET" })
  .validator(mcpAuthorizeSearchSchema)
  .handler(async ({ data }): Promise<McpAuthorizeView> => {
    const reader = await readerForConsent();
    if (!reader) {
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
      redirectHost: destinationLabel(check.request.redirectUri),
      scopes: check.request.scope.split(/\s+/).filter(Boolean),
      reader: {
        did: reader.did,
        handle: reader.handle,
        name: reader.name,
        avatar: reader.avatar,
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
    const reader = await readerForConsent();
    if (!reader) {
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
        userId: reader.userId,
        did: reader.did,
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
  const reader = await readerForConsent();
  if (!reader) return { connections: [] };
  return { connections: await listGrantsForUser(reader.userId) };
});

const revokeConnection = createServerFn({ method: "POST" })
  .validator(z.object({ grantId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const reader = await readerForConsent();
    if (!reader) throw new Error("Not signed in.");
    await revokeGrantForUser({
      grantId: data.grantId,
      userId: reader.userId,
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
