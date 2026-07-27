/**
 * "Count old posts as unread" preference — controls whether a source's back
 * catalogue counts as unread the moment you subscribe.
 *
 * Unread state is the *absence* of an `app.standard-reader.read` record, so
 * subscribing to a publication (or following a user) makes its entire history
 * count as unread. When this preference is off, posts published *before* you
 * subscribed to their source are suppressed from unread dots and counts — but
 * they are **not** marked read (no read records are written), so turning the
 * preference back on restores every dot. Posts published after you subscribed
 * are unaffected.
 *
 * Persisted as `on | off` in the `standard-reader-count-old-unread` cookie (SSR
 * for everyone). Signed-in users also store it on `user.count_old_posts_as_unread`
 * (`null` = off, the default for new users — they only see posts published after
 * they subscribe as new; `true` = on, backfilled for every user that existed
 * before this preference shipped so their current everything-unread behaviour is
 * preserved).
 */

export const DEFAULT_COUNT_OLD_POSTS_AS_UNREAD = false;

export const COUNT_OLD_POSTS_AS_UNREAD_COOKIE =
  "standard-reader-count-old-unread";

export const COUNT_OLD_POSTS_AS_UNREAD_COOKIE_MAX_AGE_SECONDS =
  60 * 60 * 24 * 365;

export function parseCountOldPostsAsUnreadCookie(value: unknown): boolean {
  if (value === "on") return true;
  return DEFAULT_COUNT_OLD_POSTS_AS_UNREAD;
}

export function countOldPostsAsUnreadToCookieValue(
  enabled: boolean,
): "on" | "off" {
  return enabled ? "on" : "off";
}

export function countOldPostsAsUnreadToDbValue(enabled: boolean): boolean {
  return enabled;
}

export function dbValueToCountOldPostsAsUnread(
  value: boolean | null | undefined,
): boolean {
  return value === true;
}
