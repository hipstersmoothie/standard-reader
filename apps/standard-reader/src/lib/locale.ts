/**
 * Locale preference shared types/helpers.
 *
 * Mirrors `src/lib/theme.ts`: persisted in the `standard-reader-locale` cookie
 * (SSR for everyone), and signed-in users also store it on `user.locale`
 * (`null` = negotiate from `Accept-Language`).
 *
 * Resolution order is DB -> cookie -> `Accept-Language` -> `en`. See
 * `src/server/locale-preference.ts`.
 */

export const LOCALES = [
  "en",
  "en-XA",
  "es",
  "fr",
  "de",
  "pt",
  "ar",
  "ja",
  "zh",
  "ko",
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Pseudo-locale: accented/expanded English for catching unextracted strings and
 * layout overflow. Not offered in the language picker outside development.
 */
export const PSEUDO_LOCALE: Locale = "en-XA";

export const LOCALE_COOKIE = "standard-reader-locale";

export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Marks that the one-time language indicator has been shown to a guest. Set to
 * `"1"` once the indicator appears so it never shows again; signed-in readers
 * use `user.locale_hint_seen` instead. See `src/lib/use-locale-hint.ts`.
 */
export const LOCALE_HINT_SEEN_COOKIE = "standard-reader-locale-hint";

export const LOCALE_HINT_SEEN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type TextDirection = "ltr" | "rtl";

/** Right-to-left scripts. Grow this alongside LOCALES (he, fa, ur). */
const RTL_LOCALES = new Set<Locale>(["ar"]);

/** Display names, each written in its own language (endonyms). */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "en-XA": "Pseudo-locale (dev)",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  ar: "العربية",
  ja: "日本語",
  zh: "中文",
  ko: "한국어",
};

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (LOCALES as ReadonlyArray<string>).includes(value)
  );
}

export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Note there is deliberately no `localeToDbValue`. Unlike `themeMode`, the
 * column stores the tag verbatim: `null` means "never picked a language" and
 * keeps `Accept-Language` negotiation alive, so collapsing an explicit `en`
 * choice to `null` would let the browser override the user.
 */
export function dbValueToLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function directionForLocale(locale: Locale): TextDirection {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

/**
 * The locale tag handed to `Intl` / `I18nProvider`.
 *
 * The pseudo-locale is not a real BCP-47 tag any `Intl` constructor knows, so
 * dates/numbers under it format as English while the *messages* stay
 * pseudo-localized — which is what you want when the point is to spot
 * unextracted strings.
 */
export function intlLocale(locale: Locale): string {
  return locale === PSEUDO_LOCALE ? "en" : locale;
}

/**
 * Pick the best supported locale from an `Accept-Language` header.
 *
 * Walks the header in q-value order and matches on the primary subtag, so
 * `pt-BR` resolves to `pt` and `zh-Hans` to `zh`. Returns `null` when nothing
 * matches, letting the caller fall back to {@link DEFAULT_LOCALE}.
 */
export function negotiateLocale(
  header: string | null | undefined,
): Locale | null {
  if (!header) return null;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      const quality = q === undefined ? 1 : Number.parseFloat(q);
      return {
        tag: tag?.trim().toLowerCase() ?? "",
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((entry) => entry.tag !== "" && entry.quality > 0)
    .toSorted((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const exact = LOCALES.find((locale) => locale.toLowerCase() === tag);
    if (exact) return exact;

    const primary = tag.split("-")[0];
    const partial = LOCALES.find(
      (locale) => locale.toLowerCase().split("-")[0] === primary,
    );
    if (partial) return partial;
  }

  return null;
}
