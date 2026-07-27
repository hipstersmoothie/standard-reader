/**
 * Feed preferences — how article lists present themselves.
 *
 * Two independent dials, both signed-in only (they live on the settings page,
 * which guests can't reach), so each is stored on the `user` row with no cookie
 * mirror — same shape as `#/lib/publication-theme-preference`.
 *
 * - **Hide engagement counts** (`user.hide_feed_metrics`): suppresses the
 *   recommend + Bluesky comment counts wherever they're shown as a metric —
 *   article cards, result rows, the article byline, mention hover cards, and the
 *   count on the end-of-article recommend button. The Recommend action itself
 *   always stays; this hides the number, not the ability to recommend.
 * - **Pagination** (`user.feed_pagination`): `infinite` (the default) keeps the
 *   IntersectionObserver sentinel that pulls the next page as you approach the
 *   end of the list; `button` replaces it with an explicit "Load more" button,
 *   so the page only grows when the reader asks it to.
 *
 * `null` in either column means "never set" and resolves to the default.
 */

export const DEFAULT_HIDE_FEED_METRICS = false;

export function hideFeedMetricsToDbValue(hidden: boolean): true | null {
  return hidden ? true : null;
}

export function dbValueToHideFeedMetrics(
  value: boolean | null | undefined,
): boolean {
  return value === true;
}

/** How paginated lists fetch their next page. */
export type FeedPagination = "infinite" | "button";

export const FEED_PAGINATION_MODES = ["infinite", "button"] as const;

export const DEFAULT_FEED_PAGINATION: FeedPagination = "infinite";

export function isFeedPagination(value: unknown): value is FeedPagination {
  return value === "infinite" || value === "button";
}

/** `infinite` is the default, so it's stored as `null` rather than a string. */
export function feedPaginationToDbValue(mode: FeedPagination): "button" | null {
  return mode === "button" ? "button" : null;
}

export function dbValueToFeedPagination(
  value: string | null | undefined,
): FeedPagination {
  return value === "button" ? "button" : DEFAULT_FEED_PAGINATION;
}
