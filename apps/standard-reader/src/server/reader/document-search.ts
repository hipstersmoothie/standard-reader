import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

import type { Schema } from "#/integrations/tanstack-query/api-shapes";

/**
 * Relevance ranking for article search.
 *
 * Article results used to come back strictly newest-first — the `search_vector`
 * carried A/B/C weights but nothing ever called `ts_rank` on it, so searching a
 * title you already knew buried it under every newer document that happened to
 * mention the same words. Ranking is cheap for a selective query (the bitmap
 * heap scan already fetches the whole match set), so the fix is to rank; the
 * pool caps below exist because the *match set* is what gets expensive, not the
 * ranking.
 */

/**
 * How many rows each arm of the candidate pool is willing to fetch.
 *
 * A bare `LIMIT` short-circuits the bitmap heap scan, which is the only bound
 * Postgres offers here — measured at ~0.55 ms/row, so the caps put a ceiling of
 * roughly 500 ms on a query that would otherwise walk 100k+ rows (`q=ai` took
 * 16 s). A selective query never reaches a cap and is ranked in full.
 *
 * Title matches get their own arm rather than sharing one pool: an unordered
 * sample of a large *body* match set can contain almost no title hits, which is
 * exactly where ranking has to be good.
 */
export const TITLE_POOL_CAP = 400;
export const BODY_POOL_CAP = 400;
export const AUTHOR_POOL_CAP = 100;
/** Past this offset there is nothing left to page — the pool is exhausted. */
export const SEARCH_POOL_CAP = TITLE_POOL_CAP + BODY_POOL_CAP + AUTHOR_POOL_CAP;

/**
 * Whether to rank article results, or fall back to the previous newest-first
 * ordering.
 *
 * The ranked path's title arm is only affordable once
 * `documents_meta_search_idx` exists — without it the expression match is a
 * sequential scan of every document. Set `SEARCH_RANKING=legacy` to fall back
 * without a deploy while the index is being built out of band. Remove this once
 * the index is in place everywhere.
 */
export function isSearchRankingEnabled(): boolean {
  return process.env.SEARCH_RANKING !== "legacy";
}

/** More profiles than this matching a plain-text query means it isn't a name. */
export const NAME_MATCH_AMBIGUITY_CAP = 5;

/**
 * The title/description/tags half of `documents.search_vector` — the same
 * lexemes and weights as its first three arms, minus the weight-C body text.
 *
 * Ranking this rather than `search_vector` is what makes ranking affordable:
 * `search_vector` is TOASTed for any real article, so `ts_rank` over it costs a
 * de-TOAST per row, while title + description + tags stay inline.
 *
 * Backed by the expression index in `drizzle/0044_document_meta_search_idx.sql`.
 * The query has to repeat the expression *verbatim* for the planner to match
 * it, which is why both the query and the DDL are rendered from this one
 * function — see the drift guard in `document-search.test.ts`.
 */
export function documentMetaVectorSql(
  title: SQL,
  description: SQL,
  tags: SQL,
): SQL {
  return sql`setweight(to_tsvector('english', coalesce(${title}, '')), 'A') || setweight(to_tsvector('english', coalesce(${description}, '')), 'B') || setweight(to_tsvector('english', coalesce(immutable_array_to_string(${tags}), '')), 'B')`;
}

/** The meta vector over a `documents` reference, for use in a query. */
export function documentMetaVectorFor(cols: {
  title: SQL;
  description: SQL;
  tags: SQL;
}): SQL {
  return documentMetaVectorSql(cols.title, cols.description, cols.tags);
}

/** The meta vector over bare column names — exactly what the migration indexes. */
export function documentMetaVectorDdl(): SQL {
  return documentMetaVectorSql(
    sql.raw("title"),
    sql.raw("description"),
    sql.raw("tags"),
  );
}

export interface SearchQueryShape {
  /** The trimmed query. */
  query: string;
  /** Whitespace/punctuation-separated token count. */
  tokenCount: number;
  /**
   * Whether phrase scoring applies. For a single token `phraseto_tsquery`
   * degenerates to `websearch_to_tsquery`, so the phrase tiers would fire on
   * every match and flatten the ranking instead of sharpening it.
   */
  isMultiToken: boolean;
}

export function searchQueryShape(input: string): SearchQueryShape {
  const query = input.trim();
  const tokenCount = query.split(/[\s\p{P}]+/u).filter(Boolean).length;
  return { isMultiToken: tokenCount > 1, query, tokenCount };
}

/**
 * Whether to fold an author's documents into the results.
 *
 * A handle-shaped query names one account, so it always arms. Plain text only
 * arms when it resolves to a handful of profiles: otherwise searching "art"
 * pulled in every document by every profile whose name contained "art", which
 * both polluted the results and ate the pool budget that real text matches
 * needed. Those writers now surface in the People section instead.
 */
export function shouldUseAuthorArm(
  hasHandleHint: boolean,
  profileMatchCount: number,
): boolean {
  if (profileMatchCount === 0) return false;
  if (hasHandleHint) return true;
  return profileMatchCount <= NAME_MATCH_AMBIGUITY_CAP;
}

export interface DocumentScoreInput {
  /** Columns carried through the candidate pool. */
  title: SQL;
  metaVector: SQL;
  /** `websearch_to_tsquery` — the matcher. */
  tsq: SQL;
  /** `phraseto_tsquery`, or null for a single-token query. */
  phrase: SQL | null;
  /** Unstemmed `phraseto_tsquery('simple', …)`, or null for a single token. */
  simplePhrase: SQL | null;
  /** The trimmed query, for the literal title tests. */
  exact: string;
  /** Author DIDs / publication URIs, when the author arm is armed. */
  authorDids: Array<string>;
  authorPubUris: Array<string>;
  did: SQL;
  publicationUri: SQL;
}

/**
 * Match quality as an ordered tier, highest first. Tiers rather than a blended
 * score because there are no magic constants to balance and the top tier lands
 * on a span attribute, so a bad result is debuggable.
 *
 * 7/6/5/4 all test the query *as a whole*, in order; 3 is "all terms, somewhere
 * in the title/description/tags"; 0 is a body-only match. Tier 5 uses the
 * unstemmed `simple` dictionary, so an exact word form ("Making") outranks a
 * stemmed variant ("makes") — the third thing the bug report asked for.
 *
 * Tier-0 rows all score `meta_rank = 0`, so the tail of the list keeps today's
 * `published_at DESC, uri DESC` order exactly. Only a ranked head is prepended.
 */
export function documentTierSql(input: DocumentScoreInput): SQL {
  const arms: Array<SQL> = [
    sql`when lower(btrim(${input.title})) = lower(btrim(${input.exact})) then 7`,
    sql`when position(lower(${input.exact}) in lower(${input.title})) > 0 then 6`,
  ];
  if (input.simplePhrase) {
    arms.push(
      sql`when to_tsvector('simple', coalesce(${input.title}, '')) @@ ${input.simplePhrase} then 5`,
    );
  }
  if (input.phrase) {
    arms.push(sql`when ${input.metaVector} @@ ${input.phrase} then 4`);
  }
  arms.push(sql`when ${input.metaVector} @@ ${input.tsq} then 3`);

  const authorArms: Array<SQL> = [];
  // `in`, not `= any(...)`: Drizzle expands a JS array in a template into a
  // parenthesised tuple (`($1, $2)`), which `in` takes and `any()` rejects as a
  // syntax error. These arms are only built when an author matched, so
  // `searchDocuments` 500'd for exactly the queries that matched a handle or
  // display name ("reader" did; "atproto" did not) and looked fine otherwise.
  if (input.authorDids.length > 0) {
    authorArms.push(sql`${input.did} in ${input.authorDids}`);
  }
  if (input.authorPubUris.length > 0) {
    authorArms.push(sql`${input.publicationUri} in ${input.authorPubUris}`);
  }
  if (authorArms.length > 0) {
    arms.push(sql`when ${sql.join(authorArms, sql` or `)} then 1`);
  }

  return sql`case ${sql.join(arms, sql` `)} else 0 end`;
}

/**
 * Relevance within a tier. Normalization 32 (`rank/(rank+1)`) bounds the value
 * to [0,1); it's monotonic, so it doesn't reorder text matches — it just keeps
 * the number comparable across tiers. Weights are `{D, C, B, A}`: title 1.0,
 * description/tags 0.4, body ~0 (the meta vector has no body arm anyway).
 */
export function documentMetaRankSql(metaVector: SQL, tsq: SQL): SQL {
  return sql`ts_rank('{0.05,0.1,0.4,1.0}'::float4[], ${metaVector}, ${tsq}, 32)`;
}

/** Column references for the `documents` table, for the helpers above. */
export function documentSearchCols(d: Schema["documents"]) {
  return {
    description: sql`${d.description}`,
    did: sql`${d.did}`,
    publicationUri: sql`${d.publicationUri}`,
    tags: sql`${d.tags}`,
    title: sql`${d.title}`,
  };
}
