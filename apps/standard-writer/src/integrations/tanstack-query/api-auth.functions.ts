import type { ActorIdentifier } from "@atcute/lexicons";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import type { WriterSession } from "#/middleware/auth-session.server";
import { sanitizeAuthRedirectTarget } from "#/utils/auth-redirect";
import { getSavedHandles } from "#/utils/saved-handles";
import type { SavedHandle } from "#/utils/saved-handles";

/** Start the OAuth flow for a handle; returns the PDS authorization URL. */
const authorize = createServerFn({ method: "GET" })
  .validator(
    z.object({ handle: z.string().min(1), redirect: z.string().optional() }),
  )
  .handler(async ({ data }): Promise<{ authorizationUrl: string }> => {
    const request = getRequest();
    const handle = data.handle.replace(/^@/, "").trim() as ActorIdentifier;
    const redirectTarget = sanitizeAuthRedirectTarget(
      data.redirect,
      request.url,
    );

    const { atprotoOAuth } = await import("#/integrations/auth/atproto");
    const { authoringScope } = await import("#/integrations/auth/scope");

    const { url } = await atprotoOAuth.authorize({
      target: { type: "account", identifier: handle },
      scope: authoringScope.join(" "),
      state: { redirect: redirectTarget, handle },
    });

    return { authorizationUrl: url.toString() };
  });

/** The signed-in writer, or `null` for guests. */
const getSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<WriterSession | null> => {
    const { getWriterSession } =
      await import("#/middleware/auth-session.server");
    return getWriterSession(getRequest());
  },
);

/** Clear the app session (and revoke the PDS session) — sign out. */
const logout = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: boolean }> => {
    const request = getRequest();
    const { getWriterSession } =
      await import("#/middleware/auth-session.server");
    const { AUTH_SESSION_TOKEN_COOKIE } =
      await import("#/integrations/auth/constants");
    const { db } = await import("#/db/index.server");
    const schema = await import("#/db/schema");
    const { eq } = await import("drizzle-orm");

    const session = await getWriterSession(request);

    const cookieHeader = request.headers.get("cookie") ?? "";
    const token = cookieHeader
      .split("; ")
      .find((pair) => pair.startsWith(`${AUTH_SESSION_TOKEN_COOKIE}=`))
      ?.split("=")[1];
    if (token) {
      await db.delete(schema.session).where(eq(schema.session.token, token));
    }
    if (session?.did) {
      const { revokeAtprotoSession } =
        await import("#/integrations/auth/atproto");
      await revokeAtprotoSession(session.did as never);
    }

    setCookie(AUTH_SESSION_TOKEN_COOKIE, "", { path: "/", maxAge: 0 });
    return { ok: true };
  },
);

/** Handles the browser has signed in with before (from a client cookie). */
const getSavedHandlesServer = createServerFn({ method: "GET" }).handler(
  (): Array<SavedHandle> => getSavedHandles(getRequest().headers.get("cookie")),
);

export const auth = {
  authorize,
  getSession,
  logout,
  getSavedHandles: getSavedHandlesServer,
};

export const sessionQueryOptions = queryOptions({
  queryKey: ["writer-session"],
  queryFn: () => getSession(),
});

export const savedHandlesQueryOptions = queryOptions({
  queryKey: ["saved-handles"],
  queryFn: () => getSavedHandlesServer(),
});
