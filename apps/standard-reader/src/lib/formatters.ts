/**
 * Locale-aware `Intl` formatters.
 *
 * Replaces the hardcoded `en-US` formatters that were scattered across
 * `src/components/reader/format.ts`, `src/lib/format-count.ts` and friends.
 *
 * Formatters are *locale-bound*, never ambient. A module-level "current locale"
 * would race across concurrent SSR requests (two readers with different locales
 * being rendered on the same server tick), so callers get a bundle for an
 * explicit locale — via `useFormatters()` in components, or `formattersFor()`
 * in server code that already resolved the request locale.
 *
 * `Intl.*Format` construction is genuinely expensive, hence the cache; the key
 * space is bounded by `LOCALES`, so it cannot grow without bound.
 */

import type { Locale } from "./locale";
import { intlLocale } from "./locale";

export interface Formatters {
  locale: Locale;
  /** "Jun 12, 2026" */
  date: (iso: string | null) => string;
  /** "June 12, 2026" — home masthead dateline. */
  longDate: (iso: string | null) => string;
  /** "Jun 2026" — collection issue rows. */
  monthYear: (iso: string | null) => string;
  /** "Thursday" */
  weekday: (iso: string | null) => string;
  /** Compact relative label ("2h ago"), falling back to an absolute date past a week. */
  relativeTime: (iso: string | null) => string;
  number: (value: number) => string;
  /** Abbreviated counts ("1.2k") using locale-aware compact notation. */
  compactNumber: (value: number) => string;
}

const cache = new Map<Locale, Formatters>();

/** Locale-independent, so it lives outside the per-locale factory. */
function parse(iso: string | null): Date | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t);
}

export function formattersFor(locale: Locale): Formatters {
  const cached = cache.get(locale);
  if (cached) return cached;

  const tag = intlLocale(locale);

  const dateFmt = new Intl.DateTimeFormat(tag, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const longDateFmt = new Intl.DateTimeFormat(tag, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const monthYearFmt = new Intl.DateTimeFormat(tag, {
    month: "short",
    year: "numeric",
  });
  const weekdayFmt = new Intl.DateTimeFormat(tag, { weekday: "long" });
  const relativeFmt = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  const numberFmt = new Intl.NumberFormat(tag);
  // Replaces the hand-rolled `${(n / 1000).toFixed(1)}k` in formatReaders,
  // which produced "1.2k" in every language.
  const compactFmt = new Intl.NumberFormat(tag, {
    notation: "compact",
    maximumFractionDigits: 1,
  });

  const date = (iso: string | null) => {
    const d = parse(iso);
    return d ? dateFmt.format(d) : "";
  };

  const formatters: Formatters = {
    locale,
    date,
    longDate: (iso) => {
      const d = parse(iso);
      return d ? longDateFmt.format(d) : "";
    },
    monthYear: (iso) => {
      const d = parse(iso);
      return d ? monthYearFmt.format(d) : "";
    },
    weekday: (iso) => {
      const d = parse(iso);
      return d ? weekdayFmt.format(d) : "";
    },
    relativeTime: (iso) => {
      const d = parse(iso);
      if (!d) return "";

      const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
      if (Math.abs(diffSec) < 60) return relativeFmt.format(diffSec, "second");
      const diffMin = Math.round(diffSec / 60);
      if (Math.abs(diffMin) < 60) return relativeFmt.format(diffMin, "minute");
      const diffHour = Math.round(diffSec / 3600);
      if (Math.abs(diffHour) < 24) return relativeFmt.format(diffHour, "hour");
      const diffDay = Math.round(diffSec / 86_400);
      if (Math.abs(diffDay) < 7) return relativeFmt.format(diffDay, "day");
      return date(iso);
    },
    number: (value) => numberFmt.format(value),
    // The app's house style for abbreviated counts is a lowercase "k"
    // ("1.2k", matching `formatReaders`); CLDR gives English an uppercase "K".
    // No other locale in LOCALES emits a bare Latin "K", so this is a no-op
    // outside English.
    compactNumber: (value) => compactFmt.format(value).replace("K", "k"),
  };

  cache.set(locale, formatters);
  return formatters;
}
