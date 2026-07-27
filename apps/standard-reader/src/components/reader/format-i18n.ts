/**
 * Translated formatting helpers for the reader UI.
 *
 * Deliberately separate from `./format.ts`, which is imported by a dozen
 * SERVER modules (OG cards, feeds, digest, announce, extension handlers) that
 * only need pure helpers like `initials` and `publicationLinkParams`.
 *
 * Anything using a Lingui macro must stay out of that server-reachable path:
 * the macro is compiled away by the Babel pass in `vite.config.ts`, but Vitest
 * uses a separate config with no such pass, so a server test that transitively
 * imports a macro fails to load with
 * `Cannot find package 'babel-plugin-macros'`.
 *
 * These take an `i18n` rather than being hooks so they stay plain module
 * functions (matching `formatMatchCount` in `_layout.search.tsx`); every call
 * site is a component that can pull one off `useLingui()`.
 */

import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";

import { formatReaders } from "./format";

/** Tag directory meta: posts on a publication carrying the page tag. */
export function formatTaggedPostCount(i18n: I18n, count: number): string {
  const value = formatReaders(count);
  return i18n._(
    msg`${plural(count, { one: "# tagged post", other: `${value} tagged posts` })}`,
  );
}

/** Article byline meta: read count only (omits zero). Likes use `LikeCount`. */
export function formatArticleReadStats(
  i18n: I18n,
  readCount: number,
): string | null {
  if (readCount <= 0) return null;
  const value = formatReaders(readCount);
  return i18n._(
    msg`${plural(readCount, { one: "# read", other: `${value} reads` })}`,
  );
}

/**
 * Publication header meta: how long ago the publication last posted.
 *
 * Lives here, taking an `i18n`, because the earlier version took the `t` from
 * `useLingui()` as a *parameter* — which Lingui's macro cannot see, so none of
 * these strings were ever extracted and every one of them resolved to an empty
 * string at runtime. The stat rendered its label with no value.
 */
export function formatLastActive(i18n: I18n, iso: string | null): string {
  if (!iso) return "—";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "—";
  const days = Math.floor((Date.now() - parsed) / 86_400_000);
  if (days <= 0) return i18n._(msg`today`);
  if (days === 1) return i18n._(msg`yesterday`);
  if (days < 30) return i18n._(msg`${days}d ago`);
  if (days < 365) {
    const months = Math.floor(days / 30);
    return i18n._(msg`${months}mo ago`);
  }
  const years = Math.floor(days / 365);
  return i18n._(msg`${years}y ago`);
}
