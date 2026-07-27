import { getCookie, getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import {
  APPEARANCE_COOKIE,
  appearanceScheme,
  dbValueToAppearance,
  parseAppearanceCookie,
} from "#/lib/appearance";
import {
  DEFAULT_USE_PUBLICATION_THEME,
  dbValueToUsePublicationTheme,
} from "#/lib/publication-theme-preference";
import type {
  ResolvedThemeScheme,
  ThemeMode,
  ThemeSchemeMode,
} from "#/lib/theme";
import {
  THEME_COOKIE,
  dbValueToThemeMode,
  parseThemeMode,
  resolveThemeScheme,
} from "#/lib/theme";

/**
 * The reader's theme mode, with `custom` already collapsed to the scheme their
 * palette renders in. Callers use this to pick a *scheme* (Shiki themes for
 * code blocks), and a custom palette is never ambiguous about which one it is —
 * so resolving it here keeps every downstream branch a plain light/dark/system.
 */
export async function themeModeForRequest(
  db: Db,
  schema: Schema,
  sessionUserId?: string | null,
): Promise<ThemeSchemeMode> {
  if (sessionUserId) {
    const row = await db.query.user.findFirst({
      where: eq(schema.user.id, sessionUserId),
      columns: { themeMode: true, appearance: true },
    });
    const mode = dbValueToThemeMode(row?.themeMode ?? null);
    return mode === "custom"
      ? appearanceScheme(dbValueToAppearance(row?.appearance ?? null))
      : mode;
  }

  const mode = parseThemeMode(getCookie(THEME_COOKIE));
  return mode === "custom"
    ? appearanceScheme(parseAppearanceCookie(getCookie(APPEARANCE_COOKIE)))
    : mode;
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
