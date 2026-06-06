import { createFileRoute, redirect } from "@tanstack/react-router";
import { auth } from "#/integrations/tanstack-query/api-auth.functions";
import { z } from "zod";

const searchSchema = z.object({
  redirect: z.string().optional(),
  handle: z.string().optional(),
});

export const Route = createFileRoute("/api/auth/atproto/authorize")({
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const handleParam = search.handle;

    if (!handleParam) {
      throw redirect({
        to: "/login",
      });
    }

    const result = await auth.authorize({
      data: {
        handle: handleParam,
        redirect: search.redirect,
      },
    });

    throw redirect({
      href: result.authorizationUrl,
    });
  },
});
