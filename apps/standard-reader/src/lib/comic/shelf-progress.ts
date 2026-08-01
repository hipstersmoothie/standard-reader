/**
 * Where a reader is inside a comic issue, and therefore what its cover does.
 *
 * An issue on the shelf is a run of page documents, so it is unread while any
 * one of those pages is — half of issue 3 is not issue 3 — and opening it means
 * going to the first page the reader hasn't seen, not back to the cover.
 *
 * The server sends the unread pages it knows about (`ComicShelfIssue.unreadPages`),
 * but a reader who has just walked those pages in the comic reader is ahead of
 * it: `read` records are written to the PDS and reach the read model through the
 * firehose, so the shelf's copy is a beat behind for as long as that takes.
 * `isStillUnread` is how the caller folds this session's own reads back in — the
 * same correction every other unread dot in the app makes
 * (`isArticleUnreadForReader`).
 */

import type { ComicShelfIssue, ComicUnreadPage } from "#/server/reader/comic";

export interface ComicIssueProgress {
  /** 1-based page across the publication that this cover opens on. */
  startPage: number;
  /** Any page of this issue still waiting to be read. */
  unread: boolean;
  /** How many of its pages those are — 0 once the issue has been read through. */
  unreadCount: number;
}

/**
 * Read position for one shelf issue.
 *
 * `unreadPages` arrives in reading order, so the first one that survives the
 * caller's check is the page the reader is owed. An issue with nothing left
 * opens where it always did, on its own first page: a reader clicking a cover
 * they have already read is going back to re-read it.
 */
export function comicIssueProgress(
  issue: Pick<ComicShelfIssue, "pageOffset" | "unreadPages">,
  isStillUnread: (page: ComicUnreadPage) => boolean = () => true,
): ComicIssueProgress {
  const remaining = issue.unreadPages.filter((page) => isStillUnread(page));
  const first = remaining[0];
  return {
    startPage: (first?.pageOffset ?? issue.pageOffset) + 1,
    unread: remaining.length > 0,
    unreadCount: remaining.length,
  };
}
