import type { Formatters } from "./formatters";

/**
 * Sidebar unread badge — full count through 999, compact k from 1,000+.
 *
 * Takes the caller's `Formatters` bundle (from `useFormatters()`) rather than
 * binding `en-US`, so digits and the compact suffix follow the reader's
 * language. SSR and client agree because the locale is resolved per request.
 */
export function formatSidebarUnreadCount(
  fmt: Formatters,
  count: number,
): string {
  if (count < 1000) return fmt.number(count);
  return fmt.compactNumber(count);
}
