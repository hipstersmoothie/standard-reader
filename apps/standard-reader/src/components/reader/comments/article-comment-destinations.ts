/**
 * Resolves one article into the concrete list of places a reader can comment.
 * Split out of `add-comment-dialog.tsx` so that file only exports components
 * (fast refresh); the client catalog and URL building live in
 * `#/lib/bsky-clients` and `#/lib/comment-destinations`.
 */

import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import type {
  BskyCommentMode,
  CommentDestination,
} from "#/lib/comment-destinations";
import {
  bskyCommentDestinations,
  bskyCommentMode,
  platformCommentUrl,
} from "#/lib/comment-destinations";
import { getPublicUrlClient } from "#/lib/public-url";
import type { PublishingPlatform } from "#/lib/publishing-platform";
import { publishingPlatform } from "#/lib/publishing-platform";

import { articleReaderUrl } from "../format";

export interface ArticleCommentDestinations {
  /** Byline handle mentioned in a composed post, when we know one. */
  authorHandle: string | null;
  /** Whether Bluesky is a reply to the article's post or a fresh post. */
  mode: BskyCommentMode;
  bsky: Array<CommentDestination>;
  platform: { platform: PublishingPlatform; url: string } | null;
}

export function articleCommentDestinations(
  article: ArticleDetail,
): ArticleCommentDestinations {
  const platform = publishingPlatform(article);
  const authorHandle =
    article.contributors[0]?.handle ?? article.publicationOwnerHandle ?? null;

  const bsky = bskyCommentDestinations({
    bskyPostUri: article.bskyPostUri,
    authorHandle,
    readerUrl: articleReaderUrl(article.uri, getPublicUrlClient()),
  });

  const platformUrl = platformCommentUrl(platform, article);

  return {
    authorHandle,
    bsky,
    mode: bskyCommentMode(article.bskyPostUri),
    platform: platform && platformUrl ? { platform, url: platformUrl } : null,
  };
}

/** Whether there's anywhere at all to send a reader who wants to comment. */
export function canAddComment(article: ArticleDetail): boolean {
  const { bsky, platform } = articleCommentDestinations(article);
  return bsky.length > 0 || platform != null;
}
