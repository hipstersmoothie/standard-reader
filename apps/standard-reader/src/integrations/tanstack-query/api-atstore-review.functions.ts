import { ok } from "@atcute/client";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { hasAtstoreReviewScope } from "#/integrations/auth/scope";
import { auth } from "#/integrations/tanstack-query/api-auth.functions";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

const STANDARD_READER_ATSTORE_LISTING_URI =
  "at://did:plc:f4os2wz5fjl56xpwcvtnqu7m/fyi.atstore.listing.detail/3mpjb3fty62nt";

const reviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().max(8000).optional(),
});

const reviewCompletionSearchSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  text: z.string().max(8000).optional(),
  returnTo: z.string().optional(),
});

function fallbackDisplayName(args: {
  name: string | null | undefined;
  handle: string | null | undefined;
  did: string;
}): string {
  const trimmedName = args.name?.trim();
  if (trimmedName) return trimmedName;
  const trimmedHandle = args.handle?.trim();
  if (trimmedHandle) return trimmedHandle;
  return args.did;
}

const submitReview = createServerFn({ method: "POST" })
  .validator(reviewInputSchema)
  .handler(async ({ data }) => {
    const request = getRequest();
    const [{ getAtprotoSessionForRequest }, { db }, schema] = await Promise.all(
      [
        import("#/middleware/auth-session.server"),
        import("#/db/index.server"),
        import("#/db/schema"),
      ],
    );

    const session = await getAtprotoSessionForRequest(request);
    if (!session) {
      throw new Error("Sign in to leave a review.");
    }

    const account = await db.query.account.findFirst({
      where: and(
        eq(schema.account.userId, session.session.user.id),
        eq(schema.account.providerId, "atproto"),
      ),
      columns: { providerId: true, scope: true },
    });
    if (!hasAtstoreReviewScope(account?.scope ?? null)) {
      throw new Error("ATStore reviewer permissions are required.");
    }

    const profileRecord = await session.client.get(
      "com.atproto.repo.getRecord",
      {
        params: {
          repo: session.did,
          collection: "fyi.atstore.profile",
          rkey: "self",
        } as never,
      },
    );

    if (!profileRecord.ok) {
      await ok(
        session.client.post("com.atproto.repo.createRecord", {
          input: {
            repo: session.did,
            collection: "fyi.atstore.profile",
            rkey: "self",
            record: {
              $type: "fyi.atstore.profile",
              displayName: fallbackDisplayName({
                name: session.session.user.name,
                handle: null,
                did: session.did,
              }),
            },
          } as never,
        }),
      );
    }

    const text = data.text?.trim();
    const res = await ok(
      session.client.post("com.atproto.repo.createRecord", {
        input: {
          repo: session.did,
          collection: "fyi.atstore.listing.review",
          record: {
            $type: "fyi.atstore.listing.review",
            subject: STANDARD_READER_ATSTORE_LISTING_URI,
            rating: data.rating,
            createdAt: new Date().toISOString(),
            ...(text ? { text } : {}),
          },
        } as never,
      }),
    );

    return {
      uri: res.uri,
      cid: res.cid,
    };
  });

const completeReviewFromSearch = createServerFn({ method: "POST" })
  .validator(reviewCompletionSearchSchema)
  .handler(async ({ data }) => {
    const returnTo = data.returnTo || "/";
    if (data.rating === undefined) {
      return { returnTo, created: false };
    }

    await submitReview({
      data: {
        rating: data.rating,
        ...(data.text?.trim() ? { text: data.text } : {}),
      },
    });

    return { returnTo, created: true };
  });

export const atstoreReviewApi = {
  buildReviewCompletionPath(args: {
    rating: number;
    text?: string | undefined;
    returnTo: string;
  }): string {
    return buildAuthRedirectPath("/review/thanks", {
      rating: args.rating,
      ...(args.text?.trim() ? { text: args.text.trim() } : {}),
      returnTo: args.returnTo,
    });
  },
  submitReview,
  completeReviewFromSearch,
  requestReviewPermissions: auth.upgradeToAtstoreReview,
};
