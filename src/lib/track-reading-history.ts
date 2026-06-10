/**
 * "Track reading history" preference — when off, the app does not write
 * `app.standard-reader.read` records and treats every article as read for
 * unread dots, counts, and filters.
 *
 * Persisted as `on | off` in the `standard-reader-track-history` cookie (SSR for
 * everyone). Signed-in users also store it on `user.track_reading_history`
 * (`null` = on, the default; `false` = off).
 */

export const DEFAULT_TRACK_READING_HISTORY = true;

export const TRACK_READING_HISTORY_COOKIE = "standard-reader-track-history";

export const TRACK_READING_HISTORY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseTrackReadingHistoryCookie(value: unknown): boolean {
  if (value === "off") return false;
  return DEFAULT_TRACK_READING_HISTORY;
}

export function trackReadingHistoryToCookieValue(
  enabled: boolean,
): "on" | "off" {
  return enabled ? "on" : "off";
}

export function trackReadingHistoryToDbValue(enabled: boolean): false | null {
  return enabled ? null : false;
}

export function dbValueToTrackReadingHistory(
  value: boolean | null | undefined,
): boolean {
  return value !== false;
}
