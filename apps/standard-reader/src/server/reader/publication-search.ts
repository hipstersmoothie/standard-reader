import type { SQL } from "drizzle-orm";
import { ilike, or, sql } from "drizzle-orm";

import type { Schema } from "#/integrations/tanstack-query/api-shapes";

/**
 * Shared publication match + rank SQL for the two surfaces that search the
 * publication directory: `/search`'s Publications section
 * (`api-search.functions.ts`) and Discover's directory field
 * (`queries.ts` → `discoverDirectoryPublications`). They used to carry
 * separately hand-tuned weights (0.2/0.15/0.15 vs 0.12/0.1/0.05) that drifted
 * apart; the only real difference between them is which optional arms they
 * match on, so those are options rather than a second copy.
 */

/** How many rows the exact publication count is willing to walk before it says "N+". */
export const PUBLICATION_COUNT_CAP = 200;

export interface PublicationSearchTerms {
  /** `%q%` substring pattern for URL / handle / display-name / topic arms. */
  like: string;
  /** `q%` prefix pattern, matched against the publication name. */
  prefix: string;
  /** The trimmed query, for the exact-name equality test. */
  exact: string;
  /** The matcher. Keeps `websearch_to_tsquery`'s quoted/negated operators. */
  tsq: SQL;
  /**
   * Scoring-only phrase query, or null for a single-token query — where
   * `phraseto_tsquery` degenerates to `tsq` and the phrase tier would fire on
   * every text match, flattening the ranking instead of sharpening it.
   */
  phrase: SQL | null;
  /** Narrower URL match for platform URLs (e.g. `greengale.app/melodic.stream`). */
  urlLike: string | null;
}

export interface PublicationSearchOptions {
  /**
   * Substring pattern to use instead of `%query%`. `/search` passes the
   * publication query hints' pattern, which narrows a platform URL to its slug.
   */
  like?: string;
  urlLike?: string | null;
}

/** True when the query has two or more whitespace/punctuation-separated tokens. */
export function isMultiTokenQuery(query: string): boolean {
  return (
    query
      .trim()
      .split(/[\s\p{P}]+/u)
      .filter(Boolean).length > 1
  );
}

export function publicationSearchTerms(
  query: string,
  { like, urlLike = null }: PublicationSearchOptions = {},
): PublicationSearchTerms {
  const exact = query.trim();
  return {
    exact,
    like: like ?? `%${exact}%`,
    phrase: isMultiTokenQuery(exact)
      ? sql`phraseto_tsquery('english', ${exact})`
      : null,
    prefix: `${exact}%`,
    tsq: sql`websearch_to_tsquery('english', ${exact})`,
    urlLike,
  };
}

export interface PublicationArmOptions {
  /** Discover's coalesced topic expression, matched as a substring when given. */
  effectiveTopicExpr?: SQL | null;
  /** Whether to match the owner's display name (`/search` does; Discover doesn't). */
  matchDisplayName?: boolean;
}

export function publicationSearchMatchSql(
  p: Schema["publications"],
  pr: Schema["profiles"],
  terms: PublicationSearchTerms,
  {
    effectiveTopicExpr = null,
    matchDisplayName = false,
  }: PublicationArmOptions = {},
) {
  const parts = [
    sql`${p.searchVector} @@ ${terms.tsq}`,
    ilike(p.url, terms.like),
    ilike(pr.handle, terms.like),
  ];
  if (matchDisplayName) {
    parts.push(ilike(pr.displayName, terms.like));
  }
  if (effectiveTopicExpr) {
    parts.push(
      sql`lower(btrim(coalesce(${effectiveTopicExpr}, ''))) like lower(${terms.like})`,
    );
  }
  if (terms.urlLike) {
    parts.push(ilike(p.url, terms.urlLike));
  }
  return or(...parts) ?? sql`false`;
}

/**
 * Rank on a single 0–1 scale so the tiers are comparable.
 *
 * The bug this fixes: `ts_rank` without a normalization bitmask returns raw
 * values around 0.05–0.1, so a hardcoded 0.15 handle-substring bonus outranked
 * *every* real full-text match. Normalization 32 (`rank/(rank+1)`) bounds the
 * score to [0,1) — it's monotonic, so it changes nothing about the relative
 * order of text matches — and the `0.30 + 0.50 × rank` remap then lands any
 * text match in [0.30, 0.80), strictly above the substring bonuses (≤ 0.25) and
 * strictly below the exact/phrase/prefix tiers.
 */
export function publicationSearchRankSql(
  p: Schema["publications"],
  pr: Schema["profiles"],
  terms: PublicationSearchTerms,
  {
    effectiveTopicExpr = null,
    matchDisplayName = false,
  }: PublicationArmOptions = {},
) {
  return sql`greatest(
    case when lower(btrim(${p.name})) = lower(btrim(${terms.exact})) then 1.0::real else 0::real end,${
      terms.urlLike
        ? sql`
    case when ${p.url} ilike ${terms.urlLike} then 0.95::real else 0::real end,`
        : sql``
    }${
      terms.phrase
        ? sql`
    case when ${p.searchVector} @@ ${terms.phrase} then 0.9::real else 0::real end,`
        : sql``
    }
    case when ${p.name} ilike ${terms.prefix} then 0.85::real else 0::real end,
    case when ${p.searchVector} @@ ${terms.tsq}
      then 0.3::real + 0.5::real * ts_rank('{0.05,0.1,0.4,1.0}'::float4[], ${p.searchVector}, ${terms.tsq}, 32)
      else 0::real
    end,
    case when ${p.url} ilike ${terms.like} then 0.25::real else 0::real end,
    case when ${pr.handle} ilike ${terms.like} then 0.2::real else 0::real end${
      matchDisplayName
        ? sql`,
    case when ${pr.displayName} ilike ${terms.like} then 0.15::real else 0::real end`
        : sql``
    }${
      effectiveTopicExpr
        ? sql`,
    case when lower(btrim(coalesce(${effectiveTopicExpr}, ''))) like lower(${terms.like}) then 0.1::real else 0::real end`
        : sql``
    }
  )`;
}
