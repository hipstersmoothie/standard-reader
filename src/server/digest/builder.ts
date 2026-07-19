/**
 * Weekly-digest content builder. Pure data assembly (no rendering, no
 * transport) so it runs anywhere the read-model DB is reachable — the ingest
 * worker's send runner, a test, or a dev preview script.
 *
 * "Best of your follows" reuses {@link bestOfFollows} (trending-ranked, diversity
 * capped) and the unfollowed recommendations reuse {@link recommendedPublications}
 * (co-subscription / co-recommend blend, already excludes follows, cold-starts
 * to popular). "Saved for later" reuses {@link savedForLater} (the reader's most
 * recent bookmarks). Mirrors how `src/server/feeds/build.ts` composes cards.
 *
 * "Top on the network" reuses {@link weekInReviewArticles} — the same ranking the
 * weekly Bluesky thread posts, so both weekly surfaces agree on what the week's
 * biggest articles were. It scores engagement live rather than reading
 * `trending_score`, which is only recomputed for the 4-day discover slice and so
 * goes stale across days 5–7 of this section's 7-day window.
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
  savedForLater,
  selectFollowUris,
  weekInReviewArticles,
} from "#/server/reader/queries";
import { rotationSeed } from "#/server/reader/rail-rotation";

import {
  DIGEST_ARTICLE_LIMIT,
  DIGEST_NETWORK_ARTICLE_LIMIT,
  DIGEST_RECOMMENDATION_LIMIT,
  DIGEST_SAVED_LIMIT,
  DIGEST_WINDOW_DAYS,
} from "./config";

export interface DigestData {
  /** Best-of articles from the reader's follows (empty ⇒ nothing to send). */
  articles: Array<ArticleCard>;
  /** Top articles across the whole network this week (excludes `articles`). */
  networkArticles: Array<ArticleCard>;
  /** The reader's most recently saved-for-later articles (bookmarks). */
  saved: Array<ArticleCard>;
  /** Trending, not-yet-followed publications to recommend. */
  recommendations: Array<PublicationCard>;
}

/**
 * Which sections to include in a reader's digest. Each maps to a `null`-able
 * `weeklyDigestSection*` opt-out column on `user` (`null`/`true` = included).
 */
export interface DigestSections {
  subscriptions: boolean;
  network: boolean;
  saved: boolean;
  recommendations: boolean;
}

/** Every section on — the default when a reader has expressed no preference. */
export const ALL_DIGEST_SECTIONS: DigestSections = {
  subscriptions: true,
  network: true,
  saved: true,
  recommendations: true,
};

/** A `null`-able opt-out column resolves to on unless it's explicitly `false`. */
function sectionEnabled(value: boolean | null | undefined): boolean {
  return value !== false;
}

/**
 * Resolve the four `weeklyDigestSection*` opt-out columns into a
 * {@link DigestSections} (each defaults to on).
 */
export function digestSectionsFromUser(row: {
  weeklyDigestSectionSubscriptions?: boolean | null;
  weeklyDigestSectionNetwork?: boolean | null;
  weeklyDigestSectionSaved?: boolean | null;
  weeklyDigestSectionRecommendations?: boolean | null;
}): DigestSections {
  return {
    subscriptions: sectionEnabled(row.weeklyDigestSectionSubscriptions),
    network: sectionEnabled(row.weeklyDigestSectionNetwork),
    saved: sectionEnabled(row.weeklyDigestSectionSaved),
    recommendations: sectionEnabled(row.weeklyDigestSectionRecommendations),
  };
}

/**
 * Assemble the digest for one reader. Builds every enabled section; disabled
 * sections come back empty. The "skip if there's nothing worth sending"
 * decision lives in the send runner, so the preview path can render a complete
 * digest even for readers whose follows were quiet this week.
 */
export async function buildDigestForUser(
  db: Db,
  schema: Schema,
  {
    did,
    sections = ALL_DIGEST_SECTIONS,
  }: { did: string; sections?: DigestSections },
): Promise<DigestData> {
  // Needed by the subscriptions section directly, and by the recommendations
  // section to exclude publications the reader already follows.
  const followUris =
    sections.subscriptions || sections.recommendations
      ? await selectFollowUris(db, schema, did)
      : [];

  const articles = sections.subscriptions
    ? await bestOfFollows(db, schema, {
        publicationUris: followUris,
        sinceDays: DIGEST_WINDOW_DAYS,
        limit: DIGEST_ARTICLE_LIMIT,
        // Don't re-surface articles the reader already opened this week.
        excludeReadForDid: did,
      })
    : [];

  const articleUris = articles.map((a) => a.uri);

  const [networkArticles, saved, recommendations] = await Promise.all([
    sections.network
      ? weekInReviewArticles(db, schema, {
          sinceDays: DIGEST_WINDOW_DAYS,
          limit: DIGEST_NETWORK_ARTICLE_LIMIT,
          excludeUris: articleUris,
          excludeReadForDid: did,
        })
      : Promise.resolve([]),
    sections.saved
      ? savedForLater(db, schema, {
          did,
          limit: DIGEST_SAVED_LIMIT,
          excludeUris: articleUris,
        })
      : Promise.resolve([]),
    sections.recommendations
      ? recommendedPublications(db, schema, did, DIGEST_RECOMMENDATION_LIMIT, {
          followUris,
          seed: rotationSeed("digest", did),
        })
      : Promise.resolve([]),
  ]);

  return { articles, networkArticles, saved, recommendations };
}
