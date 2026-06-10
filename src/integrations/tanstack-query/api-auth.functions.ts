import type { ActorIdentifier } from "@atcute/lexicons";
import type { AuthScopeIntent } from "#/integrations/auth/scope";

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { atprotoOAuth } from "#/integrations/auth/atproto";
import { resolveAuthScope } from "#/integrations/auth/scope";
import { sanitizeAuthRedirectTarget } from "#/utils/auth-redirect";
import { getSavedHandles } from "#/utils/saved-handles";
import { z } from "zod";

const authorizeInputSchema = z.object({
  handle: z.string().min(1, "Handle is required"),
  redirect: z.string().optional(),
  intent: z.enum(["subscribe"]).optional(),
});

const authorize = createServerFn({ method: "GET" })
  .inputValidator(authorizeInputSchema)
  .handler(async ({ data }) => {
    const request = getRequest();
    const handle = data.handle.replace(/^@/, "").trim() as ActorIdentifier;
    const redirectTarget = sanitizeAuthRedirectTarget(
      data.redirect,
      request.url,
    );

    const scopeIntent: AuthScopeIntent =
      data.intent === "subscribe" ? "subscribe" : "full";

    const { url } = await atprotoOAuth.authorize({
      target: {
        type: "account",
        identifier: handle,
      },
      scope: resolveAuthScope(scopeIntent),
      state: {
        redirect: redirectTarget,
        handle,
      },
    });

    return { authorizationUrl: url.toString() };
  });

const signupInputSchema = z.object({
  redirect: z.string().optional(),
});

const signup = createServerFn({ method: "GET" })
  .inputValidator(signupInputSchema)
  .handler(async ({ data }) => {
    const request = getRequest();
    const redirectTarget = sanitizeAuthRedirectTarget(
      data.redirect,
      request.url,
    );

    const { url } = await atprotoOAuth.authorize({
      prompt: "create",
      target: {
        type: "pds",
        serviceUrl: "https://selfhosted.social/",
      },
      state: {
        redirect: redirectTarget,
      },
    });

    return { authorizationUrl: url.toString() };
  });

const getSavedHandlesServer = createServerFn({ method: "GET" }).handler(() => {
  const request = getRequest();
  const cookieHeader = request.headers.get("cookie");
  return getSavedHandles(cookieHeader);
});

const getSavedHandlesQueryOptions = queryOptions({
  queryKey: ["savedHandles"],
  queryFn: async () => {
    return await getSavedHandlesServer();
  },
});

export const auth = {
  authorize,
  signup,
  getSavedHandles: getSavedHandlesServer,
  getSavedHandlesQueryOptions,
};
