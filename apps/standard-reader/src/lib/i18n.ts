/**
 * Lingui runtime setup.
 *
 * Catalogs are imported statically (via `@lingui/vite-plugin`, which compiles
 * `.po` at build time) so SSR can render translated markup synchronously — a
 * dynamic `import()` would need an await the shell render can't perform.
 *
 * IMPORTANT: this deliberately does *not* use the global `i18n` singleton from
 * `@lingui/core` with `i18n.activate(locale)`. Under concurrent SSR two
 * requests with different locales share module state, and whichever activated
 * last wins — readers intermittently get another reader's language. Instead
 * each locale gets its own immutable `I18n` instance, cached and handed to
 * `I18nProvider`. Same reasoning as the per-locale formatter cache in
 * `./formatters.ts`.
 */

import type { I18n } from "@lingui/core";
import { setupI18n } from "@lingui/core";

import { messages as ar } from "../locales/ar/messages.po";
import { messages as de } from "../locales/de/messages.po";
import { messages as enXA } from "../locales/en-XA/messages.po";
import { messages as en } from "../locales/en/messages.po";
import { messages as es } from "../locales/es/messages.po";
import { messages as fr } from "../locales/fr/messages.po";
import { messages as ja } from "../locales/ja/messages.po";
import { messages as ko } from "../locales/ko/messages.po";
import { messages as pt } from "../locales/pt/messages.po";
import { messages as zh } from "../locales/zh/messages.po";
import type { Locale } from "./locale";

const CATALOGS: Record<Locale, Record<string, string>> = {
  en,
  "en-XA": enXA,
  es,
  fr,
  de,
  pt,
  ar,
  ja,
  zh,
  ko,
};

const instances = new Map<Locale, I18n>();

/** Immutable, per-locale `I18n` instance. Safe to share across requests. */
export function i18nForLocale(locale: Locale): I18n {
  const cached = instances.get(locale);
  if (cached) return cached;

  const instance = setupI18n({
    locale,
    messages: { [locale]: CATALOGS[locale] },
  });
  instances.set(locale, instance);
  return instance;
}
