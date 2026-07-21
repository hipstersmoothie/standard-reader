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
