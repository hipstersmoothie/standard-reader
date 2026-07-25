import { getCookie, getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import {
  DEFAULT_USE_PUBLICATION_THEME,
  dbValueToUsePublicationTheme,
} from "#/lib/publication-theme-preference";
import type { ResolvedThemeScheme, ThemeMode } from "#/lib/theme";
import {
  THEME_COOKIE,
  dbValueToThemeMode,
  parseThemeMode,
  resolveThemeScheme,
} from "#/lib/theme";

export async function themeModeForRequest(
  db: Db,
  schema: Schema,
  sessionUserId?: string | null,
): Promise<ThemeMode> {
  if (sessionUserId) {
    const row = await db.query.user.findFirst({
      where: eq(schema.user.id, sessionUserId),
      columns: { themeMode: true },
    });
    return dbValueToThemeMode(row?.themeMode ?? null);
  }

  return parseThemeMode(getCookie(THEME_COOKIE));
}

/**
 * Whether this reader opted into publication themes. Signed-in only, mirroring
 * `getUsePublicationThemePreference` — guests never see publication colours, so
 * their code blocks stay editorial too.
 */
export async function usePublicationThemeForRequest(
  db: Db,
  schema: Schema,
  sessionUserId?: string | null,
): Promise<boolean> {
  if (!sessionUserId) return DEFAULT_USE_PUBLICATION_THEME;
  const row = await db.query.user.findFirst({
    where: eq(schema.user.id, sessionUserId),
    columns: { usePublicationTheme: true },
  });
  return dbValueToUsePublicationTheme(row?.usePublicationTheme ?? null);
}

export function resolvedThemeSchemeForRequest(
  mode: ThemeMode,
): ResolvedThemeScheme {
  const request = getRequest();
  const prefersColorScheme =
    request.headers.get("sec-ch-prefers-color-scheme") ??
    request.headers.get("Sec-CH-Prefers-Color-Scheme");
  return resolveThemeScheme(mode, prefersColorScheme);
}
