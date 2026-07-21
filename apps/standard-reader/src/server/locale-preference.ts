import { getCookie, getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import type { Locale } from "#/lib/locale";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  dbValueToLocale,
  isLocale,
  negotiateLocale,
} from "#/lib/locale";

/**
 * Resolve the request's locale: DB (signed in) -> cookie -> `Accept-Language`
 * -> `en`. Mirrors `themeModeForRequest` in `./theme-preference.ts`.
 *
 * A signed-in user with `user.locale = null` has never picked a language, so
 * we keep negotiating from their browser rather than pinning them to English.
 */
export async function localeForRequest(
  db: Db,
  schema: Schema,
  sessionUserId?: string | null,
): Promise<Locale> {
  if (sessionUserId) {
    const row = await db.query.user.findFirst({
      where: eq(schema.user.id, sessionUserId),
      columns: { locale: true },
    });
    if (isLocale(row?.locale)) return dbValueToLocale(row.locale);
  }

  const cookie = getCookie(LOCALE_COOKIE);
  if (isLocale(cookie)) return cookie;

  return localeFromAcceptLanguage();
}

/** `Accept-Language` negotiation for requests with no stored preference. */
export function localeFromAcceptLanguage(): Locale {
  const request = getRequest();
  const header =
    request.headers.get("accept-language") ??
    request.headers.get("Accept-Language");
  return negotiateLocale(header) ?? DEFAULT_LOCALE;
}
