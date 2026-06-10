import type { Did } from "@atcute/lexicons";
import type { ThemeMode } from "#/lib/theme";

import { isDid } from "@atcute/lexicons/syntax";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import {
  restoreAtprotoSession,
  revokeAtprotoSession,
} from "#/integrations/auth/atproto";
import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";
import { fetchBlueskyPublicProfileFields } from "#/lib/bluesky-public-profile";
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
import { maybeAuthMiddleware } from "#/middleware/auth";
import { resolveIdentity } from "#/server/atproto/identity";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { dbMiddleware } from "./db-middleware";

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookiePairs = cookieHeader.split("; ").map((c) => {
    const [key, ...valueParts] = c.split("=");
    return [key ?? "", valueParts.join("=")] as [string, string];
  });
  return Object.fromEntries(cookiePairs) as Record<string, string>;
}

const getSession = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(async ({ context }) => {
    const request = getRequest();
    const cookies = parseCookies(request.headers.get("cookie"));
    const sessionToken = cookies[AUTH_SESSION_TOKEN_COOKIE];

    if (!sessionToken) {
      return null;
    }

    const db = context.db;
    const schema = context.schema;
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

    const [atprotoSession, profileRow, publicProfile, identity] =
      await Promise.all([
        restoreAtprotoSession(userRow.did),
        db.query.profiles.findFirst({
          where: eq(schema.profiles.did, userRow.did),
          columns: { handle: true },
        }),
        fetchBlueskyPublicProfileFields(userRow.did),
        resolveIdentity(userRow.did),
      ]);
    if (!atprotoSession) {
      return null;
    }

    const handle =
      profileRow?.handle ?? publicProfile?.handle ?? identity.handle ?? null;

    return {
      user: {
        ...userRow,
        handle,
      },
      session: {
        id: sessionRow.id,
        userId: userRow.id,
        expiresAt: sessionRow.expiresAt,
      },
    };
  });

const getSessionQueryOptions = queryOptions({
  queryKey: ["session"],
  queryFn: async () => {
    return await getSession();
  },
});

const getThemePreference = createServerFn({ method: "GET" })
  .middleware([dbMiddleware, maybeAuthMiddleware])
  .handler(async ({ context }): Promise<{ mode: ThemeMode }> => {
    const session = context?.session;
    if (session?.user) {
      const row = await context.db.query.user.findFirst({
        where: eq(context.schema.user.id, session.user.id),
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

const readingTypographyInput = z.object({
  preference: z.object({
    fontSize: z.enum(["small", "default", "large"]),
    measure: z.enum(["narrow", "default", "wide"]),
    bodyFont: z.enum(["serif", "sans"]),
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

    setCookie(
      READING_TYPOGRAPHY_COOKIE,
      readingTypographyToCookieValue(data.preference),
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
          readingTypography: readingTypographyToDbValue(data.preference),
        })
        .where(eq(context.schema.user.id, context.session.user.id));
    }

    return { preference: data.preference };
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
  getSession,
  getSessionQueryOptions,
  getThemePreference,
  getThemePreferenceQueryOptions,
  setThemePreference,
  getReaderVoicePreference,
  getReaderVoicePreferenceQueryOptions,
  setReaderVoicePreference,
  getOpenLinksPreference,
  getOpenLinksPreferenceQueryOptions,
  setOpenLinksPreference,
  getReadingTypographyPreference,
  getReadingTypographyPreferenceQueryOptions,
  setReadingTypographyPreference,
  signOut,
};
