import type { ActorIdentifier } from "@atcute/lexicons";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  atprotoOAuth,
  atprotoReviewOAuth,
  revokeAtprotoSession,
} from "#/integrations/auth/atproto";
import type { AuthScopeIntent } from "#/integrations/auth/scope";
import {
  ATSTORE_REVIEW_SCOPE,
  formatOAuthScope,
  hasCollectionsScope,
  hasEmailScope,
  hasMarginScope,
  hasSembleScope,
  hasUserinputFeedbackScope,
  resolveAuthScopeForUser,
} from "#/integrations/auth/scope";
import { sanitizeAuthRedirectTarget } from "#/utils/auth-redirect";
import { getSavedHandles } from "#/utils/saved-handles";

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

/**
 * Mirror of {@link shouldRequestCollectionsScope} for the userinput.app feedback
 * scope tier. Returns `true` when the reader has either opted in
 * (`user.userinputFeedbackEnabled`) or already granted the scope on their PDS
 * (`account.scope` includes `repo?collection=app.userinput.discussion`). This
 * is what makes the feedback grant sticky: every sign-in silently re-requests
 * the scope once it's been granted once, so the user never sees the consent
 * screen twice.
 */
async function shouldRequestUserinputScope(args: {
  did?: string | undefined;
  handle: string;
}): Promise<boolean> {
  const [{ db }, schema] = await Promise.all([
    import("#/db/index.server"),
    import("#/db/schema"),
  ]);

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
    columns: { userinputFeedbackEnabled: true },
    with: {
      accounts: {
        columns: { scope: true, providerId: true },
        where: eq(schema.account.providerId, "atproto"),
      },
    },
  });
  if (!row) return false;
  if (row.userinputFeedbackEnabled === true) return true;
  const atprotoAccount = row.accounts.find((a) => a.providerId === "atproto");
  return hasUserinputFeedbackScope(atprotoAccount?.scope ?? null);
}

/**
 * Mirror of {@link shouldRequestUserinputScope} for the Margin save scope
 * tier. Returns `true` when the reader has either opted in
 * (`user.marginSaveEnabled`) or already granted the scope on their PDS.
 */
async function shouldRequestMarginScope(args: {
  did?: string | undefined;
  handle: string;
}): Promise<boolean> {
  const [{ db }, schema] = await Promise.all([
    import("#/db/index.server"),
    import("#/db/schema"),
  ]);

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
    columns: { marginSaveEnabled: true },
    with: {
      accounts: {
        columns: { scope: true, providerId: true },
        where: eq(schema.account.providerId, "atproto"),
      },
    },
  });
  if (!row) return false;
  if (row.marginSaveEnabled === true) return true;
  const atprotoAccount = row.accounts.find((a) => a.providerId === "atproto");
  return hasMarginScope(atprotoAccount?.scope ?? null);
}

/**
 * Mirror of {@link shouldRequestUserinputScope} for the Semble/Cosmik save
 * scope tier. Returns `true` when the reader has either opted in
 * (`user.sembleSaveEnabled`) or already granted the scope on their PDS.
 */
async function shouldRequestSembleScope(args: {
  did?: string | undefined;
  handle: string;
}): Promise<boolean> {
  const [{ db }, schema] = await Promise.all([
    import("#/db/index.server"),
    import("#/db/schema"),
  ]);

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
    columns: { sembleSaveEnabled: true },
    with: {
      accounts: {
        columns: { scope: true, providerId: true },
        where: eq(schema.account.providerId, "atproto"),
      },
    },
  });
  if (!row) return false;
  if (row.sembleSaveEnabled === true) return true;
  const atprotoAccount = row.accounts.find((a) => a.providerId === "atproto");
  return hasSembleScope(atprotoAccount?.scope ?? null);
}

/**
 * Mirror of {@link shouldRequestSembleScope} for the account-email read scope
 * (`transition:email`). Returns `true` when the reader has either opted into
 * the weekly digest (`user.weeklyDigestEnabled`) or already granted the email
 * scope on their PDS (`account.scope` includes `transition:email`). This keeps
 * the grant sticky so `user.email` is refreshed from `getSession` on every
 * subsequent login without re-prompting.
 */
async function shouldRequestEmailScope(args: {
  did?: string | undefined;
  handle: string;
}): Promise<boolean> {
  const [{ db }, schema] = await Promise.all([
    import("#/db/index.server"),
    import("#/db/schema"),
  ]);

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
    columns: { weeklyDigestEnabled: true },
    with: {
      accounts: {
        columns: { scope: true, providerId: true },
        where: eq(schema.account.providerId, "atproto"),
      },
    },
  });
  if (!row) return false;
  if (row.weeklyDigestEnabled === true) return true;
  const atprotoAccount = row.accounts.find((a) => a.providerId === "atproto");
  return hasEmailScope(atprotoAccount?.scope ?? null);
}

interface UpgradeScopeOverrides {
  collections?: boolean;
  userinput?: boolean;
  margin?: boolean;
  semble?: boolean;
  email?: boolean;
}

/**
 * Resolve the full OAuth scope for a progressive-upgrade re-authorize (the
 * revoke + re-auth every `upgradeTo*` fn performs). Reads *every* addendum
 * the reader has already opted into or already been granted on their PDS —
 * collections, userinput, Margin, Semble — and combines them, so upgrading
 * to one scope never silently drops another already-granted one. This is
 * the bug the individual `upgradeTo*` fns had before this helper existed:
 * each only preserved `collectionsAuthoringEnabled` and its own addendum,
 * dropping the others on every re-auth.
 *
 * `overrides` forces the flag the caller is granting right now to `true` —
 * the DB write that persists it happens immediately before this is called
 * (same request), so the row read here already reflects it in practice, but
 * the override makes that ordering explicit rather than implicit.
 */
async function resolveUpgradeScope(
  userId: string,
  overrides: UpgradeScopeOverrides = {},
): Promise<string> {
  const [{ db }, schema] = await Promise.all([
    import("#/db/index.server"),
    import("#/db/schema"),
  ]);
  const row = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: {
      collectionsAuthoringEnabled: true,
      userinputFeedbackEnabled: true,
      marginSaveEnabled: true,
      sembleSaveEnabled: true,
      weeklyDigestEnabled: true,
    },
    with: {
      accounts: {
        columns: { scope: true, providerId: true },
        where: eq(schema.account.providerId, "atproto"),
      },
    },
  });
  const grantedScope =
    row?.accounts.find((a) => a.providerId === "atproto")?.scope ?? null;

  const requestCollections =
    overrides.collections ??
    (row?.collectionsAuthoringEnabled === true ||
      hasCollectionsScope(grantedScope));
  const requestUserinput =
    overrides.userinput ??
    (row?.userinputFeedbackEnabled === true ||
      hasUserinputFeedbackScope(grantedScope));
  const requestMargin =
    overrides.margin ??
    (row?.marginSaveEnabled === true || hasMarginScope(grantedScope));
  const requestSemble =
    overrides.semble ??
    (row?.sembleSaveEnabled === true || hasSembleScope(grantedScope));
  const requestEmail =
    overrides.email ??
    (row?.weeklyDigestEnabled === true || hasEmailScope(grantedScope));

  return resolveAuthScopeForUser(
    {
      collectionsAuthoringEnabled: requestCollections,
      userinputFeedbackEnabled: requestUserinput,
      marginSaveEnabled: requestMargin,
      sembleSaveEnabled: requestSemble,
      weeklyDigestEnabled: requestEmail,
    },
    undefined,
    {
      userinput: requestUserinput,
      margin: requestMargin,
      semble: requestSemble,
      email: requestEmail,
    },
  );
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
    const [
      requestCollections,
      requestUserinput,
      requestMargin,
      requestSemble,
      requestEmail,
    ] = await Promise.all([
      shouldRequestCollectionsScope({ did: data.did, handle: data.handle }),
      shouldRequestUserinputScope({ did: data.did, handle: data.handle }),
      shouldRequestMarginScope({ did: data.did, handle: data.handle }),
      shouldRequestSembleScope({ did: data.did, handle: data.handle }),
      shouldRequestEmailScope({ did: data.did, handle: data.handle }),
    ]);
    const scope = resolveAuthScopeForUser(
      {
        collectionsAuthoringEnabled:
          scopeIntent === "collections" || requestCollections,
        userinputFeedbackEnabled: requestUserinput,
        marginSaveEnabled: requestMargin,
        sembleSaveEnabled: requestSemble,
        weeklyDigestEnabled: requestEmail,
      },
      scopeIntent,
      {
        userinput: requestUserinput,
        margin: requestMargin,
        semble: requestSemble,
        email: requestEmail,
      },
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

    // 3. Kick off a fresh authorize with the collections scope tier (plus
    // every other addendum the reader has already granted — see
    // `resolveUpgradeScope`). The handle isn't known here (the reader is
    // already signed in), so target the account by DID.
    const redirectTarget = sanitizeAuthRedirectTarget(
      data.redirect,
      request.url,
    );

    const { url } = await atprotoOAuth.authorize({
      target: {
        type: "account",
        identifier: reader.did as ActorIdentifier,
      },
      scope: await resolveUpgradeScope(reader.userId, { collections: true }),
      state: {
        redirect: redirectTarget,
      },
    });

    return { authorizationUrl: url.toString() };
  });

const upgradeToAtstoreReview = createServerFn({ method: "POST" })
  .validator(upgradeToCollectionsInputSchema)
  .handler(async ({ data }) => {
    const request = getRequest();
    const { getReaderContextForRequest } =
      await import("#/middleware/auth-session.server");

    const reader = await getReaderContextForRequest(request);
    if (!reader) {
      throw new Error("Unauthorized");
    }

    const upgradeScope = await resolveUpgradeScope(reader.userId);
    const baseScope = upgradeScope.split(" ");

    try {
      await revokeAtprotoSession(
        reader.did as Parameters<typeof revokeAtprotoSession>[0],
      );
    } catch (error) {
      console.warn(
        "Failed to revoke Atproto session during ATStore review upgrade:",
        error,
      );
    }

    const redirectTarget = sanitizeAuthRedirectTarget(
      data.redirect,
      request.url,
    );

    const { url } = await atprotoReviewOAuth.authorize({
      target: {
        type: "account",
        identifier: reader.did as ActorIdentifier,
      },
      scope: formatOAuthScope([
        ...new Set([...baseScope, ATSTORE_REVIEW_SCOPE]),
      ]),
      state: {
        redirect: redirectTarget,
      },
    });

    return { authorizationUrl: url.toString() };
  });

/**
 * Progressive scope upgrade: opt the signed-in reader into submitting
 * userinput.app feedback. Sets the `userinputFeedbackEnabled` flag (so future
 * logins silently include the expanded scope — see `shouldRequestUserinputScope`),
 * revokes the current OAuth session, and initiates a fresh authorize flow on
 * the *default* client (no separate OAuth client flavor) with the userinput
 * addendum, plus every other addendum the reader has already granted (see
 * `resolveUpgradeScope`). The client navigates to the returned URL; the
 * callback returns to `redirect`.
 *
 * Same revoke + re-auth shape as `upgradeToCollections` per
 * atproto.com/guides/oauth-patterns (BFF scope upgrades revoke + re-auth
 * because `prompt: consent` re-consent isn't reliable across PDS providers).
 * The user only sees the consent screen once: on every subsequent sign-in the
 * `authorize` fn silently re-appends the userinput scope via
 * `shouldRequestUserinputScope`.
 */
const upgradeToUserinputFeedback = createServerFn({ method: "POST" })
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

    // 1. Persist the opt-in flag — future authorize flows read this and
    //    silently re-request the userinput scope on every login.
    await db
      .update(schema.user)
      .set({ userinputFeedbackEnabled: true })
      .where(eq(schema.user.id, reader.userId));

    // 2. Revoke the current OAuth session so the next authorize grants the
    //    expanded scope. App session row cleanup happens on the callback that
    //    establishes the new session.
    try {
      await revokeAtprotoSession(
        reader.did as Parameters<typeof revokeAtprotoSession>[0],
      );
    } catch (error) {
      console.warn(
        "Failed to revoke Atproto session during userinput feedback upgrade:",
        error,
      );
    }

    // 3. Kick off a fresh authorize on the DEFAULT client with the userinput
    //    scope addendum, plus every other addendum the reader has already
    //    granted (see `resolveUpgradeScope`).
    const redirectTarget = sanitizeAuthRedirectTarget(
      data.redirect,
      request.url,
    );

    const { url } = await atprotoOAuth.authorize({
      target: {
        type: "account",
        identifier: reader.did as ActorIdentifier,
      },
      scope: await resolveUpgradeScope(reader.userId, { userinput: true }),
      state: {
        redirect: redirectTarget,
      },
    });

    return { authorizationUrl: url.toString() };
  });

/**
 * Progressive scope upgrade: opt the signed-in reader into saving articles to
 * their Margin collections. Sets the `marginSaveEnabled` flag (so future
 * logins silently include the expanded scope — see
 * `shouldRequestMarginScope`), revokes the current OAuth session, and
 * initiates a fresh authorize flow on the *default* client (no separate OAuth
 * client flavor) with the `MARGIN_FULL_SCOPE` addendum plus every other
 * addendum the reader has already granted (see `resolveUpgradeScope`).
 *
 * Same revoke + re-auth shape as `upgradeToUserinputFeedback` per
 * atproto.com/guides/oauth-patterns.
 */
const upgradeToMargin = createServerFn({ method: "POST" })
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

    await db
      .update(schema.user)
      .set({ marginSaveEnabled: true })
      .where(eq(schema.user.id, reader.userId));

    try {
      await revokeAtprotoSession(
        reader.did as Parameters<typeof revokeAtprotoSession>[0],
      );
    } catch (error) {
      console.warn(
        "Failed to revoke Atproto session during Margin save upgrade:",
        error,
      );
    }

    const redirectTarget = sanitizeAuthRedirectTarget(
      data.redirect,
      request.url,
    );

    const { url } = await atprotoOAuth.authorize({
      target: {
        type: "account",
        identifier: reader.did as ActorIdentifier,
      },
      scope: await resolveUpgradeScope(reader.userId, { margin: true }),
      state: {
        redirect: redirectTarget,
      },
    });

    return { authorizationUrl: url.toString() };
  });

/**
 * Progressive scope upgrade: opt the signed-in reader into saving articles to
 * their Semble collections. Mirrors {@link upgradeToMargin} for
 * `SEMBLE_FULL_SCOPE` / `user.sembleSaveEnabled`.
 */
const upgradeToSemble = createServerFn({ method: "POST" })
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

    await db
      .update(schema.user)
      .set({ sembleSaveEnabled: true })
      .where(eq(schema.user.id, reader.userId));

    try {
      await revokeAtprotoSession(
        reader.did as Parameters<typeof revokeAtprotoSession>[0],
      );
    } catch (error) {
      console.warn(
        "Failed to revoke Atproto session during Semble save upgrade:",
        error,
      );
    }

    const redirectTarget = sanitizeAuthRedirectTarget(
      data.redirect,
      request.url,
    );

    const { url } = await atprotoOAuth.authorize({
      target: {
        type: "account",
        identifier: reader.did as ActorIdentifier,
      },
      scope: await resolveUpgradeScope(reader.userId, { semble: true }),
      state: {
        redirect: redirectTarget,
      },
    });

    return { authorizationUrl: url.toString() };
  });

/**
 * Progressive scope upgrade: opt the signed-in reader into the weekly digest
 * email. Sets the `weeklyDigestEnabled` flag (so future logins silently
 * re-request `transition:email` — see `shouldRequestEmailScope` — keeping
 * `user.email` fresh), revokes the current OAuth session, and initiates a fresh
 * authorize flow on the *default* client with the email addendum plus every
 * other addendum the reader has already granted (see `resolveUpgradeScope`).
 *
 * Same revoke + re-auth shape as {@link upgradeToMargin} per
 * atproto.com/guides/oauth-patterns. The reader consents once; the email is
 * read from `com.atproto.server.getSession` on the callback and every
 * subsequent login (see `callback.server.ts`).
 */
const upgradeToWeeklyDigest = createServerFn({ method: "POST" })
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

    await db
      .update(schema.user)
      .set({ weeklyDigestEnabled: true })
      .where(eq(schema.user.id, reader.userId));

    try {
      await revokeAtprotoSession(
        reader.did as Parameters<typeof revokeAtprotoSession>[0],
      );
    } catch (error) {
      console.warn(
        "Failed to revoke Atproto session during weekly digest upgrade:",
        error,
      );
    }

    const redirectTarget = sanitizeAuthRedirectTarget(
      data.redirect,
      request.url,
    );

    const { url } = await atprotoOAuth.authorize({
      target: {
        type: "account",
        identifier: reader.did as ActorIdentifier,
      },
      scope: await resolveUpgradeScope(reader.userId, { email: true }),
      state: {
        redirect: redirectTarget,
      },
    });

    return { authorizationUrl: url.toString() };
  });

/**
 * Turn the weekly digest off for the signed-in reader: clears the
 * `weeklyDigestEnabled` flag so the send runner skips them. No re-auth — the
 * `transition:email` grant is harmless to keep, and dropping it would force an
 * unnecessary consent round-trip if they ever re-enable. Mirrors the one-click
 * unsubscribe route's effect (`src/routes/api/digest/unsubscribe.tsx`).
 */
const disableWeeklyDigest = createServerFn({ method: "POST" }).handler(
  async () => {
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

    await db
      .update(schema.user)
      .set({ weeklyDigestEnabled: false })
      .where(eq(schema.user.id, reader.userId));

    return { ok: true };
  },
);

export const auth = {
  authorize,
  signup,
  upgradeToCollections,
  upgradeToAtstoreReview,
  upgradeToUserinputFeedback,
  upgradeToMargin,
  upgradeToSemble,
  upgradeToWeeklyDigest,
  disableWeeklyDigest,
  getSavedHandles: getSavedHandlesServer,
  getSavedHandlesQueryOptions,
};
