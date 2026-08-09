/**
 * Visibility rules for the two action buttons in the `/latest` controls row —
 * the RSS feed button and "Mark all as read".
 *
 * Both used to be gated on `filter === "unread"`, which made them disappear on
 * their own: `/latest` normalises to `?filter=unread`, so the server renders
 * the buttons, and then the client redirects a reader with reading history
 * turned off to `?filter=subscriptions` — the buttons show for one paint and
 * vanish. Because the filter lives in the URL, reloading landed back on
 * `?filter=subscriptions` and they stayed gone until the reader re-entered the
 * app at a bare `/latest`.
 *
 * The RSS feed behind the button (`/feed/latest/$did`) is "the newest articles
 * from the publications you subscribe to" — it is not unread-filtered, so it is
 * the same feed on the Unread and Subscriptions tabs. Both controls belong to
 * the reader's own feed, so they are shown on both personal filters and hidden
 * only on the network-wide ones (All, Trending), where the feed on screen is
 * not the reader's.
 *
 * "Mark all as read" is disabled rather than unmounted when there is nothing to
 * mark: a control that greys out reads as "all caught up", where one that
 * disappears the moment you use it reads as broken.
 */

import type { LatestFilter } from "#/integrations/tanstack-query/api-feed.functions";

/** Filters that show the reader's own feed rather than the whole network. */
const PERSONAL_FILTERS = new Set<LatestFilter>(["unread", "subscriptions"]);

export interface LatestControlsState {
  signedIn: boolean;
  filter: LatestFilter;
  /** "Track reading history" preference — read state is meaningless when off. */
  trackReading: boolean;
  /** Tab counts have not resolved yet, so the unread total is unknown. */
  countsPending: boolean;
  unreadCount: number;
}

export interface LatestControlsVisibility {
  showRssFeed: boolean;
  showMarkAllRead: boolean;
  markAllReadDisabled: boolean;
}

export function latestControlsVisibility({
  signedIn,
  filter,
  trackReading,
  countsPending,
  unreadCount,
}: LatestControlsState): LatestControlsVisibility {
  const personalFeed = signedIn && PERSONAL_FILTERS.has(filter);

  return {
    showRssFeed: personalFeed,
    showMarkAllRead: personalFeed && trackReading,
    markAllReadDisabled: countsPending || unreadCount === 0,
  };
}
