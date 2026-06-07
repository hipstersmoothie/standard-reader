import { getCookie, getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";

import {
  dbValueToThemeMode,
  parseThemeMode,
  resolveThemeScheme,
  THEME_COOKIE,
  type ResolvedThemeScheme,
  type ThemeMode,
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

export function resolvedThemeSchemeForRequest(
  mode: ThemeMode,
): ResolvedThemeScheme {
  const request = getRequest();
  const prefersColorScheme =
    request.headers.get("sec-ch-prefers-color-scheme") ??
    request.headers.get("Sec-CH-Prefers-Color-Scheme");
  return resolveThemeScheme(mode, prefersColorScheme);
}
