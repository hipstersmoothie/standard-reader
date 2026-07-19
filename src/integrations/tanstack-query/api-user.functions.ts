import type { Did } from "@atcute/lexicons";
import { isDid } from "@atcute/lexicons/syntax";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { revokeAtprotoSession } from "#/integrations/auth/atproto";
import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";
import { hasEmailScope } from "#/integrations/auth/scope";
import {
  COUNT_OLD_POSTS_AS_UNREAD_COOKIE,
  COUNT_OLD_POSTS_AS_UNREAD_COOKIE_MAX_AGE_SECONDS,
  countOldPostsAsUnreadToCookieValue,
  countOldPostsAsUnreadToDbValue,
  dbValueToCountOldPostsAsUnread,
  parseCountOldPostsAsUnreadCookie,
} from "#/lib/count-old-posts-as-unread";
import {
  DEFAULT_GUEST_HOME_SCOPE,
  HOME_SCOPE_COOKIE,
  HOME_SCOPE_COOKIE_MAX_AGE_SECONDS,
  dbValueToHomeScope,
  homeScopeToCookieValue,
  homeScopeToDbValue,
  parseHomeScope,
} from "#/lib/home-scope";
import type { Locale } from "#/lib/locale";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_HINT_SEEN_COOKIE,
  LOCALE_HINT_SEEN_COOKIE_MAX_AGE_SECONDS,
  LOCALES,
  DEFAULT_LOCALE,
  dbValueToLocale,
  isLocale,
  negotiateLocale,
} from "#/lib/locale";
import {
  ONBOARDING_COMPLETED_COOKIE,
  ONBOARDING_COMPLETED_COOKIE_MAX_AGE_SECONDS,
  dbValueToOnboardingCompleted,
  onboardingCompletedToCookieValue,
} from "#/lib/onboarding";
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
import type { HideableTabId } from "#/lib/profile-tabs";
import {
  hiddenTabsToDbValue,
  hideableTabIdSchema,
  parseHiddenTabs,
} from "#/lib/profile-tabs";
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
import type { ThemeMode } from "#/lib/theme";
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
          locale: true,
          trackReadingHistory: true,
          homeScope: true,
          readerVoice: true,
          openLinksExternally: true,
          openCollectionsInMagazine: true,
          readingTypography: true,
          collectionsAuthoringEnabled: true,
          atstoreReviewPromptDismissed: true,
          userinputFeedbackEnabled: true,
          onboardingCompleted: true,
        },
        with: {
          accounts: {
            columns: { scope: true, providerId: true },
            where: eq(schema.account.providerId, "atproto"),
          },
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

  // Granted OAuth scope snapshotted on the callback (`account.scope`). The
  // UI gates collections authoring on this — it's the source of truth for
  // "the reader has actually accepted the collections tier" (the
  // `collectionsAuthoringEnabled` flag is set optimistically before re-auth).
  const atprotoAccount = userRow.accounts.find(
    (a) => a.providerId === "atproto",
  );
  const grantedScope = atprotoAccount?.scope ?? null;

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
    atstoreReviewPromptDismissed: userRow.atstoreReviewPromptDismissed,
    userinputFeedbackEnabled: userRow.userinputFeedbackEnabled,
    onboardingCompleted: dbValueToOnboardingCompleted(
      userRow.onboardingCompleted,
    ),
    grantedScope,
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
      // Guests have no stored pref, so fall back to Accept-Language rather
      // than English — this is what makes `<html lang>` correct on first paint.
      locale: {
        locale: isLocale(cookies[LOCALE_COOKIE])
          ? cookies[LOCALE_COOKIE]
          : (negotiateLocale(request.headers.get("accept-language")) ??
            DEFAULT_LOCALE),
      },
      // Drives the one-time language indicator: show it only when the guest has
      // never explicitly picked a language (no cookie) and hasn't seen the hint.
      localeHint: {
        seen: cookies[LOCALE_HINT_SEEN_COOKIE] === "1",
        explicit: isLocale(cookies[LOCALE_COOKIE]),
      },
      trackReading: {
        enabled: parseTrackReadingHistoryCookie(
          cookies[TRACK_READING_HISTORY_COOKIE],
        ),
      },
      homeScope: {
        scope: parseHomeScope(
          cookies[HOME_SCOPE_COOKIE],
          DEFAULT_GUEST_HOME_SCOPE,
        ),
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
            locale: true,
            localeHintSeen: true,
            trackReadingHistory: true,
            countOldPostsAsUnread: true,
            homeScope: true,
            readerVoice: true,
            openLinksExternally: true,
            openCollectionsInMagazine: true,
            readingTypography: true,
            collectionsAuthoringEnabled: true,
            atstoreReviewPromptDismissed: true,
            userinputFeedbackEnabled: true,
            onboardingCompleted: true,
          },
          with: {
            accounts: {
              columns: { scope: true, providerId: true },
              where: eq(schema.account.providerId, "atproto"),
            },
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
    const countOldPostsAsUnread = dbValueToCountOldPostsAsUnread(
      userRow.countOldPostsAsUnread ?? null,
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
        countOldPostsAsUnread,
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
        atstoreReviewPromptDismissed:
          (
            userRow as typeof userRow & {
              atstoreReviewPromptDismissed?: boolean | null;
            }
          ).atstoreReviewPromptDismissed === true,
        userinputFeedbackEnabled:
          (
            userRow as typeof userRow & {
              userinputFeedbackEnabled?: boolean | null;
            }
          ).userinputFeedbackEnabled === true,
        onboardingCompleted:
          (
            userRow as typeof userRow & {
              onboardingCompleted?: boolean | null;
            }
          ).onboardingCompleted === true,
        // Granted OAuth scope snapshotted on the callback (`account.scope`).
        // The UI gates collections authoring on this — it's the source of truth
        // for "the reader has actually accepted the collections tier".
        grantedScope:
          userRow.accounts.find((a) => a.providerId === "atproto")?.scope ??
          null,
      },
      theme: { mode: dbValueToThemeMode(userRow.themeMode) },
      // `null` = never picked a language, so keep negotiating from the browser
      // instead of pinning the reader to English.
      locale: {
        locale: isLocale(userRow.locale)
          ? userRow.locale
          : (negotiateLocale(request.headers.get("accept-language")) ??
            DEFAULT_LOCALE),
      },
      // `locale === null` means the reader never explicitly picked a language,
      // so they're still eligible to see the one-time indicator (unless already
      // shown, tracked by `locale_hint_seen`).
      localeHint: {
        seen: userRow.localeHintSeen === true,
        explicit: isLocale(userRow.locale),
      },
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
    atstoreReviewPromptDismissed: loaded.atstoreReviewPromptDismissed === true,
    userinputFeedbackEnabled: loaded.userinputFeedbackEnabled === true,
    onboardingCompleted: loaded.onboardingCompleted === true,
    grantedScope: loaded.grantedScope,
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
  // Same reason: a window-focus refetch after the client has been idle can
  // legitimately fail the live PDS restore and briefly resolve to "no
  // session" even though the app session cookie is still valid, flashing the
  // signed-out UI before a follow-up fetch corrects it.
  refetchOnWindowFocus: false,
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
  .validator(z.object({ mode: z.enum(THEME_MODES) }))
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

/**
 * Resolve the reader's locale: DB -> cookie -> `Accept-Language` -> `en`.
 *
 * `user.locale = null` means "never picked one", so we keep negotiating from
 * the browser instead of pinning those readers to English.
 */
const getLocalePreference = createServerFn({ method: "GET" })
  .middleware([maybeAuthMiddleware])
  .handler(async ({ context }): Promise<{ locale: Locale }> => {
    const session = context?.session;
    if (session?.user) {
      const [{ db }, schema] = await Promise.all([
        import("#/db/index.server"),
        import("#/db/schema"),
      ]);
      const row = await db.query.user.findFirst({
        where: eq(schema.user.id, session.user.id),
        columns: { locale: true },
      });
      if (isLocale(row?.locale)) return { locale: dbValueToLocale(row.locale) };
    }

    const cookie = getCookie(LOCALE_COOKIE);
    if (isLocale(cookie)) return { locale: cookie };

    const header = getRequest().headers.get("accept-language");
    return { locale: negotiateLocale(header) ?? DEFAULT_LOCALE };
  });

const getLocalePreferenceQueryOptions = queryOptions({
  queryKey: ["localePreference"] as const,
  queryFn: () => getLocalePreference(),
  staleTime: Number.POSITIVE_INFINITY,
});

const setLocalePreference = createServerFn({ method: "POST" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .validator(z.object({ locale: z.enum(LOCALES) }))
  .handler(async ({ data, context }): Promise<{ locale: Locale }> => {
    setCookie(LOCALE_COOKIE, data.locale, {
      path: "/",
      sameSite: "lax",
      maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    });

    if (context?.session?.user) {
      await context.db
        .update(context.schema.user)
        // Stored verbatim (not null-for-default like themeMode): `null` means
        // "never picked", which keeps Accept-Language negotiation alive. An
        // explicit pick of `en` must stick.
        .set({ locale: data.locale })
        .where(eq(context.schema.user.id, context.session.user.id));
    }

    return { locale: data.locale };
  });

export interface LocaleHintState {
  /** The one-time language indicator has already been shown. */
  seen: boolean;
  /** The reader has explicitly chosen a language (so no auto-detection to
   * announce, and nothing to nudge them about). */
  explicit: boolean;
}

/**
 * State for the one-time language indicator: whether it's already been shown
 * (`seen`) and whether the reader has explicitly picked a language
 * (`explicit`). The indicator shows only when neither is true. Mirrors the
 * DB -> cookie resolution used elsewhere. Seeded by `getShellBootstrap`.
 */
const getLocaleHint = createServerFn({ method: "GET" })
  .middleware([maybeAuthMiddleware])
  .handler(async ({ context }): Promise<LocaleHintState> => {
    const session = context?.session;
    if (session?.user) {
      const [{ db }, schema] = await Promise.all([
        import("#/db/index.server"),
        import("#/db/schema"),
      ]);
      const row = await db.query.user.findFirst({
        where: eq(schema.user.id, session.user.id),
        columns: { locale: true, localeHintSeen: true },
      });
      return {
        seen: row?.localeHintSeen === true,
        explicit: isLocale(row?.locale),
      };
    }

    return {
      seen: getCookie(LOCALE_HINT_SEEN_COOKIE) === "1",
      explicit: isLocale(getCookie(LOCALE_COOKIE)),
    };
  });

const getLocaleHintQueryOptions = queryOptions({
  queryKey: ["localeHint"] as const,
  queryFn: () => getLocaleHint(),
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Record that the one-time language indicator has been shown so it never
 * appears again. Dual-writes the guest cookie (SSR/unauthenticated) and, when
 * signed in, `user.locale_hint_seen`. Mirrors `setOnboardingCompleted`.
 */
const dismissLocaleHint = createServerFn({ method: "POST" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .handler(async ({ context }): Promise<{ seen: true }> => {
    setCookie(LOCALE_HINT_SEEN_COOKIE, "1", {
      path: "/",
      sameSite: "lax",
      maxAge: LOCALE_HINT_SEEN_COOKIE_MAX_AGE_SECONDS,
    });

    if (context?.session?.user) {
      await context.db
        .update(context.schema.user)
        .set({ localeHintSeen: true })
        .where(eq(context.schema.user.id, context.session.user.id));
    }

    return { seen: true };
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
  .validator(z.object({ preference: z.enum(READER_VOICE_PREFERENCES) }))
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
  .validator(z.object({ openExternally: z.boolean() }))
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

const setProfileTabSettings = createServerFn({ method: "POST" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .validator(
    z.object({
      hiddenTabs: z.array(hideableTabIdSchema),
      showLikes: z.boolean(),
    }),
  )
  .handler(
    observe(
      "user.setProfileTabSettings",
      async (
        { data, context },
        span,
      ): Promise<{ hiddenTabs: Array<HideableTabId>; showLikes: boolean }> => {
        const session = context?.session;
        if (!session?.user) {
          throw new Error("Not authenticated");
        }

        const dbValue = hiddenTabsToDbValue(data.hiddenTabs);
        span.set("hiddenTabs", dbValue ?? "");
        span.set("showLikes", data.showLikes);
        await context.db
          .update(context.schema.user)
          .set({ profileHiddenTabs: dbValue, profileShowLikes: data.showLikes })
          .where(eq(context.schema.user.id, session.user.id));

        return {
          hiddenTabs: parseHiddenTabs(dbValue),
          showLikes: data.showLikes,
        };
      },
    ),
  );

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
  .validator(z.object({ openInMagazine: z.boolean() }))
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
  .validator(readingTypographyInput)
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
  .validator(z.object({ enabled: z.boolean() }))
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

const getCountOldPostsAsUnreadPreference = createServerFn({ method: "GET" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .handler(async ({ context }): Promise<{ enabled: boolean }> => {
    const session = context?.session;
    if (session?.user) {
      return {
        enabled: dbValueToCountOldPostsAsUnread(
          session.user.countOldPostsAsUnread ?? null,
        ),
      };
    }

    return {
      enabled: parseCountOldPostsAsUnreadCookie(
        getCookie(COUNT_OLD_POSTS_AS_UNREAD_COOKIE),
      ),
    };
  });

const getCountOldPostsAsUnreadPreferenceQueryOptions = queryOptions({
  queryKey: ["countOldPostsAsUnreadPreference"] as const,
  queryFn: () => getCountOldPostsAsUnreadPreference(),
  staleTime: Number.POSITIVE_INFINITY,
});

const setCountOldPostsAsUnreadPreference = createServerFn({ method: "POST" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .validator(z.object({ enabled: z.boolean() }))
  .handler(async ({ data, context }): Promise<{ enabled: boolean }> => {
    setCookie(
      COUNT_OLD_POSTS_AS_UNREAD_COOKIE,
      countOldPostsAsUnreadToCookieValue(data.enabled),
      {
        path: "/",
        sameSite: "lax",
        maxAge: COUNT_OLD_POSTS_AS_UNREAD_COOKIE_MAX_AGE_SECONDS,
      },
    );

    if (context?.session?.user) {
      await context.db
        .update(context.schema.user)
        .set({
          countOldPostsAsUnread: countOldPostsAsUnreadToDbValue(data.enabled),
        })
        .where(eq(context.schema.user.id, context.session.user.id));
    }

    return { enabled: data.enabled };
  });

const homeScopeInput = z.object({
  scope: z.enum(["follows", "trending"]),
});

const getHomeScopePreference = createServerFn({ method: "GET" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .handler(async ({ context }): Promise<{ scope: HomeScope }> => {
    const session = context?.session;
    if (session?.user) {
      return { scope: dbValueToHomeScope(session.user.homeScope ?? null) };
    }

    return {
      scope: parseHomeScope(
        getCookie(HOME_SCOPE_COOKIE),
        DEFAULT_GUEST_HOME_SCOPE,
      ),
    };
  });

const getHomeScopePreferenceQueryOptions = queryOptions({
  queryKey: ["homeScopePreference"] as const,
  queryFn: () => getHomeScopePreference(),
  staleTime: Number.POSITIVE_INFINITY,
});

const setHomeScopePreference = createServerFn({ method: "POST" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .validator(homeScopeInput)
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

const dismissAtstoreReviewPrompt = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .handler(async ({ context }) => {
    const { getReaderContextForRequest } =
      await import("#/middleware/auth-session.server");
    const reader = await getReaderContextForRequest(getRequest());
    if (!reader) {
      throw new Error("Unauthorized");
    }

    await context.db
      .update(context.schema.user)
      .set({ atstoreReviewPromptDismissed: true })
      .where(eq(context.schema.user.id, reader.userId));

    return { dismissed: true };
  });

/** Mark the first-run onboarding wizard as finished or dismissed. Dual-writes
 * the cookie (for guests / SSR) and, when signed in, `user.onboarding_completed`
 * so the Home gate stops redirecting the reader to `/welcome`. */
const setOnboardingCompleted = createServerFn({ method: "POST" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .handler(async ({ context }): Promise<{ completed: boolean }> => {
    setCookie(
      ONBOARDING_COMPLETED_COOKIE,
      onboardingCompletedToCookieValue(true),
      {
        path: "/",
        sameSite: "lax",
        maxAge: ONBOARDING_COMPLETED_COOKIE_MAX_AGE_SECONDS,
      },
    );

    if (context?.session?.user) {
      await context.db
        .update(context.schema.user)
        .set({ onboardingCompleted: true })
        .where(eq(context.schema.user.id, context.session.user.id));
    }

    return { completed: true };
  });

interface WeeklyDigestStatus {
  /** Opted into the weekly digest (`user.weeklyDigestEnabled`). */
  enabled: boolean;
  /** The `transition:email` scope has actually been granted on the PDS. When
   * `enabled` is true but this is false, the opt-in re-auth didn't complete. */
  hasEmailScope: boolean;
  /** The account email we've captured, if any (for display). */
  email: string | null;
}

/** Current weekly-digest opt-in state for the signed-in reader. */
const getWeeklyDigestStatus = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(async ({ context }): Promise<WeeklyDigestStatus> => {
    const { getReaderContextForRequest } =
      await import("#/middleware/auth-session.server");
    const reader = await getReaderContextForRequest(getRequest());
    if (!reader) {
      return { enabled: false, hasEmailScope: false, email: null };
    }

    const row = await context.db.query.user.findFirst({
      where: eq(context.schema.user.id, reader.userId),
      columns: { weeklyDigestEnabled: true, email: true },
      with: {
        accounts: {
          columns: { scope: true, providerId: true },
          where: eq(context.schema.account.providerId, "atproto"),
        },
      },
    });
    const scope =
      row?.accounts.find((a) => a.providerId === "atproto")?.scope ?? null;

    return {
      enabled: row?.weeklyDigestEnabled === true,
      hasEmailScope: hasEmailScope(scope),
      email: row?.email ?? null,
    };
  });

const getWeeklyDigestStatusQueryOptions = queryOptions({
  queryKey: ["weeklyDigestStatus"] as const,
  queryFn: () => getWeeklyDigestStatus(),
  staleTime: Number.POSITIVE_INFINITY,
});

/** The toggleable digest sections. Keep in sync with `DigestSections` in
 * `src/server/digest/builder.ts` and the `weeklyDigestSection*` user columns. */
const DIGEST_SECTION_KEYS = [
  "subscriptions",
  "network",
  "saved",
  "recommendations",
] as const;

type DigestSectionKey = (typeof DIGEST_SECTION_KEYS)[number];

type WeeklyDigestSections = Record<DigestSectionKey, boolean>;

/** Section key → the `null`-able opt-out column that backs it. */
const DIGEST_SECTION_COLUMN = {
  subscriptions: "weeklyDigestSectionSubscriptions",
  network: "weeklyDigestSectionNetwork",
  saved: "weeklyDigestSectionSaved",
  recommendations: "weeklyDigestSectionRecommendations",
} as const satisfies Record<DigestSectionKey, string>;

const DEFAULT_DIGEST_SECTIONS: WeeklyDigestSections = {
  subscriptions: true,
  network: true,
  saved: true,
  recommendations: true,
};

/** Per-section digest opt-outs for the signed-in reader (`null`/`true` = on). */
const getWeeklyDigestSections = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(async ({ context }): Promise<WeeklyDigestSections> => {
    const { getReaderContextForRequest } =
      await import("#/middleware/auth-session.server");
    const reader = await getReaderContextForRequest(getRequest());
    if (!reader) return { ...DEFAULT_DIGEST_SECTIONS };

    const row = await context.db.query.user.findFirst({
      where: eq(context.schema.user.id, reader.userId),
      columns: {
        weeklyDigestSectionSubscriptions: true,
        weeklyDigestSectionNetwork: true,
        weeklyDigestSectionSaved: true,
        weeklyDigestSectionRecommendations: true,
      },
    });

    return {
      subscriptions: row?.weeklyDigestSectionSubscriptions !== false,
      network: row?.weeklyDigestSectionNetwork !== false,
      saved: row?.weeklyDigestSectionSaved !== false,
      recommendations: row?.weeklyDigestSectionRecommendations !== false,
    };
  });

const getWeeklyDigestSectionsQueryOptions = queryOptions({
  queryKey: ["weeklyDigestSections"] as const,
  queryFn: () => getWeeklyDigestSections(),
  staleTime: Number.POSITIVE_INFINITY,
});

/** Toggle one digest section on/off for the signed-in reader. */
const setWeeklyDigestSection = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(
    z.object({
      section: z.enum(DIGEST_SECTION_KEYS),
      enabled: z.boolean(),
    }),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ section: DigestSectionKey; enabled: boolean }> => {
      const { getReaderContextForRequest } =
        await import("#/middleware/auth-session.server");
      const reader = await getReaderContextForRequest(getRequest());
      if (reader) {
        await context.db
          .update(context.schema.user)
          .set({ [DIGEST_SECTION_COLUMN[data.section]]: data.enabled })
          .where(eq(context.schema.user.id, reader.userId));
      }
      return { section: data.section, enabled: data.enabled };
    },
  );

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
  getLocalePreference,
  getLocalePreferenceQueryOptions,
  setLocalePreference,
  getLocaleHint,
  getLocaleHintQueryOptions,
  dismissLocaleHint,
  getReaderVoicePreference,
  getReaderVoicePreferenceQueryOptions,
  setReaderVoicePreference,
  getOpenLinksPreference,
  getOpenLinksPreferenceQueryOptions,
  setOpenLinksPreference,
  setProfileTabSettings,
  getOpenCollectionsInMagazinePreference,
  getOpenCollectionsInMagazinePreferenceQueryOptions,
  setOpenCollectionsInMagazinePreference,
  getReadingTypographyPreference,
  getReadingTypographyPreferenceQueryOptions,
  setReadingTypographyPreference,
  getTrackReadingHistoryPreference,
  getTrackReadingHistoryPreferenceQueryOptions,
  setTrackReadingHistoryPreference,
  getCountOldPostsAsUnreadPreference,
  getCountOldPostsAsUnreadPreferenceQueryOptions,
  setCountOldPostsAsUnreadPreference,
  getHomeScopePreference,
  getHomeScopePreferenceQueryOptions,
  setHomeScopePreference,
  dismissAtstoreReviewPrompt,
  setOnboardingCompleted,
  getWeeklyDigestStatus,
  getWeeklyDigestStatusQueryOptions,
  getWeeklyDigestSections,
  getWeeklyDigestSectionsQueryOptions,
  setWeeklyDigestSection,
  signOut,
};

export type { DigestSectionKey, WeeklyDigestSections };
