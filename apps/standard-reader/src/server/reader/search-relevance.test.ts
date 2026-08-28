/**
 * Gated relevance fixtures for article search.
 *
 * NOT run by `pnpm test` or CI — like `queries.explain.test.ts`, this needs a
 * `DATABASE_URL` pointing at prod-scale data, because "does the right article
 * come first" is only a meaningful question against the real corpus. Opt in
 * with `FEED_PERF_TEST=1` (`pnpm perf:explain` runs both specs).
 *
 * These are the cases the ranking exists for. The first one is the bug report
 * that prompted it: searching a title you already know used to bury it under
 * every newer document that happened to contain the same five stems, because
 * results were ordered `published_at DESC` and never ranked at all.
 *
 * Assertions are "in the top 3", not "first". The corpus grows every day and a
 * near-duplicate crosspost legitimately outranking the original should not turn
 * this suite red.
 */
import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "#/db";
import {
  BODY_POOL_CAP,
  documentMetaRankSql,
  documentMetaVectorSql,
  documentTierSql,
  searchQueryShape,
  TITLE_POOL_CAP,
} from "#/server/reader/document-search";

const RUN = process.env.FEED_PERF_TEST === "1";
const TOP_N = 3;

interface RelevanceCase {
  /** What the reader typed. */
  q: string;
  /** The document that must come back near the top. */
  uri: string;
  why: string;
}

const RELEVANCE_CASES: Array<RelevanceCase> = [
  {
    q: "Making Feeds: Custom Logic Requests",
    uri: "at://did:plc:6i6n57nrkq6xavqbdo6bvkqr/site.standard.document/3mh2emfart22s",
    why: "the reported bug — an exact title, published 2026-03-14, behind 150 newer body matches",
  },
  {
    q: "custom logic requests",
    uri: "at://did:plc:6i6n57nrkq6xavqbdo6bvkqr/site.standard.document/3mh2emfart22s",
    why: "a partial title still has to find it",
  },
];

/** The ranked page, mirroring `searchArticles`' pool + tier ordering. */
function rankedSearchSql(query: string): SQL {
  const shape = searchQueryShape(query);
  const tsq = sql`websearch_to_tsquery('english', ${query})`;
  const phrase = shape.isMultiToken
    ? sql`phraseto_tsquery('english', ${query})`
    : null;
  const simplePhrase = shape.isMultiToken
    ? sql`phraseto_tsquery('simple', ${query})`
    : null;
  const meta = documentMetaVectorSql(
    sql`d.title`,
    sql`d.description`,
    sql`d.tags`,
  );
  const pooledMeta = documentMetaVectorSql(
    sql`pool.title`,
    sql`pool.description`,
    sql`pool.tags`,
  );
  const tier = documentTierSql({
    authorDids: [],
    authorPubUris: [],
    did: sql`pool.did`,
    exact: shape.query,
    metaVector: pooledMeta,
    phrase,
    publicationUri: sql`pool.publication_uri`,
    simplePhrase,
    title: sql`pool.title`,
    tsq,
  });

  return sql`
    select pool.uri, pool.title
    from (
      (select d.uri, d.title, d.description, d.tags, d.did, d.publication_uri, d.published_at
       from documents d
       where d.deleted = false and (${meta}) @@ ${tsq}
       limit ${sql.raw(String(TITLE_POOL_CAP))})
      union
      (select d.uri, d.title, d.description, d.tags, d.did, d.publication_uri, d.published_at
       from documents d
       where d.deleted = false and d.search_vector @@ ${tsq}
       limit ${sql.raw(String(BODY_POOL_CAP))})
    ) pool
    order by (${tier}) desc,
             ${documentMetaRankSql(pooledMeta, tsq)} desc,
             pool.published_at desc, pool.uri desc
    limit ${sql.raw(String(TOP_N))}
  `;
}

async function topResults(
  query: string,
): Promise<Array<{ uri: string; title: string }>> {
  const result = await db.execute(rankedSearchSql(query));
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<unknown> }).rows ?? []);
  return rows as Array<{ uri: string; title: string }>;
}

describe.skipIf(!RUN)("article search — relevance", () => {
  test.each(RELEVANCE_CASES)(
    "$q finds its article ($why)",
    async ({ q, uri }) => {
      const rows = await topResults(q);
      const uris = rows.map((row) => row.uri);

      if (!uris.includes(uri)) {
        expect.fail(
          `Expected ${uri} in the top ${TOP_N} for "${q}", got:\n` +
            rows
              .map((row, i) => `  ${i + 1}. ${row.title} — ${row.uri}`)
              .join("\n"),
        );
      }
    },
    30_000,
  );

  test("a broad query still returns a full page", async () => {
    // No expected top result — "ai" has no single right answer. This only
    // guards that the pool caps didn't starve the page.
    const rows = await topResults("ai");
    expect(rows.length).toBe(TOP_N);
  }, 30_000);
});
