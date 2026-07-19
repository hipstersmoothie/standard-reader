/**
 * Weekly-digest content builder. Pure data assembly (no rendering, no
 * transport) so it runs anywhere the read-model DB is reachable — the ingest
 * worker's send runner, a test, or a dev preview script.
 *
 * "Best of your follows" reuses {@link bestOfFollows} (trending-ranked, diversity
 * capped) and the unfollowed recommendations reuse {@link recommendedPublications}
 * (co-subscription / co-recommend blend, already excludes follows, cold-starts
 * to popular). Mirrors how `src/server/feeds/build.ts` composes cards.
 */

import type {
  ArticleCard,
  Db,
  PublicationCard,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import {
  bestOfFollows,
  recommendedPublications,
  selectFollowUris,
  topNetworkArticles,
} from "#/server/reader/queries";
import { rotationSeed } from "#/server/reader/rail-rotation";

import {
  DIGEST_ARTICLE_LIMIT,
  DIGEST_NETWORK_ARTICLE_LIMIT,
  DIGEST_RECOMMENDATION_LIMIT,
  DIGEST_WINDOW_DAYS,
} from "./config";

export interface DigestData {
  /** Best-of articles from the reader's follows (empty ⇒ nothing to send). */
  articles: Array<ArticleCard>;
  /** Top articles across the whole network this week (excludes `articles`). */
  networkArticles: Array<ArticleCard>;
  /** Trending, not-yet-followed publications to recommend. */
  recommendations: Array<PublicationCard>;
}

/**
 * Assemble the digest for one reader. Builds all three sections; the "skip if
 * there's nothing worth sending" decision (empty `articles`) lives in the send
 * runner, so the preview path can render a complete digest even for readers
 * whose follows were quiet this week.
 */
export async function buildDigestForUser(
  db: Db,
  schema: Schema,
  { did }: { did: string },
): Promise<DigestData> {
  const followUris = await selectFollowUris(db, schema, did);

  const articles = await bestOfFollows(db, schema, {
    publicationUris: followUris,
    sinceDays: DIGEST_WINDOW_DAYS,
    limit: DIGEST_ARTICLE_LIMIT,
    // Don't re-surface articles the reader already opened this week.
    excludeReadForDid: did,
  });

  const [networkArticles, recommendations] = await Promise.all([
    topNetworkArticles(db, schema, {
      sinceDays: DIGEST_WINDOW_DAYS,
      limit: DIGEST_NETWORK_ARTICLE_LIMIT,
      excludeUris: articles.map((a) => a.uri),
      excludeReadForDid: did,
    }),
    recommendedPublications(db, schema, did, DIGEST_RECOMMENDATION_LIMIT, {
      followUris,
      seed: rotationSeed("digest", did),
    }),
  ]);

  return { articles, networkArticles, recommendations };
}
