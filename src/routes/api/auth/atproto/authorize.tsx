import { createFileRoute, redirect } from "@tanstack/react-router";
import { auth } from "#/integrations/tanstack-query/api-auth.functions";
import { z } from "zod";

const searchSchema = z.object({
  redirect: z.string().optional(),
  handle: z.string().optional(),
  did: z.string().optional(),
  intent: z.enum(["subscribe", "collections"]).optional(),
});

export const Route = createFileRoute("/api/auth/atproto/authorize")({
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const handleParam = search.handle;

    if (!handleParam) {
      throw redirect({
        to: "/login",
        ...(search.redirect ? { search: { redirect: search.redirect } } : {}),
      });
    }

    const result = await auth.authorize({
      data: {
        handle: handleParam,
        redirect: search.redirect,
        intent: search.intent,
        did: search.did,
      },
    });

    throw redirect({
      href: result.authorizationUrl,
    });
  },
});
