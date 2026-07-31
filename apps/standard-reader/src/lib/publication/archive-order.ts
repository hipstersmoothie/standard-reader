/**
 * Reader overrides for the order a publication's archive is listed in.
 *
 * An ordinary publication lists newest-first; a serial lists oldest-first, so
 * chapter one leads (see `#/lib/publication/serial`). Whether a publication is a
 * serial comes from `preferences.prevNextDirection` on its record — the
 * publisher's claim about their own work, and one they can get wrong. A blog
 * whose author set the flag without meaning "read me front to back" reads
 * backwards for everyone; a serial whose author never set it reads backwards
 * too.
 *
 * So the reader gets the last word. The override is per publication — disagreeing
 * with one publisher's label says nothing about the next — and lives in a cookie
 * so the server can honor it while rendering, rather than the archive painting
 * one way and flipping after hydration.
 *
 * Deliberately not stored on the user row: it costs a migration and a write path
 * to remember a display preference that a signed-out reader should get too.
 */

/** Which end of the archive leads. */
export type ArchiveOrder = "newest" | "oldest";

export const ARCHIVE_ORDER_COOKIE = "standard-reader-archive-order";

export const ARCHIVE_ORDER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Overrides remembered before the least recently set is dropped.
 *
 * Each entry costs roughly 45 bytes, so this keeps the cookie near 1KB — well
 * under the ~4KB browsers allow, and it rides on every request to the app.
 * Reaching the cap means a reader has disagreed with two dozen publishers;
 * losing the oldest of those restores that publication's own ordering, which is
 * the honest thing to forget back to.
 */
export const ARCHIVE_ORDER_MAX_ENTRIES = 24;

/** The order a publication lists in when the reader hasn't said otherwise. */
export function defaultArchiveOrder(isSerial: boolean): ArchiveOrder {
  return isSerial ? "oldest" : "newest";
}

function parseArchiveOrder(value: string | undefined): ArchiveOrder | null {
  if (value === "o") return "oldest";
  if (value === "n") return "newest";
  return null;
}

function archiveOrderToken(order: ArchiveOrder): string {
  return order === "oldest" ? "o" : "n";
}

/**
 * The cookie key for a publication: `did/rkey`, dropping the `at://` scheme and
 * the collection NSID that every publication URI repeats. Saves ~35 bytes an
 * entry, which is most of what makes the cap above affordable.
 */
export function archiveOrderKey(publicationUri: string): string | null {
  const withoutScheme = publicationUri.startsWith("at://")
    ? publicationUri.slice("at://".length)
    : null;
  if (!withoutScheme) return null;
  const parts = withoutScheme.split("/");
  const did = parts[0];
  const rkey = parts[2];
  if (!did || !rkey || parts.length !== 3) return null;
  return `${did}/${rkey}`;
}

/**
 * Cookie value → overrides, most recently set first.
 *
 * `key=o!key=n`. A malformed entry is skipped rather than throwing: this is a
 * client-writable string, and a reader whose cookie is half-garbage should get
 * the half that parses, not an error page.
 */
export function parseArchiveOrderCookie(
  value: string | null | undefined,
): Map<string, ArchiveOrder> {
  const out = new Map<string, ArchiveOrder>();
  if (!value) return out;
  for (const entry of value.split("!")) {
    const eq = entry.indexOf("=");
    if (eq === -1) continue;
    const key = entry.slice(0, eq);
    const order = parseArchiveOrder(entry.slice(eq + 1));
    if (!key || !order || out.has(key)) continue;
    out.set(key, order);
  }
  return out;
}

export function serializeArchiveOrderCookie(
  overrides: Map<string, ArchiveOrder>,
): string {
  return [...overrides]
    .slice(0, ARCHIVE_ORDER_MAX_ENTRIES)
    .map(([key, order]) => `${key}=${archiveOrderToken(order)}`)
    .join("!");
}

/** The reader's override for one publication, or null if they haven't set one. */
export function readArchiveOrderOverride(
  cookie: string | null | undefined,
  publicationUri: string,
): ArchiveOrder | null {
  const key = archiveOrderKey(publicationUri);
  if (!key) return null;
  return parseArchiveOrderCookie(cookie).get(key) ?? null;
}

/**
 * The cookie with one publication's override set, moved to the front so the cap
 * drops the override a reader touched longest ago.
 */
export function withArchiveOrderOverride(
  cookie: string | null | undefined,
  publicationUri: string,
  order: ArchiveOrder,
): string {
  const key = archiveOrderKey(publicationUri);
  const existing = parseArchiveOrderCookie(cookie);
  if (!key) return serializeArchiveOrderCookie(existing);
  existing.delete(key);
  return serializeArchiveOrderCookie(new Map([[key, order], ...existing]));
}
