"use client";

import { createContext, useContext } from "react";

/**
 * Whether engagement counts (recommend + comment) may render.
 *
 * This is a context rather than a direct read of the preference query because
 * `primitives.tsx` — where `LikeCount` / `CommentCount` / `ArticleEngagement`
 * live — is shared with the **browser extension**, which renders those
 * components standalone (`extension/src/components/PageChip.tsx`,
 * `PopupArticle.tsx`) with no query client and no app session. Importing
 * `#/lib/use-feed-preferences` there would drag the whole server-fn module —
 * and, through it, `src/db` — into the extension's bundle graph, which fails
 * its build outright on the missing `DATABASE_URL`.
 *
 * So the components take the answer from context, the app supplies it once at
 * the root from `user.hide_feed_metrics`, and any host without a provider — the
 * extension — gets the `true` default and keeps showing counts.
 */
const EngagementCountsVisibleContext = createContext(true);

export const EngagementCountsVisibleProvider =
  EngagementCountsVisibleContext.Provider;

/**
 * Whether to draw engagement counts. Call sites that render their own separator
 * dot beside the counts must gate on this too, or the dot outlives what it was
 * separating.
 */
export function useEngagementCountsVisible(): boolean {
  return useContext(EngagementCountsVisibleContext);
}
