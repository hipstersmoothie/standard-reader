/**
 * Author-profile tab visibility.
 *
 * Two independent controls, both stored on the profile owner's `user` row and
 * applied for every viewer:
 *
 * - `profile_hidden_tabs` — default-visible tabs the owner has opted OUT of. A
 *   comma-separated list of {@link HideableTabId} (`null`/empty = none hidden).
 * - `profile_show_likes` — the "Recommendations" tab (id `likes`) is opt-IN:
 *   hidden by default and only shown when the owner explicitly enables it.
 */
import { z } from "zod";

/** Every profile tab id, including the opt-in "likes" tab. */
export const PROFILE_TAB_IDS = [
  "posts",
  "publications",
  "subscriptions",
  "readers",
  "lists",
  "likes",
] as const;

export const profileTabIdSchema = z.enum(PROFILE_TAB_IDS);

export type ProfileTabId = (typeof PROFILE_TAB_IDS)[number];

/**
 * Tabs shown by default that the owner can opt out of (stored in
 * `profile_hidden_tabs`). Excludes "likes", which is opt-in via
 * `profile_show_likes`.
 */
export const HIDEABLE_TAB_IDS = [
  "posts",
  "publications",
  "subscriptions",
  "readers",
  "lists",
] as const;

export const hideableTabIdSchema = z.enum(HIDEABLE_TAB_IDS);

export type HideableTabId = (typeof HIDEABLE_TAB_IDS)[number];

export const PROFILE_TAB_LABELS: Record<ProfileTabId, string> = {
  posts: "Posts",
  publications: "Publications",
  subscriptions: "Subscriptions",
  readers: "Readers",
  lists: "Lists",
  likes: "Recommendations",
};

const HIDEABLE_TAB_ID_SET = new Set<string>(HIDEABLE_TAB_IDS);

function isHideableTabId(value: string): value is HideableTabId {
  return HIDEABLE_TAB_ID_SET.has(value);
}

/** Parse the DB column into a canonically-ordered, de-duplicated tab list. */
export function parseHiddenTabs(
  dbValue: string | null | undefined,
): Array<HideableTabId> {
  if (!dbValue) return [];
  const seen = new Set<HideableTabId>();
  for (const part of dbValue.split(",")) {
    const id = part.trim();
    if (isHideableTabId(id)) seen.add(id);
  }
  return HIDEABLE_TAB_IDS.filter((id) => seen.has(id));
}

/** Encode hidden tabs for storage; `null` when nothing is hidden. */
export function hiddenTabsToDbValue(
  hidden: ReadonlyArray<HideableTabId>,
): string | null {
  const ordered = HIDEABLE_TAB_IDS.filter((id) => hidden.includes(id));
  return ordered.length > 0 ? ordered.join(",") : null;
}
