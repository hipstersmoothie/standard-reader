/**
 * Tunable constants and helpers for the trending discovery engine.
 *
 * Scores are precomputed on the recompute cron pass and cached on rows;
 * rail reads only ORDER BY + diversity caps.
 */

import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";

/** Gravity-style half-life for time-decay (hours). */
export const HALF_LIFE_HOURS = 30;

/** Only articles published within this many days are trending-eligible. */
export const TRENDING_MAX_AGE_DAYS = 4;

/** Publication-level velocity windows (days). */
export const PUBLICATION_RECENT_WINDOW_DAYS = 7;
export const PUBLICATION_PRIOR_WINDOW_DAYS = 7;

/** Article-level velocity windows (hours) — fits inside the 4-day gate. */
export const ARTICLE_RECENT_WINDOW_HOURS = 24;
export const ARTICLE_PRIOR_WINDOW_HOURS = 24;

/** Blend weights for publication trending (after z-score normalization). */
export const PUBLICATION_BLEND = {
  documents: 1.5,
  subscribers: 1,
  recommends: 1,
  backlinks: 0.75,
  velocity: 1.25,
} as const;

/** Blend weights for article trending (after z-score normalization). */
export const ARTICLE_BLEND = {
  recommends: 1.5,
  recommendVelocity: 1,
  freshness: 1,
  backlinks: 1,
  backlinkVelocity: 0.75,
  parentPublication: 0.5,
} as const;

/** Minimum distinct recommenders (excluding self) for an article to trend. */
export const MIN_ARTICLE_RECOMMENDERS = 2;

/** Max articles from the same publication in one rail. */
export const MAX_PER_PUBLICATION = 1;

/** Max articles from the same authoring repo DID in one rail. */
export const MAX_PER_AUTHOR = 1;

/** Constellation backlink sync: max concurrent HTTP requests. */
export const BACKLINK_SYNC_CONCURRENCY = 16;

/**
 * Pool multiplier for rail reads — fetch extra rows so diversity caps can
 * still fill the rail.
 */
export const TRENDING_POOL_MULTIPLIER = 8;

/** SQL interval literal for the recency gate. */
export function trendingMaxAgeIntervalSql(): string {
  return `'${TRENDING_MAX_AGE_DAYS} days'`;
}

/** Half-life decay weight: exp(-ln(2) * age_hours / HALF_LIFE_HOURS). */
export function decayWeightSql(ageHoursExpr: string): string {
  return `exp(-ln(2) * (${ageHoursExpr}) / ${HALF_LIFE_HOURS}.0)`;
}

/** Freshness score from published_at (newer = higher). */
export function freshnessFromPublishedAtSql(publishedAtCol: string): string {
  const ageHours = `extract(epoch from (now() - ${publishedAtCol})) / 3600.0`;
  return decayWeightSql(ageHours);
}

/**
 * Apply per-publication and per-author diversity caps over a score-ordered list.
 */
export function applyTrendingDiversityCaps<
  T extends Pick<ArticleCard, "uri" | "publicationUri" | "did">,
>(articles: Array<T>, limit: number): Array<T> {
  const result: Array<T> = [];
  const pubCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();

  for (const article of articles) {
    if (result.length >= limit) break;

    const pubKey = article.publicationUri ?? article.uri;
    const pubCount = pubCounts.get(pubKey) ?? 0;
    const authorCount = authorCounts.get(article.did) ?? 0;

    if (pubCount >= MAX_PER_PUBLICATION || authorCount >= MAX_PER_AUTHOR) {
      continue;
    }

    result.push(article);
    pubCounts.set(pubKey, pubCount + 1);
    authorCounts.set(article.did, authorCount + 1);
  }

  return result;
}

/** Fetch pool size for diversity-capped rails. */
export function trendingFetchPoolSize(limit: number): number {
  // Full-page trending needs a larger pool so per-pub caps can still fill the list.
  const multiplier = limit > 10 ? 20 : TRENDING_POOL_MULTIPLIER;
  return Math.max(limit * multiplier, limit + 24);
}
