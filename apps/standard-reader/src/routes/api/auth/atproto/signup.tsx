import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { auth } from "#/integrations/tanstack-query/api-auth.functions";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/api/auth/atproto/signup")({
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const result = await auth.signup({
      data: {
        redirect: search.redirect,
      },
    });

    throw redirect({
      href: result.authorizationUrl,
    });
  },
});
