import type { Did } from "@atcute/lexicons";

import { isDid } from "@atcute/lexicons/syntax";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import {
  restoreAtprotoSession,
  revokeAtprotoSession,
} from "#/integrations/auth/atproto";
import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";
import { dbValueToThemeMode, parseThemeMode, THEME_COOKIE, THEME_COOKIE_MAX_AGE_SECONDS, THEME_MODES, themeModeToDbValue } from '#/lib/theme';
import type { ThemeMode } from '#/lib/theme';
import { fetchBlueskyPublicProfileFields } from "#/lib/bluesky-public-profile";
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
  signOut,
};
