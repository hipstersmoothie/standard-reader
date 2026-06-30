import type { ActorIdentifier } from "@atcute/lexicons";
import type { AuthScopeIntent } from "#/integrations/auth/scope";

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  atprotoOAuth,
  revokeAtprotoSession,
} from "#/integrations/auth/atproto";
import {
  hasCollectionsScope,
  resolveAuthScopeForUser,
} from "#/integrations/auth/scope";
import { sanitizeAuthRedirectTarget } from "#/utils/auth-redirect";
import { getSavedHandles } from "#/utils/saved-handles";
import { eq } from "drizzle-orm";
import { z } from "zod";

const authorizeInputSchema = z.object({
  handle: z.string().min(1, "Handle is required"),
  redirect: z.string().optional(),
  intent: z.enum(["subscribe", "collections"]).optional(),
  /** DID of the selected actor (from the handle autocomplete). When present
   * and the user has signed in before, the upgrade flag is read from their
   * `user` row so an existing collections author gets the collections scope
   * tier automatically. */
  did: z.string().optional(),
});

/**
 * Resolve whether a returning reader should be requested the collections
 * authoring scope tier on re-login. Two signals are consulted:
 *
 * 1. `user.collectionsAuthoringEnabled` — the opt-in flag, set when the reader
 *    went through the upgrade flow. Persists the upgrade so subsequent logins
 *    request the collections tier automatically.
 * 2. `account.scope` (granted scope, snapshotted on the last OAuth callback) —
 *    if the reader has *already granted* the collections tier on their PDS,
 *    we request it again on re-login so the grant is preserved rather than
 *    silently downgraded to basic.
 *
 * The reader is identified by `did` when known (threaded from the handle
 * autocomplete result). When `did` is absent — e.g. the saved-handles flow on
 * `/login`, which only stores `handle` — we resolve the DID from the indexed
 * `profiles.handle` column first. Best-effort: returns `false` when the reader
 * can't be identified (first sign-in, handle not yet indexed).
 */
async function shouldRequestCollectionsScope(args: {
  did?: string | undefined;
  handle: string;
}): Promise<boolean> {
  const [{ db }, schema] = await Promise.all([
    import("#/db/index.server"),
    import("#/db/schema"),
  ]);

  // Resolve the DID: prefer the explicit one, fall back to a profiles lookup
  // by handle (indexed). Normalise the handle the same way `authorize` does.
  let did = args.did;
  if (!did) {
    const normalizedHandle = args.handle.replace(/^@/, "").trim();
    const profile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.handle, normalizedHandle),
      columns: { did: true },
    });
    did = profile?.did;
  }
  if (!did) return false;

  const row = await db.query.user.findFirst({
    where: eq(schema.user.did, did),
    columns: { collectionsAuthoringEnabled: true },
    with: {
      accounts: {
        columns: { scope: true, providerId: true },
        where: eq(schema.account.providerId, "atproto"),
      },
    },
  });
  if (!row) return false;
  if (row.collectionsAuthoringEnabled === true) return true;
  const atprotoAccount = row.accounts.find((a) => a.providerId === "atproto");
  return hasCollectionsScope(atprotoAccount?.scope ?? null);
}

const authorize = createServerFn({ method: "GET" })
  .validator(authorizeInputSchema)
  .handler(async ({ data }) => {
    const request = getRequest();
    const handle = data.handle.replace(/^@/, "").trim() as ActorIdentifier;
    const redirectTarget = sanitizeAuthRedirectTarget(
      data.redirect,
      request.url,
    );

    const scopeIntent: AuthScopeIntent =
      data.intent === "subscribe"
        ? "subscribe"
        : data.intent === "collections"
          ? "collections"
          : "basic";

    // Best-effort upgrade: if the user signed in before and either opted into
    // collections authoring (flag set) or has already granted the collections
    // tier on their PDS (`account.scope`), request the collections tier
    // automatically — even on a fresh sign-in from /login. Falls back to basic
    // when the reader can't be identified (first sign-in) or neither signal is
    // present. The DID is resolved from the handle when not threaded in.
    const requestCollections = await shouldRequestCollectionsScope({
      did: data.did,
      handle: data.handle,
    });
    const scope =
      scopeIntent === "collections" || requestCollections
        ? resolveAuthScopeForUser(
            { collectionsAuthoringEnabled: true },
            scopeIntent,
          )
        : resolveAuthScopeForUser(
            { collectionsAuthoringEnabled: false },
            scopeIntent,
          );

    const { url } = await atprotoOAuth.authorize({
      target: {
        type: "account",
        identifier: handle,
      },
      scope,
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
  .validator(signupInputSchema)
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

const upgradeToCollectionsInputSchema = z.object({
  redirect: z.string().optional(),
});

/**
 * Progressive scope upgrade: opt the signed-in reader into collections
 * authoring. Sets the `collectionsAuthoringEnabled` flag (so future logins
 * silently include the expanded scope), revokes the current OAuth session,
 * and initiates a fresh authorize flow with the collections scope tier. The
 * client navigates to the returned URL; the callback returns to `redirect`.
 *
 * Per atproto.com/guides/oauth-patterns: BFF scope upgrades revoke + re-auth
 * because `prompt: consent` re-consent isn't reliable across PDS providers.
 * The flag persists the upgrade so subsequent authorize requests automatically
 * request the collections tier.
 */
const upgradeToCollections = createServerFn({ method: "POST" })
  .validator(upgradeToCollectionsInputSchema)
  .handler(async ({ data }) => {
    const request = getRequest();
    const [{ db }, schema, { getReaderContextForRequest }] = await Promise.all([
      import("#/db/index.server"),
      import("#/db/schema"),
      import("#/middleware/auth-session.server"),
    ]);

    const reader = await getReaderContextForRequest(request);
    if (!reader) {
      throw new Error("Unauthorized");
    }

    // 1. Persist the upgrade flag — future authorize flows read this.
    await db
      .update(schema.user)
      .set({ collectionsAuthoringEnabled: true })
      .where(eq(schema.user.id, reader.userId));

    // 2. Revoke the current OAuth session so the next authorize grants the
    // expanded scopes. App session row cleanup happens on the callback that
    // establishes the new session.
    try {
      await revokeAtprotoSession(
        reader.did as Parameters<typeof revokeAtprotoSession>[0],
      );
    } catch (error) {
      console.warn("Failed to revoke Atproto session during upgrade:", error);
    }

    // 3. Kick off a fresh authorize with the collections scope tier. The
    // handle isn't known here (the reader is already signed in), so target
    // the account by DID.
    const redirectTarget = sanitizeAuthRedirectTarget(
      data.redirect,
      request.url,
    );

    const { url } = await atprotoOAuth.authorize({
      target: {
        type: "account",
        identifier: reader.did as ActorIdentifier,
      },
      scope: resolveAuthScopeForUser(
        { collectionsAuthoringEnabled: true },
        "collections",
      ),
      state: {
        redirect: redirectTarget,
      },
    });

    return { authorizationUrl: url.toString() };
  });

export const auth = {
  authorize,
  signup,
  upgradeToCollections,
  getSavedHandles: getSavedHandlesServer,
  getSavedHandlesQueryOptions,
};
