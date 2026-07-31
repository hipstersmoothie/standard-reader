/**
 * Serial publications — books and comics that read front-to-back.
 *
 * `site.standard.publication#preferences.prevNextDirection` is the publisher's
 * declared prev/next reading direction. The lexicon default is `"rtl"`, which
 * is the ordinary blog order (newest post first, "next" walks backwards into
 * the archive). A publisher who sets `"ltr"` is saying the opposite: the
 * publication reads forwards from its *first* post, so "next" is the later
 * issue and the work has a front and a back.
 *
 * That is about reading order *inside* the work — prev/next, "Up next", the
 * comic reader's page numbering. The archive itself still lists newest-first
 * like everything else (see `#/lib/publication/archive-order`).
 *
 * That single flag is what marks a publication as a serial here. What kind of
 * serial it is has no field in the lexicon, so it is app-derived from the
 * posts themselves (`recomputeSerialKinds`): a publication whose posts are
 * mostly pages of art is a `"comic"` and opens in the comic reader; everything
 * else is a `"book"` and reads as ordinary articles with an "Up next" link to
 * the following issue.
 */

/** `prevNextDirection` — a serial reads forwards from its first post. */
export const SERIAL_DIRECTION = "ltr";

/** `prevNextDirection` — the lexicon default: an ordinary reverse-chron blog. */
export const BLOG_DIRECTION = "rtl";

/** Known `preferences.prevNextDirection` values. */
export type PrevNextDirection = typeof SERIAL_DIRECTION | typeof BLOG_DIRECTION;

/** App-derived flavour of a serial publication. */
export type SerialKind = "comic" | "book";

/** Serial metadata carried on a publication card. */
export interface SerialPublication {
  kind: SerialKind;
}

/** Narrow a raw record/DB value to a known `prevNextDirection`. */
export function parsePrevNextDirection(
  value: unknown,
): PrevNextDirection | null {
  return value === SERIAL_DIRECTION || value === BLOG_DIRECTION ? value : null;
}

/** Narrow a raw DB value to a known {@link SerialKind}. */
export function parseSerialKind(value: unknown): SerialKind | null {
  return value === "comic" || value === "book" ? value : null;
}

/**
 * True when the publisher asked readers to start at the first post
 * (`prevNextDirection = "ltr"`). Unset and `"rtl"` are both ordinary blogs.
 */
export function isSerialDirection(value: unknown): boolean {
  return parsePrevNextDirection(value) === SERIAL_DIRECTION;
}

/**
 * Serial metadata for a publication card, or null for an ordinary blog.
 *
 * The direction is the publisher's declaration and decides *whether* this is a
 * serial; `serialKind` is our derivation of *which kind*. A serial whose kind
 * hasn't been derived yet (a new publication, before the next recompute sweep)
 * reads as a `"book"` — prose is the safe default, since it only adds an "Up
 * next" link rather than rerouting the reader into the comic reader.
 */
export function resolveSerialPublication(
  prevNextDirection: unknown,
  serialKind: unknown,
): SerialPublication | null {
  if (!isSerialDirection(prevNextDirection)) return null;
  return { kind: parseSerialKind(serialKind) ?? "book" };
}
