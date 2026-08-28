/**
 * Tunable constants and helpers for the trending discovery engine.
 *
 * Scores are precomputed on the recompute cron pass and cached on rows;
 * rail reads only ORDER BY + diversity caps.
 */

import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";

/**
 * Gravity-style half-life for the standalone freshness TERM (hours).
 *
 * Sharp on purpose: this term's whole job is "posted just now", and it carries
 * its own {@link ARTICLE_BLEND} weight so a brand-new article with thin
 * engagement can still chart. It is NOT the curve engagement is aged by — see
 * {@link ENGAGEMENT_HALF_LIFE_HOURS}.
 */
export const HALF_LIFE_HOURS = 30;

/**
 * Half-life for ageing an article's accumulated engagement (recommends,
 * backlinks) by the article's own age — one full window, so an article at the
 * far edge of the {@link TRENDING_MAX_AGE_DAYS} gate keeps half its engagement
 * rather than a tenth of it.
 *
 * Deliberately much gentler than {@link HALF_LIFE_HOURS}. Age already enters the
 * blend through the standalone freshness term, so reusing the sharp 30h curve
 * here applies it twice: at 30h a 4-day-old article's engagement is scaled to
 * 0.11 and then penalised again for being old. Decay is meant to break ties
 * between comparably-liked articles, not to overrule the engagement itself.
 */
export const ENGAGEMENT_HALF_LIFE_HOURS = 96;

/**
 * Half-life for the weekly "week in review" ranking — one full 7-day window, so
 * a Monday article reaches Friday's cut holding half its score.
 *
 * Applied to the ARTICLE's age, not to each like's: the whole week score fades
 * together as the document ages. Gentler than
 * {@link ENGAGEMENT_HALF_LIFE_HOURS} because it ranks over a longer window —
 * both follow the same rule, half-life = the window being ranked, which keeps
 * the spread across that window at 2× and leaves the ordering driven by what
 * readers actually did. Used by {@link weekInReviewArticles}.
 */
export const WEEK_HALF_LIFE_HOURS = 168;

/** Weight on Bluesky backlinks relative to a distinct liker in the week score. */
export const WEEK_BACKLINK_WEIGHT = 1.5;

/** Only articles published within this many days are trending-eligible. */
export const TRENDING_MAX_AGE_DAYS = 4;

/**
 * How far back the Constellation backlink sync refreshes
 * `documents.backlink_count`.
 *
 * Deliberately WIDER than {@link TRENDING_MAX_AGE_DAYS}: the week-in-review
 * ranking (weekly Bluesky thread + weekly digest) scores over 7 days and reads
 * `backlink_count` for every article in that window. When the sync only covered
 * the 4-day discover slice, an article's backlink total froze the moment it aged
 * out — so days 5-7 were scored on numbers that had stopped moving while their
 * likes kept accruing, quietly favouring newer articles. Keep this >= the
 * window any consumer passes as `sinceDays` (`HOT_WINDOW_DAYS`,
 * `DIGEST_WINDOW_DAYS`); `trending-scoring.test.ts` locks that invariant.
 */
export const BACKLINK_SYNC_MAX_AGE_DAYS = 7;

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

/** Half-life decay weight: exp(-ln(2) * age_hours / halfLifeHours). */
export function halfLifeDecaySql(
  ageHoursExpr: string,
  halfLifeHours: number,
): string {
  return `exp(-ln(2) * (${ageHoursExpr}) / ${halfLifeHours}.0)`;
}

/** Half-life decay weight at the trending half-life (30h). */
export function decayWeightSql(ageHoursExpr: string): string {
  return halfLifeDecaySql(ageHoursExpr, HALF_LIFE_HOURS);
}

/** Age of an article in fractional hours, as SQL. */
export function articleAgeHoursSql(publishedAtCol: string): string {
  return `extract(epoch from (now() - ${publishedAtCol})) / 3600.0`;
}

/** Freshness score from published_at (newer = higher), at the sharp 30h curve. */
export function freshnessFromPublishedAtSql(publishedAtCol: string): string {
  return decayWeightSql(articleAgeHoursSql(publishedAtCol));
}

/**
 * Weight an article's accumulated engagement by its own age, at the gentle
 * {@link ENGAGEMENT_HALF_LIFE_HOURS} curve.
 */
export function engagementDecayFromPublishedAtSql(
  publishedAtCol: string,
): string {
  return halfLifeDecaySql(
    articleAgeHoursSql(publishedAtCol),
    ENGAGEMENT_HALF_LIFE_HOURS,
  );
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
