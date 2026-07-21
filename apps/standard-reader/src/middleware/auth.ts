/**
 * Client-safe auth middleware for TanStack Start routes / server functions.
 * Session restore lives in `auth-session.server.ts` and is loaded dynamically
 * inside `.server()` callbacks only.
 */

import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import {
  DEFAULT_AUTH_REDIRECT,
  sanitizeAuthRedirectTarget,
} from "#/utils/auth-redirect";

export type { AtprotoSessionContext } from "./auth-session.server";

/** Route middleware: redirect authenticated users away (e.g. from `/login`). */
export const unauthMiddleware = createMiddleware().server(async ({ next }) => {
  const request = getRequest();
  const { getAtprotoSessionForRequest } =
    await import("#/middleware/auth-session.server");
  const context = await getAtprotoSessionForRequest(request);

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
  const { getAtprotoSessionForRequest } =
    await import("#/middleware/auth-session.server");
  const context = await getAtprotoSessionForRequest(getRequest());
  const { labelRequestSpanIdentity } =
    await import("#/server/observability/span-context");
  labelRequestSpanIdentity(context?.did ?? null);
  return await next({ context });
});

/** Server functions: require a signed-in reader (exposes the DID + client). */
export const requireAuthMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const { getAtprotoSessionForRequest } =
    await import("#/middleware/auth-session.server");
  const ctx = await getAtprotoSessionForRequest(getRequest());
  if (!ctx) {
    throw new Error("Unauthorized");
  }
  const { labelRequestSpanIdentity } =
    await import("#/server/observability/span-context");
  labelRequestSpanIdentity(ctx.did);
  return await next({ context: { authSession: ctx } });
});
