/**
 * Tunable constants and helpers for the trending discovery engine.
 *
 * Scores are precomputed on the recompute cron pass and cached on rows;
 * rail reads only ORDER BY + diversity caps.
 */

import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";

/** Gravity-style half-life for time-decay (hours). */
export const HALF_LIFE_HOURS = 30;

/**
 * Gentler half-life for the weekly "week in review" thread (~3.5 days). Unlike
 * the 30h trending half-life this lets a heavily-liked early-week article stay
 * competitive with a fresh one, so the Top 5 reflects the whole week rather than
 * just the last day or two. Used by {@link weekInReviewArticles}.
 */
export const WEEK_HALF_LIFE_HOURS = 84;

/** Weight on Bluesky backlinks relative to a decayed like in the week score. */
export const WEEK_BACKLINK_WEIGHT = 1.5;

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

/**
 * Blend weights for article trending, applied to **raw engagement units** — not
 * z-scores.
 *
 * This used to be a z-score blend over every recency-eligible document. That
 * ranked the handful of articles that cleared the recommender floor correctly
 * and told you nothing at all about the rest: the score was a hard `CASE` that
 * collapsed to exactly `0` below the floor, so ~24.6k of the ~24.6k eligible
 * documents tied at zero and fell back to `published_at DESC`. Anywhere the
 * zero-tie was allowed through (the full trending *page*, which dropped the
 * floor entirely) the result read as "a dozen liked articles, then the last four
 * days of everything in publication order" — which is what it literally was.
 *
 * Raw units fix both halves. Every article carrying *any* signal — one like,
 * some Bluesky backlinks — now scores above one carrying none, so the ranking
 * degrades gracefully instead of falling off a cliff; and `trending_score > 0`
 * becomes a meaningful "something engaged with this" predicate that both the
 * rail and the page can gate on. Raw units are also stable pass to pass: a
 * z-score is relative to whatever else happened to be in the 4-day window, so
 * an article's rank moved when *other* articles were published.
 *
 * Units, so the weights are comparable:
 * - `recommends` — multiplies the half-life-decayed count of distinct likers.
 *   One fresh like ≈ 1 point, which is the scale everything else is priced in.
 * - `recommendVelocity` — multiplies (likers in the last 24h − the 24h before),
 *   clamped at 0. A pure accelerator; it never subtracts.
 * - `backlinks` / `backlinkVelocity` — multiply `ln(1 + n)`, so 20 Bluesky
 *   backlinks ≈ 4.6 points rather than 20. Backlinks are cheap and bursty
 *   relative to an in-app like, and they carry no per-event timestamp, so they
 *   are compressed and lean on {@link ARTICLE_FRESHNESS_WEIGHT} for decay.
 * - `parentPublication` — the half-width of a bounded multiplier, NOT an
 *   additive term (see {@link publicationTrendingBoost}). A strong publication
 *   nudges its articles up; a weak one nudges down; neither can zero a score or
 *   flip its sign.
 */
export const ARTICLE_BLEND = {
  recommends: 1,
  recommendVelocity: 0.5,
  backlinks: 1.5,
  backlinkVelocity: 0.75,
  parentPublication: 0.25,
} as const;

/**
 * How much of an article's score publication freshness controls.
 *
 * Article age is a *modulator*, not a multiplier: the score scales between
 * `1 - ARTICLE_FRESHNESS_WEIGHT` (at infinite age) and `1` (brand new). Likes
 * already decay at {@link HALF_LIFE_HOURS} by their own timestamps, so
 * multiplying by an undamped freshness term would decay them twice and make a
 * day-3 article unreachable no matter how well it did — which defeats the point
 * of a 4-day window. At 0.5 a four-day-old article keeps ~55% of its engagement
 * score, enough to stay on the board but not to hold the top of it.
 */
export const ARTICLE_FRESHNESS_WEIGHT = 0.5;

/** Minimum distinct recommenders (excluding self) for an article to trend. */
export const MIN_ARTICLE_RECOMMENDERS = 2;

/**
 * Bluesky backlinks that let an article onto the Trending *rail* without
 * clearing {@link MIN_ARTICLE_RECOMMENDERS}.
 *
 * The rail's like floor treats the in-app recommend as the only real signal, so
 * an article being actively passed around on Bluesky — the thing most
 * `site.standard` articles are actually shared through — was invisible to it
 * until two readers happened to also like it here. Backlinks are noisier per
 * event than a like, hence a higher floor than two.
 */
export const MIN_ARTICLE_BACKLINKS = 5;

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

/** Freshness score from published_at (newer = higher). */
export function freshnessFromPublishedAtSql(publishedAtCol: string): string {
  const ageHours = `extract(epoch from (now() - ${publishedAtCol})) / 3600.0`;
  return decayWeightSql(ageHours);
}

/**
 * Article-age modulator in `[1 - ARTICLE_FRESHNESS_WEIGHT, 1]`.
 *
 * @param freshness half-life decay weight on `published_at`, in `(0, 1]`.
 */
export function articleFreshnessFactor(freshness: number): number {
  const clamped = Math.min(Math.max(freshness, 0), 1);
  return 1 - ARTICLE_FRESHNESS_WEIGHT + ARTICLE_FRESHNESS_WEIGHT * clamped;
}

/**
 * Bounded multiplier from the parent publication's own trending score.
 *
 * `publication_stats.trending_score` is a z-score blend, so it is unbounded and
 * frequently negative — usable as a nudge, dangerous as a factor. Squashing it
 * through `x / (1 + |x|)` maps it into `(-1, 1)`, giving a multiplier strictly
 * inside `[1 - w, 1 + w]`. A publication can therefore reorder its articles
 * against the field but can never zero one out, flip a score negative, or
 * outweigh the engagement the article actually earned.
 */
export function publicationTrendingBoost(publicationScore: number): number {
  const squashed = publicationScore / (1 + Math.abs(publicationScore));
  return 1 + ARTICLE_BLEND.parentPublication * squashed;
}

/** Raw signals behind one article's trending score. */
export interface ArticleTrendingInputs {
  /** Sum of distinct likes, each decayed by its own age at {@link HALF_LIFE_HOURS}. */
  decayedRecommends: number;
  /** Distinct likers in the last 24h minus the 24h before that. */
  recommendVelocity: number;
  /** Constellation Bluesky backlink count. */
  backlinks: number;
  /** Backlinks gained since the previous sync. */
  backlinkVelocity: number;
  /** Half-life decay weight on `published_at`, in `(0, 1]`. */
  freshness: number;
  /** Parent publication's `publication_stats.trending_score` (0 if loose). */
  publicationScore: number;
}

/**
 * Reference implementation of `documents.trending_score`, mirrored in SQL by
 * `recomputeDocumentTrending`. Kept here so the weights, the clamps, and the
 * "no engagement ⇒ exactly 0" contract are all testable without a database, and
 * so the SQL has something to be read against.
 *
 * The contract the read path depends on:
 * - an article with **no** engagement scores exactly `0`;
 * - an article with **any** engagement scores **strictly above** `0`;
 * - the score is non-decreasing in every engagement input.
 *
 * That is what makes `trending_score > 0` a usable predicate — previously it
 * meant "cleared the two-liker floor", so the full trending page had to drop the
 * gate altogether and pad itself out with unengaged articles.
 */
export function articleTrendingScore(inputs: ArticleTrendingInputs): number {
  const engagement =
    ARTICLE_BLEND.recommends * Math.max(inputs.decayedRecommends, 0) +
    ARTICLE_BLEND.recommendVelocity * Math.max(inputs.recommendVelocity, 0) +
    ARTICLE_BLEND.backlinks * Math.log1p(Math.max(inputs.backlinks, 0)) +
    ARTICLE_BLEND.backlinkVelocity *
      Math.log1p(Math.max(inputs.backlinkVelocity, 0));

  if (engagement <= 0) return 0;

  return (
    engagement *
    articleFreshnessFactor(inputs.freshness) *
    publicationTrendingBoost(inputs.publicationScore)
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
