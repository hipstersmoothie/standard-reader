/**
 * Authentication middleware for TanStack Start routes / server functions.
 * DB and OAuth session restore are loaded dynamically so this module stays
 * client-safe.
 */

import { Client } from "@atcute/client";
import { isDid } from "@atcute/lexicons/syntax";
import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";
import {
  DEFAULT_AUTH_REDIRECT,
  sanitizeAuthRedirectTarget,
} from "#/utils/auth-redirect";
import { eq } from "drizzle-orm";

export type AtprotoSessionContext = {
  did: string;
  atprotoSession: unknown;
  client: Client;
  session: {
    user: {
      id: string;
      name: string;
      email: string | null;
      did: string | null;
      image: string | null;
      isAdmin: boolean;
    };
  };
};

function readSessionTokenCookie(
  cookieHeader: string | null,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split("; ")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const name = pair.slice(0, eqIdx);
    if (name === AUTH_SESSION_TOKEN_COOKIE) {
      return pair.slice(eqIdx + 1);
    }
  }
  return undefined;
}

/**
 * Session + ATProto `Client` when the request carries a valid app session
 * token AND the user's stored OAuth session is still restorable.
 *
 * The DID is derived from the authenticated `user` row — never from a
 * client-controlled cookie — so a request can only act as the user that the
 * (opaque, server-issued) session token belongs to.
 */
export async function getAtprotoSessionForRequest(
  request: Request,
): Promise<AtprotoSessionContext | undefined> {
  const sessionToken = readSessionTokenCookie(request.headers.get("cookie"));
  if (!sessionToken) {
    return;
  }

  const [{ db }, schema, { restoreAtprotoSession }] = await Promise.all([
    import("#/db/index.server"),
    import("#/db/schema"),
    import("#/integrations/auth/atproto"),
  ]);

  const sessionRow = await db.query.session.findFirst({
    where: eq(schema.session.token, sessionToken),
    with: { user: true },
  });

  if (!sessionRow || sessionRow.expiresAt.getTime() <= Date.now()) {
    return;
  }

  const userRow = sessionRow.user;
  const did = userRow?.did;
  if (!did || !isDid(did)) {
    return;
  }

  const atprotoSession = await restoreAtprotoSession(did);
  if (!atprotoSession) {
    return;
  }

  const client = new Client({ handler: atprotoSession });

  return { did, atprotoSession, client, session: { user: userRow } };
}

async function getSessionContext(request: Request) {
  return getAtprotoSessionForRequest(request);
}

/** Route middleware: redirect authenticated users away (e.g. from `/login`). */
export const unauthMiddleware = createMiddleware().server(async ({ next }) => {
  const request = getRequest();
  const context = await getSessionContext(request);

  if (context) {
    const requestUrl = new URL(request.url);
    const redirectTarget = sanitizeAuthRedirectTarget(
      requestUrl.searchParams.get("redirect") ?? undefined,
      request.url,
    );
    if (redirectTarget !== DEFAULT_AUTH_REDIRECT) {
      throw redirect({ href: redirectTarget });
    }
    throw redirect({ to: "/" });
  }

  return await next();
});

/** Server function middleware: attach session when present. */
export const maybeAuthMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const request = getRequest();
  const context = await getSessionContext(request);
  return await next({ context });
});

/** Server functions: require a signed-in reader (exposes the DID + client). */
export const requireAuthMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const request = getRequest();
  const ctx = await getAtprotoSessionForRequest(request);
  if (!ctx) {
    throw new Error("Unauthorized");
  }
  return await next({ context: { authSession: ctx } });
});
