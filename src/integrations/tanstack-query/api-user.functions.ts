import type { Did } from "@atcute/lexicons";
import type { ThemeMode } from "#/lib/theme";

import { isDid } from "@atcute/lexicons/syntax";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { revokeAtprotoSession } from "#/integrations/auth/atproto";
import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";
import {
  HOME_SCOPE_COOKIE,
  HOME_SCOPE_COOKIE_MAX_AGE_SECONDS,
  dbValueToHomeScope,
  homeScopeToCookieValue,
  homeScopeToDbValue,
  parseHomeScope,
} from "#/lib/home-scope";
import {
  OPEN_COLLECTIONS_IN_MAGAZINE_COOKIE,
  OPEN_COLLECTIONS_IN_MAGAZINE_COOKIE_MAX_AGE_SECONDS,
  dbValueToOpenCollectionsInMagazine,
  openCollectionsInMagazineToCookieValue,
  openCollectionsInMagazineToDbValue,
  parseOpenCollectionsInMagazineCookie,
} from "#/lib/open-collections-in-magazine";
import {
  OPEN_LINKS_COOKIE,
  OPEN_LINKS_COOKIE_MAX_AGE_SECONDS,
  dbValueToOpenLinksExternally,
  openLinksExternallyToCookieValue,
  openLinksExternallyToDbValue,
  parseOpenLinksExternally,
} from "#/lib/open-links";
import {
  READER_VOICE_COOKIE,
  READER_VOICE_COOKIE_MAX_AGE_SECONDS,
  READER_VOICE_PREFERENCES,
  dbValueToReaderVoicePreference,
  parseReaderVoicePreference,
  readerVoicePreferenceToDbValue,
} from "#/lib/reader-voice";
import {
  READING_TYPOGRAPHY_COOKIE,
  READING_TYPOGRAPHY_COOKIE_MAX_AGE_SECONDS,
  dbValueToReadingTypography,
  isReadingTypographyPreference,
  normalizeReadingTypographyPreference,
  parseReadingTypographyCookie,
  readingTypographyToCookieValue,
  readingTypographyToDbValue,
} from "#/lib/reading-typography";
import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE_SECONDS,
  THEME_MODES,
  dbValueToThemeMode,
  parseThemeMode,
  themeModeToDbValue,
} from "#/lib/theme";
import {
  TRACK_READING_HISTORY_COOKIE,
  TRACK_READING_HISTORY_COOKIE_MAX_AGE_SECONDS,
  dbValueToTrackReadingHistory,
  parseTrackReadingHistoryCookie,
  trackReadingHistoryToCookieValue,
  trackReadingHistoryToDbValue,
} from "#/lib/track-reading-history";
import { maybeAuthMiddleware } from "#/middleware/auth";
import { resolveIdentity } from "#/server/atproto/identity";
import { observe } from "#/server/observability/log";
import { loadShellSnapshot } from "#/server/reader/shell-snapshot.server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { HomeScope } from "./api-feed.functions";

import { dbMiddleware } from "./db-middleware";

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookiePairs = cookieHeader.split("; ").map((c) => {
    const [key, ...valueParts] = c.split("=");
    return [key ?? "", valueParts.join("=")] as [string, string];
  });
  return Object.fromEntries(cookiePairs) as Record<string, string>;
}

async function loadSessionFromToken(sessionToken: string) {
  const [{ db }, schema] = await Promise.all([
    import("#/db/index.server"),
    import("#/db/schema"),
  ]);
  const sessionRow = await db.query.session.findFirst({
    where: eq(schema.session.token, sessionToken),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
          did: true,
          image: true,
          isAdmin: true,
          createdAt: true,
          updatedAt: true,
          themeMode: true,
          trackReadingHistory: true,
          homeScope: true,
          readerVoice: true,
          openLinksExternally: true,
          openCollectionsInMagazine: true,
          readingTypography: true,
          collectionsAuthoringEnabled: true,
        },
      },
    },
  });

  if (!sessionRow || sessionRow.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const userRow = sessionRow.user;
  if (!userRow?.did || !isDid(userRow.did)) {
    return null;
  }

  const { restoreAuthenticatedClient } =
    await import("#/integrations/auth/restore-client.server");
  const [client, profileRow, identity] = await Promise.all([
    restoreAuthenticatedClient(userRow.did),
    db.query.profiles.findFirst({
      where: eq(schema.profiles.did, userRow.did),
      columns: { handle: true },
    }),
    resolveIdentity(userRow.did),
  ]);
  if (!client) {
    return null;
  }

  // Handle comes from our indexed profile, falling back to the (cached) PLC
  // identity. The Bluesky AppView profile call that used to seed this was
  // redundant here — its display name/avatar are only needed at login — and an
  // uncached round-trip to public.api.bsky.app on every session restore.
  const handle = profileRow?.handle ?? identity.handle ?? null;

  return {
    user: {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      did: userRow.did,
      image: userRow.image,
      isAdmin: userRow.isAdmin,
      createdAt: userRow.createdAt,
      updatedAt: userRow.updatedAt,
      handle,
    },
    session: {
      id: sessionRow.id,
      userId: userRow.id,
      expiresAt: sessionRow.expiresAt,
    },
    themeMode: userRow.themeMode,
    trackReadingHistory: userRow.trackReadingHistory,
    homeScope: userRow.homeScope,
    readerVoice: userRow.readerVoice,
    openLinksExternally: userRow.openLinksExternally,
    openCollectionsInMagazine: userRow.openCollectionsInMagazine,
    readingTypography: userRow.readingTypography,
    collectionsAuthoringEnabled: userRow.collectionsAuthoringEnabled,
    client,
  };
}

/** One round trip for root shell SSR: session, prefs, and signed-in shell data. */
const getShellBootstrap = createServerFn({ method: "GET" }).handler(
  observe("user.getShellBootstrap", async (_args, span) => {
    const request = getRequest();
    const cookies = parseCookies(request.headers.get("cookie"));
    const sessionToken = cookies[AUTH_SESSION_TOKEN_COOKIE];

    const guestBootstrap = {
      session: null,
      theme: { mode: parseThemeMode(cookies[THEME_COOKIE]) },
      trackReading: {
        enabled: parseTrackReadingHistoryCookie(
          cookies[TRACK_READING_HISTORY_COOKIE],
        ),
      },
      homeScope: {
        scope: parseHomeScope(cookies[HOME_SCOPE_COOKIE]),
      },
      readerVoice: {
        preference: parseReaderVoicePreference(cookies[READER_VOICE_COOKIE]),
      },
      openLinks: {
        openExternally: parseOpenLinksExternally(cookies[OPEN_LINKS_COOKIE]),
      },
      openCollectionsInMagazine: {
        openInMagazine: parseOpenCollectionsInMagazineCookie(
          cookies[OPEN_COLLECTIONS_IN_MAGAZINE_COOKIE],
        ),
      },
      readingTypography: {
        preference: parseReadingTypographyCookie(
          cookies[READING_TYPOGRAPHY_COOKIE],
        ),
      },
      collectionsAuthoring: { enabled: false },
      shell: null,
    };

    if (!sessionToken) {
      span.set("result", "guest");
      return guestBootstrap;
    }

    // Phase 1: DB session lookup (fast — one query to Neon for session + user
    // prefs). This gives us the DID, trackReading, and all preferences before
    // the expensive PDS client restore.
    const [{ db }, schema] = await Promise.all([
      import("#/db/index.server"),
      import("#/db/schema"),
    ]);
    const sessionRow = await db.query.session.findFirst({
      where: eq(schema.session.token, sessionToken),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            did: true,
            image: true,
            isAdmin: true,
            createdAt: true,
            updatedAt: true,
            themeMode: true,
            trackReadingHistory: true,
            homeScope: true,
            readerVoice: true,
            openLinksExternally: true,
            openCollectionsInMagazine: true,
            readingTypography: true,
            collectionsAuthoringEnabled: true,
          },
        },
      },
    });

    if (!sessionRow || sessionRow.expiresAt.getTime() <= Date.now()) {
      span.set("result", "guest");
      return guestBootstrap;
    }

    const userRow = sessionRow.user;
    if (!userRow?.did || !isDid(userRow.did)) {
      span.set("result", "guest");
      return guestBootstrap;
    }

    span.set("did", userRow.did);
    const trackReading = dbValueToTrackReadingHistory(
      userRow.trackReadingHistory,
    );

    // Phase 2: shell snapshot (DB-only, no PDS I/O) runs in parallel with a
    // lightweight profile handle lookup. The PDS client restore and PLC
    // identity resolution are NOT needed here — the bootstrap only returns
    // serializable data (prefs, sidebar, lists), and the client is never
    // passed to the browser. The `getAtprotoSessionForRequest` per-request
    // cache handles client restore lazily for server fns that actually need it.
    const [profileRow, shell] = await Promise.all([
      db.query.profiles.findFirst({
        where: eq(schema.profiles.did, userRow.did),
        columns: { handle: true },
      }),
      loadShellSnapshot(db, schema, {
        did: userRow.did,
        trackReading,
      }),
    ]);

    const handle = profileRow?.handle ?? null;
    span.set("result", "signedIn");

    return {
      session: {
        user: {
          id: userRow.id,
          name: userRow.name,
          email: userRow.email,
          did: userRow.did,
          image: userRow.image,
          isAdmin: userRow.isAdmin,
          createdAt: userRow.createdAt,
          updatedAt: userRow.updatedAt,
          handle,
        },
        session: {
          id: sessionRow.id,
          userId: userRow.id,
          expiresAt: sessionRow.expiresAt,
        },
        collectionsAuthoringEnabled: userRow.collectionsAuthoringEnabled,
      },
      theme: { mode: dbValueToThemeMode(userRow.themeMode) },
      trackReading: { enabled: trackReading },
      homeScope: { scope: dbValueToHomeScope(userRow.homeScope) },
      readerVoice: {
        preference: dbValueToReaderVoicePreference(userRow.readerVoice),
      },
      openLinks: {
        openExternally: dbValueToOpenLinksExternally(
          userRow.openLinksExternally,
        ),
      },
      openCollectionsInMagazine: {
        openInMagazine: dbValueToOpenCollectionsInMagazine(
          userRow.openCollectionsInMagazine,
        ),
      },
      readingTypography: {
        preference: dbValueToReadingTypography(userRow.readingTypography),
      },
      collectionsAuthoring: {
        enabled: userRow.collectionsAuthoringEnabled === true,
      },
      shell,
    };
  }),
);

const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const cookies = parseCookies(request.headers.get("cookie"));
  const sessionToken = cookies[AUTH_SESSION_TOKEN_COOKIE];

  if (!sessionToken) {
    return null;
  }

  const loaded = await loadSessionFromToken(sessionToken);
  if (!loaded) {
    return null;
  }

  return {
    user: loaded.user,
    session: loaded.session,
    collectionsAuthoringEnabled: loaded.collectionsAuthoringEnabled,
  };
});

const getSessionQueryOptions = queryOptions({
  queryKey: ["session"],
  queryFn: async () => {
    return await getSession();
  },
  // Root beforeLoad seeds this from getShellBootstrap(), which has its own
  // 5-minute staleTime. Without this, ensureQueryData refetches on every nav
  // (staleTime defaults to 0), firing a getSession() server fn that restores
  // the PDS client + does a PLC identity lookup — ~1-4s per navigation.
  staleTime: 5 * 60_000,
});

/** Scopes read-personalized query caches to the signed-in reader (or guest). */
export function readerQueryScope(
  session: { user?: { did?: string | null } | null } | null | undefined,
): string {
  return session?.user?.did ?? "guest";
}

const getThemePreference = createServerFn({ method: "GET" })
  .middleware([maybeAuthMiddleware])
  .handler(async ({ context }): Promise<{ mode: ThemeMode }> => {
    const session = context?.session;
    if (session?.user) {
      const [{ db }, schema] = await Promise.all([
        import("#/db/index.server"),
        import("#/db/schema"),
      ]);
      const row = await db.query.user.findFirst({
        where: eq(schema.user.id, session.user.id),
        columns: { themeMode: true },
      });
      return { mode: dbValueToThemeMode(row?.themeMode ?? null) };
    }

    return { mode: parseThemeMode(getCookie(THEME_COOKIE)) };
  });

const getThemePreferenceQueryOptions = queryOptions({
  queryKey: ["themePreference"] as const,
  queryFn: () => getThemePreference(),
  staleTime: Number.POSITIVE_INFINITY,
});

const setThemePreference = createServerFn({ method: "POST" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .inputValidator(z.object({ mode: z.enum(THEME_MODES) }))
  .handler(async ({ data, context }): Promise<{ mode: ThemeMode }> => {
    setCookie(THEME_COOKIE, data.mode, {
      path: "/",
      sameSite: "lax",
      maxAge: THEME_COOKIE_MAX_AGE_SECONDS,
    });

    if (context?.session?.user) {
      await context.db
        .update(context.schema.user)
        .set({ themeMode: themeModeToDbValue(data.mode) })
        .where(eq(context.schema.user.id, context.session.user.id));
    }

    return { mode: data.mode };
  });

const getReaderVoicePreference = createServerFn({ method: "GET" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .handler(async ({ context }) => {
    const session = context?.session;
    if (session?.user) {
      const row = await context.db.query.user.findFirst({
        where: eq(context.schema.user.id, session.user.id),
        columns: { readerVoice: true },
      });
      return {
        preference: dbValueToReaderVoicePreference(row?.readerVoice ?? null),
      };
    }

    return {
      preference: parseReaderVoicePreference(getCookie(READER_VOICE_COOKIE)),
    };
  });

const getReaderVoicePreferenceQueryOptions = queryOptions({
  queryKey: ["readerVoicePreference"] as const,
  queryFn: () => getReaderVoicePreference(),
  staleTime: Number.POSITIVE_INFINITY,
});

const setReaderVoicePreference = createServerFn({ method: "POST" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .inputValidator(z.object({ preference: z.enum(READER_VOICE_PREFERENCES) }))
  .handler(async ({ data, context }) => {
    setCookie(READER_VOICE_COOKIE, data.preference, {
      path: "/",
      sameSite: "lax",
      maxAge: READER_VOICE_COOKIE_MAX_AGE_SECONDS,
    });

    if (context?.session?.user) {
      await context.db
        .update(context.schema.user)
        .set({
          readerVoice: readerVoicePreferenceToDbValue(data.preference),
        })
        .where(eq(context.schema.user.id, context.session.user.id));
    }

    return { preference: data.preference };
  });

const getOpenLinksPreference = createServerFn({ method: "GET" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .handler(async ({ context }): Promise<{ openExternally: boolean }> => {
    const session = context?.session;
    if (session?.user) {
      const row = await context.db.query.user.findFirst({
        where: eq(context.schema.user.id, session.user.id),
        columns: { openLinksExternally: true },
      });
      return {
        openExternally: dbValueToOpenLinksExternally(
          row?.openLinksExternally ?? null,
        ),
      };
    }

    return {
      openExternally: parseOpenLinksExternally(getCookie(OPEN_LINKS_COOKIE)),
    };
  });

const getOpenLinksPreferenceQueryOptions = queryOptions({
  queryKey: ["openLinksPreference"] as const,
  queryFn: () => getOpenLinksPreference(),
  staleTime: Number.POSITIVE_INFINITY,
});

const setOpenLinksPreference = createServerFn({ method: "POST" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .inputValidator(z.object({ openExternally: z.boolean() }))
  .handler(async ({ data, context }): Promise<{ openExternally: boolean }> => {
    setCookie(
      OPEN_LINKS_COOKIE,
      openLinksExternallyToCookieValue(data.openExternally),
      {
        path: "/",
        sameSite: "lax",
        maxAge: OPEN_LINKS_COOKIE_MAX_AGE_SECONDS,
      },
    );

    if (context?.session?.user) {
      await context.db
        .update(context.schema.user)
        .set({
          openLinksExternally: openLinksExternallyToDbValue(
            data.openExternally,
          ),
        })
        .where(eq(context.schema.user.id, context.session.user.id));
    }

    return { openExternally: data.openExternally };
  });

const getOpenCollectionsInMagazinePreference = createServerFn({ method: "GET" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .handler(async ({ context }): Promise<{ openInMagazine: boolean }> => {
    const session = context?.session;
    if (session?.user) {
      const row = await context.db.query.user.findFirst({
        where: eq(context.schema.user.id, session.user.id),
        columns: { openCollectionsInMagazine: true },
      });
      return {
        openInMagazine: dbValueToOpenCollectionsInMagazine(
          row?.openCollectionsInMagazine ?? null,
        ),
      };
    }

    return {
      openInMagazine: parseOpenCollectionsInMagazineCookie(
        getCookie(OPEN_COLLECTIONS_IN_MAGAZINE_COOKIE),
      ),
    };
  });

const getOpenCollectionsInMagazinePreferenceQueryOptions = queryOptions({
  queryKey: ["openCollectionsInMagazinePreference"] as const,
  queryFn: () => getOpenCollectionsInMagazinePreference(),
  staleTime: Number.POSITIVE_INFINITY,
});

const setOpenCollectionsInMagazinePreference = createServerFn({
  method: "POST",
})
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .inputValidator(z.object({ openInMagazine: z.boolean() }))
  .handler(async ({ data, context }): Promise<{ openInMagazine: boolean }> => {
    setCookie(
      OPEN_COLLECTIONS_IN_MAGAZINE_COOKIE,
      openCollectionsInMagazineToCookieValue(data.openInMagazine),
      {
        path: "/",
        sameSite: "lax",
        maxAge: OPEN_COLLECTIONS_IN_MAGAZINE_COOKIE_MAX_AGE_SECONDS,
      },
    );

    if (context?.session?.user) {
      await context.db
        .update(context.schema.user)
        .set({
          openCollectionsInMagazine: openCollectionsInMagazineToDbValue(
            data.openInMagazine,
          ),
        })
        .where(eq(context.schema.user.id, context.session.user.id));
    }

    return { openInMagazine: data.openInMagazine };
  });

const readingTypographyInput = z.object({
  preference: z.object({
    fontSize: z.enum(["small", "default", "large"]),
    measure: z.enum(["narrow", "default", "wide"]),
    bodyFont: z.enum(["serif", "sans", "custom"]),
    customFontFamily: z.string().min(1).max(80).optional(),
  }),
});

const getReadingTypographyPreference = createServerFn({ method: "GET" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .handler(async ({ context }) => {
    const session = context?.session;
    if (session?.user) {
      const row = await context.db.query.user.findFirst({
        where: eq(context.schema.user.id, session.user.id),
        columns: { readingTypography: true },
      });
      return {
        preference: dbValueToReadingTypography(row?.readingTypography ?? null),
      };
    }

    return {
      preference: parseReadingTypographyCookie(
        getCookie(READING_TYPOGRAPHY_COOKIE),
      ),
    };
  });

const getReadingTypographyPreferenceQueryOptions = queryOptions({
  queryKey: ["readingTypographyPreference"] as const,
  queryFn: () => getReadingTypographyPreference(),
  staleTime: Number.POSITIVE_INFINITY,
});

const setReadingTypographyPreference = createServerFn({ method: "POST" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .inputValidator(readingTypographyInput)
  .handler(async ({ data, context }) => {
    if (!isReadingTypographyPreference(data.preference)) {
      throw new Error("Invalid reading typography preference");
    }

    const preference = normalizeReadingTypographyPreference(data.preference);

    setCookie(
      READING_TYPOGRAPHY_COOKIE,
      readingTypographyToCookieValue(preference),
      {
        path: "/",
        sameSite: "lax",
        maxAge: READING_TYPOGRAPHY_COOKIE_MAX_AGE_SECONDS,
      },
    );

    if (context?.session?.user) {
      await context.db
        .update(context.schema.user)
        .set({
          readingTypography: readingTypographyToDbValue(preference),
        })
        .where(eq(context.schema.user.id, context.session.user.id));
    }

    return { preference };
  });

const getTrackReadingHistoryPreference = createServerFn({ method: "GET" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .handler(async ({ context }): Promise<{ enabled: boolean }> => {
    const session = context?.session;
    if (session?.user) {
      return {
        enabled: dbValueToTrackReadingHistory(
          session.user.trackReadingHistory ?? null,
        ),
      };
    }

    return {
      enabled: parseTrackReadingHistoryCookie(
        getCookie(TRACK_READING_HISTORY_COOKIE),
      ),
    };
  });

const getTrackReadingHistoryPreferenceQueryOptions = queryOptions({
  queryKey: ["trackReadingHistoryPreference"] as const,
  queryFn: () => getTrackReadingHistoryPreference(),
  staleTime: Number.POSITIVE_INFINITY,
});

const setTrackReadingHistoryPreference = createServerFn({ method: "POST" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .inputValidator(z.object({ enabled: z.boolean() }))
  .handler(async ({ data, context }): Promise<{ enabled: boolean }> => {
    setCookie(
      TRACK_READING_HISTORY_COOKIE,
      trackReadingHistoryToCookieValue(data.enabled),
      {
        path: "/",
        sameSite: "lax",
        maxAge: TRACK_READING_HISTORY_COOKIE_MAX_AGE_SECONDS,
      },
    );

    if (context?.session?.user) {
      await context.db
        .update(context.schema.user)
        .set({
          trackReadingHistory: trackReadingHistoryToDbValue(data.enabled),
        })
        .where(eq(context.schema.user.id, context.session.user.id));
    }

    return { enabled: data.enabled };
  });

const homeScopeInput = z.object({
  scope: z.enum(["follows", "network"]),
});

const getHomeScopePreference = createServerFn({ method: "GET" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .handler(async ({ context }): Promise<{ scope: HomeScope }> => {
    const session = context?.session;
    if (session?.user) {
      return { scope: dbValueToHomeScope(session.user.homeScope ?? null) };
    }

    return { scope: parseHomeScope(getCookie(HOME_SCOPE_COOKIE)) };
  });

const getHomeScopePreferenceQueryOptions = queryOptions({
  queryKey: ["homeScopePreference"] as const,
  queryFn: () => getHomeScopePreference(),
  staleTime: Number.POSITIVE_INFINITY,
});

const setHomeScopePreference = createServerFn({ method: "POST" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .inputValidator(homeScopeInput)
  .handler(async ({ data, context }): Promise<{ scope: HomeScope }> => {
    setCookie(HOME_SCOPE_COOKIE, homeScopeToCookieValue(data.scope), {
      path: "/",
      sameSite: "lax",
      maxAge: HOME_SCOPE_COOKIE_MAX_AGE_SECONDS,
    });

    if (context?.session?.user) {
      await context.db
        .update(context.schema.user)
        .set({ homeScope: homeScopeToDbValue(data.scope) })
        .where(eq(context.schema.user.id, context.session.user.id));
    }

    return { scope: data.scope };
  });

const signOut = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .handler(async ({ context }) => {
    const request = getRequest();
    const cookies = parseCookies(request.headers.get("cookie"));
    const sessionToken = cookies[AUTH_SESSION_TOKEN_COOKIE];

    if (sessionToken) {
      const db = context.db;
      const schema = context.schema;
      const sessionRow = await db.query.session.findFirst({
        where: eq(schema.session.token, sessionToken),
        with: { user: { columns: { did: true } } },
      });

      if (sessionRow) {
        await db
          .delete(schema.session)
          .where(eq(schema.session.id, sessionRow.id));

        const did = sessionRow.user?.did;
        if (did && isDid(did)) {
          try {
            await revokeAtprotoSession(did as Did);
          } catch (error) {
            console.warn("Failed to revoke Atproto session:", error);
          }
        }
      }
    }

    setCookie(AUTH_SESSION_TOKEN_COOKIE, "", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 0,
    });

    return { success: true };
  });

export const user = {
  getShellBootstrap,
  getSession,
  getSessionQueryOptions,
  readerQueryScope,
  getThemePreference,
  getThemePreferenceQueryOptions,
  setThemePreference,
  getReaderVoicePreference,
  getReaderVoicePreferenceQueryOptions,
  setReaderVoicePreference,
  getOpenLinksPreference,
  getOpenLinksPreferenceQueryOptions,
  setOpenLinksPreference,
  getOpenCollectionsInMagazinePreference,
  getOpenCollectionsInMagazinePreferenceQueryOptions,
  setOpenCollectionsInMagazinePreference,
  getReadingTypographyPreference,
  getReadingTypographyPreferenceQueryOptions,
  setReadingTypographyPreference,
  getTrackReadingHistoryPreference,
  getTrackReadingHistoryPreferenceQueryOptions,
  setTrackReadingHistoryPreference,
  getHomeScopePreference,
  getHomeScopePreferenceQueryOptions,
  setHomeScopePreference,
  signOut,
};
