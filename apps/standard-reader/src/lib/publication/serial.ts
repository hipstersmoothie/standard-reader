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
 * That single flag is what marks a *declared* serial here. What kind of serial
 * it is has no field in the lexicon, so it is app-derived from the posts
 * themselves (`recomputeSerialKinds`): a publication whose posts are mostly
 * pages of art is a `"comic"` and opens in the comic reader; everything else is
 * a `"book"` and reads as ordinary articles with an "Up next" link to the
 * following issue.
 *
 * Most comics never set the flag. It is a preference buried in a publishing
 * tool's settings, and a comic posted through Leaflet arrives looking exactly
 * like a blog — so waiting for the declaration means the majority of comics on
 * the network read as columns of stacked images forever. A publication that
 * declares nothing is therefore *also* allowed to be a comic, on evidence: its
 * posts are pages of art, and its titles run in sequence
 * (`#/lib/comic/issue-title`). Both are required, because either alone is
 * ordinary — a photoblog is art without a sequence, a numbered essay series is a
 * sequence without art.
 *
 * Only comics are inferred. A serial *book* is indistinguishable from a blog
 * from the outside — both are posts of prose — so `"book"` still needs the
 * publisher to say so.
 */

/** `prevNextDirection` — a serial reads forwards from its first post. */
export const SERIAL_DIRECTION = "ltr";

/** `prevNextDirection` — the lexicon default: an ordinary reverse-chron blog. */
export const BLOG_DIRECTION = "rtl";

/** Known `preferences.prevNextDirection` values. */
export type PrevNextDirection = typeof SERIAL_DIRECTION | typeof BLOG_DIRECTION;

/** App-derived flavour of a serial publication. */
export type SerialKind = "comic" | "book";

/**
 * What `publications.serial_kind` holds for a publication we have looked at and
 * judged to be an ordinary blog.
 *
 * A NULL there means "nobody has judged this yet", and judging an undeclared
 * publication costs a query over its titles (and, for a candidate, its bodies).
 * Without somewhere to record a negative that runs on every view of every blog,
 * forever. This is that record: not a {@link SerialKind}, so
 * {@link parseSerialKind} refuses it and every read path treats it as the
 * ordinary publication it is — it only stops us asking again.
 *
 * It is cleared by the hourly sweep along with every other derived kind on an
 * undeclared publication, so a blog that turns into a comic is re-judged on its
 * next view rather than being written off permanently.
 */
export const JUDGED_NOT_SERIAL = "blog";

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
 * When the publisher declared the direction, it decides *whether* this is a
 * serial and `serialKind` is our derivation of *which kind*. A declared serial
 * whose kind hasn't been derived yet (a new publication, before the next
 * recompute sweep) reads as a `"book"` — prose is the safe default, since it
 * only adds an "Up next" link rather than rerouting the reader into the comic
 * reader.
 *
 * Without the declaration only a derived `"comic"` stands on its own (see the
 * note at the top of this file). Note that this holds for an explicit `"rtl"`
 * too, not just a missing one: `"rtl"` is the lexicon default, so a publisher
 * who has it is far more likely never to have touched the setting than to be
 * insisting their comic is a blog. If the publication stops looking like a
 * comic, the derivation says so and the kind goes away with it.
 */
export function resolveSerialPublication(
  prevNextDirection: unknown,
  serialKind: unknown,
): SerialPublication | null {
  if (isSerialDirection(prevNextDirection)) {
    return { kind: parseSerialKind(serialKind) ?? "book" };
  }
  return parseSerialKind(serialKind) === "comic" ? { kind: "comic" } : null;
}

/**
 * Whether a publication's stored serial columns still need resolving from the
 * record and its posts (`ensurePublicationSerial`).
 *
 * There are two ways to be unresolved, and only checking the first one is a trap.
 * A NULL `prevNextDirection` means the row was indexed before the column existed
 * — nothing is known. But a row that says `"ltr"` with no `serialKind` is *also*
 * unresolved: it is a serial whose kind the hourly sweep hasn't judged yet, and
 * {@link resolveSerialPublication} answers `"book"` for it, because prose is the
 * safe default to *render*. It is not a safe default to stop looking at: a comic
 * left reading as a book loses its shelf of covers and its page-flip reader, and
 * nothing on the read path would ever ask again.
 *
 * An undeclared publication is unresolved in the same way, and for the same
 * reason: it may be a comic that never said so, and nothing else on the read
 * path would ever ask. It stops being unresolved the moment a verdict is
 * written — `"comic"`, or {@link JUDGED_NOT_SERIAL} for the blogs, which is
 * almost all of them. That marker is what keeps the on-demand resolution off the
 * common path: one judgement per publication, not one per page view.
 */
export function needsSerialResolution(
  prevNextDirection: unknown,
  serialKind: unknown,
): boolean {
  if (parsePrevNextDirection(prevNextDirection) == null) return true;
  if (isSerialDirection(prevNextDirection)) {
    return parseSerialKind(serialKind) == null;
  }
  return serialKind == null;
}
