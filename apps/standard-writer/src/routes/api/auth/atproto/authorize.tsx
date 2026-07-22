import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { auth } from "#/integrations/tanstack-query/api-auth.functions";

export const Route = createFileRoute("/api/auth/atproto/authorize")({
  validateSearch: z.object({
    handle: z.string().optional(),
    redirect: z.string().optional(),
  }),
  beforeLoad: async ({ search }) => {
    if (!search.handle) {
      throw redirect({
        to: "/login",
        ...(search.redirect ? { search: { redirect: search.redirect } } : {}),
      });
    }
    const { authorizationUrl } = await auth.authorize({
      data: { handle: search.handle, redirect: search.redirect },
    });
    throw redirect({ href: authorizationUrl });
  },
});
