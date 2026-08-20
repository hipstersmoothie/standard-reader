/**
 * Choosing a serialization and returning it.
 *
 * A catalog client says what it wants twice — in `Accept`, and (once it has
 * followed one of our links) in the URL. The URL wins: it is the explicit
 * choice, and it is what keeps a JSON client in JSON as it walks deeper into
 * the catalog. `Accept` decides only the first request, which is the one a
 * reader typed by hand.
 */

import { renderOpdsAtom } from "./atom";
import { OPDS_FORMAT_PARAM, OPDS_JSON_FORMAT, renderOpdsJson } from "./json";
import type { OpdsFeed } from "./model";
import { feedTypeFor, OPDS_JSON_TYPE } from "./model";

export type OpdsFormat = "atom" | "json";

/**
 * Catalog feeds change as often as the feeds they mirror. Fifteen minutes with
 * a generous stale window keeps a shelf feeling live without asking the DB to
 * rebuild it for every device that syncs.
 */
export const OPDS_CACHE_CONTROL =
  "public, max-age=900, stale-while-revalidate=3600";

/** A reader's own shelves are per-DID; caches must not share them between readers. */
export const OPDS_PRIVATE_CACHE_CONTROL = "private, max-age=300";

export function opdsFormatFromRequest(request: Request): OpdsFormat {
  const url = new URL(request.url);
  const explicit = url.searchParams.get(OPDS_FORMAT_PARAM);
  if (explicit === OPDS_JSON_FORMAT) return "json";
  if (explicit === "atom") return "atom";

  // No explicit choice: honour `Accept`, defaulting to 1.2 because that is what
  // the widest set of clients understands.
  const accept = request.headers.get("accept") ?? "";
  return accept.includes(OPDS_JSON_TYPE) ? "json" : "atom";
}

export function opdsResponse(
  feed: OpdsFeed,
  format: OpdsFormat,
  { cacheControl = OPDS_CACHE_CONTROL }: { cacheControl?: string } = {},
): Response {
  const body = format === "json" ? renderOpdsJson(feed) : renderOpdsAtom(feed);
  const contentType =
    format === "json" ? OPDS_JSON_TYPE : feedTypeFor(feed.kind);

  return new Response(body, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": cacheControl,
      "Content-Type": `${contentType}; charset=utf-8`,
      // Same URL, two representations — caches must key on `Accept` too.
      Vary: "Accept",
    },
  });
}
