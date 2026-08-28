/**
 * Gated EXPLAIN benchmark for the follow-feed candidate query.
 *
 * NOT run by `pnpm test` or CI. Opt in with `FEED_PERF_TEST=1` (see
 * `pnpm perf:explain`), pointed at a `DATABASE_URL` with prod-scale data —
 * locally that means your `.env` DATABASE_URL pointing at prod Neon (see the
 * memory `railway-neon-region-mismatch`). CI's per-PR Neon branch is empty, so
 * an EXPLAIN there is meaningless (it'd show a trivial seq scan over zero
 * rows); this spec is operator-run, not CI-enforced.
 *
 * What it guards:
 *  - The candidate query must NOT plan a `Seq Scan on documents` (the original
 *    regression: a per-row correlated cutoff subquery defeated the
 *    `documents_published_idx DESC LIMIT` scan). Catches both the original bug
 *    and a future Shape-B-style regression (inlining the recommend `fr`
 *    aggregation across the join → ~30s nested loop).
 *  - Execution time stays under a generous budget (cold Neon starts vary), so
 *    a 1.6s tail is caught without flaking on a slow warm-up.
 *
 * On failure the full plan is printed so the regression is diagnosable without
 * re-running the manual EXPLAIN — see `.claude/skills/investigate-feed-query-perf`.
 */
import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "#/db";
import * as schema from "#/db/schema";
import { NETWORK_DOCUMENT_COUNT_KEY } from "#/db/schema/network-stats";
import {
  BODY_POOL_CAP,
  documentMetaRankSql,
  documentMetaVectorSql,
  TITLE_POOL_CAP,
} from "#/server/reader/document-search";
import {
  buildFollowFeedCandidateSql,
  buildTagOverlapScoresSql,
  countNetworkDocuments,
  countNetworkDocumentsLive,
  selectFollowUris,
  selectFollowedUserDids,
} from "#/server/reader/queries";

const RUN = process.env.FEED_PERF_TEST === "1";
const READER_DID =
  process.env.FEED_PERF_READER_DID ?? "did:plc:m2sjv3wncvsasdapla35hzwj";

/**
 * Generous — Neon cold starts vary — but well under the 1651ms corpus-walk this
 * replaced. The suppressed-old path measures 26-34ms warm once both direct
 * branches ride their per-source composite index.
 */
const EXEC_TIME_BUDGET_MS = Number(process.env.FEED_PERF_EXEC_BUDGET_MS ?? 500);
const PAGE_LIMIT = 22;
const PAGE_OFFSET = 0;

/**
 * Looser than `EXEC_TIME_BUDGET_MS`: the tag scan touches thousands of heap
 * pages, and a cold Neon page store turns a 254ms warm run into ~4.2s (with
 * `dirtied`/`written` counts from first-touch hint bits). The seq-scan and
 * index-usage assertions are the real guard; this only catches gross
 * regressions like the 16.9s original.
 */
const TAG_OVERLAP_BUDGET_MS = Number(
  process.env.FEED_PERF_TAG_BUDGET_MS ?? 6000,
);

/**
 * Looser than {@link EXEC_TIME_BUDGET_MS} because the block branches add real
 * per-row probes, but still far below the corpus-walk this must never become.
 * A blown budget here means the block predicate stopped being index-served.
 */
const BLOCK_FILTER_BUDGET_MS = Number(
  process.env.FEED_PERF_BLOCK_BUDGET_MS ?? 900,
);

describe.skipIf(!RUN)("follow-feed candidate query — EXPLAIN", () => {
  // EXPLAIN ANALYZE runs the query for real over the prod Neon RTT (~230ms),
  // after two follow-fetch round trips — generous timeout to avoid flake.
  test("suppressed-old (countOldPostsAsUnread=false) does not seq-scan documents", async () => {
    const plan = await explainCandidate({
      unreadForDid: READER_DID,
      countOldPostsAsUnread: false,
    });

    assertNoSeqScanOnDocuments(plan);
    assertPerSourceIndexScans(plan);
    assertExecTimeUnder(plan, EXEC_TIME_BUDGET_MS);
  }, 30_000);

  test("no-cutoff path does not seq-scan documents", async () => {
    const plan = await explainCandidate({
      unreadForDid: READER_DID,
      countOldPostsAsUnread: true,
    });

    assertNoSeqScanOnDocuments(plan);
    assertPerSourceIndexScans(plan);
  }, 30_000);
});

/**
 * The block filter on the follow feed.
 *
 * `notBlockedByViewer` is three correlated `NOT EXISTS` evaluated per candidate
 * row, and it lands inside `baseWhere` — the same predicate the strategy note in
 * `queries.ts` warns against adding to, because the per-source laterals depend
 * on an indexed `ORDER BY published_at DESC LIMIT k` scan that a correlated
 * subquery can push off its index. That is exactly the shape of the original
 * 1651ms regression.
 *
 * Two things are asserted, because either alone would pass a broken build:
 *  - With the filter on, the plan still rides the per-source composite indexes
 *    and does not seq-scan `documents`.
 *  - The filter costs little enough that the page budget still holds.
 *
 * Note this is the *worst* case by construction — the reader passed here is
 * treated as having blocks. In production `blockFilterDid` keeps the predicate
 * out of the query entirely for readers who block nobody, which is nearly all
 * of them.
 */
describe.skipIf(!RUN)("follow-feed block filter — EXPLAIN", () => {
  test("block filter does not defeat the per-source index scans", async () => {
    const plan = await explainCandidate({
      unreadForDid: READER_DID,
      countOldPostsAsUnread: true,
      viewerDid: READER_DID,
    });

    assertNoSeqScanOnDocuments(plan);
    assertPerSourceIndexScans(plan);
    assertExecTimeUnder(plan, BLOCK_FILTER_BUDGET_MS);
  }, 30_000);

  test("block filter does not defeat the suppressed-old path either", async () => {
    const plan = await explainCandidate({
      unreadForDid: READER_DID,
      countOldPostsAsUnread: false,
      viewerDid: READER_DID,
    });

    assertNoSeqScanOnDocuments(plan);
    assertPerSourceIndexScans(plan);
    assertExecTimeUnder(plan, BLOCK_FILTER_BUDGET_MS);
  }, 30_000);
});

/**
 * The mute filter on the follow feed — same shape and same hazard as the block
 * filter above: `notMutedByViewer` is up to three correlated `NOT EXISTS`
 * inside `baseWhere`, and it must not push the per-source laterals off their
 * `ORDER BY published_at DESC LIMIT k` index scans. As with blocks this is the
 * worst case by construction — `muteFilterDid` keeps the predicate out of the
 * query for readers who mute nothing.
 */
describe.skipIf(!RUN)("follow-feed mute filter — EXPLAIN", () => {
  test("mute filter does not defeat the per-source index scans", async () => {
    const plan = await explainCandidate({
      unreadForDid: READER_DID,
      countOldPostsAsUnread: true,
      muterDid: READER_DID,
    });

    assertNoSeqScanOnDocuments(plan);
    assertPerSourceIndexScans(plan);
    assertExecTimeUnder(plan, BLOCK_FILTER_BUDGET_MS);
  }, 30_000);

  test("block + mute filters together stay on the index scans", async () => {
    const plan = await explainCandidate({
      unreadForDid: READER_DID,
      countOldPostsAsUnread: true,
      viewerDid: READER_DID,
      muterDid: READER_DID,
    });

    assertNoSeqScanOnDocuments(plan);
    assertPerSourceIndexScans(plan);
    assertExecTimeUnder(plan, BLOCK_FILTER_BUDGET_MS);
  }, 30_000);
});

/**
 * The Latest "All" tab badge. This was a ~1.08s parallel seq scan over every
 * `documents` row on `/latest`'s blocking route loader before it moved to the
 * `network_stats` scalar (`recomputeNetworkStats()`).
 *
 * Requires migration 0031 to have run against the target DB.
 */
describe.skipIf(!RUN)("network document count — EXPLAIN", () => {
  test("badge count is a scalar lookup, not a documents scan", async () => {
    const plan = await explainSql(
      sql`select ${schema.networkStats.value} from ${schema.networkStats}
          where ${schema.networkStats.key} = ${NETWORK_DOCUMENT_COUNT_KEY} limit 1`,
    );

    assertNoSeqScanOnDocuments(plan);
    // A single-row PK lookup. If this ever climbs, the read path fell back to
    // `countNetworkDocumentsLive` (an unseeded `network_stats`) or grew a join.
    assertExecTimeUnder(plan, 50);
  }, 30_000);

  test("the precomputed scalar matches a live count", async () => {
    const [cached, live] = await Promise.all([
      countNetworkDocuments(db, schema),
      countNetworkDocumentsLive(db, schema),
    ]);

    // The sweep refreshes every few minutes, so ingest lands rows in between.
    // A badge total tolerates drift; an order-of-magnitude gap means the two
    // predicates diverged and one of them is now wrong.
    expect(cached).toBeGreaterThan(0);
    expect(Math.abs(cached - live) / live).toBeLessThan(0.02);
  }, 60_000);
});

/**
 * Related-articles tag overlap, on every article page.
 *
 * Before the GIN rewrite this planned a `Seq Scan on documents` over ~3M rows
 * feeding an ~11.8M-row nested loop and a disk-spilling HashAggregate: 16.9s
 * mean, 158.9s max, and 27% of all database time — which starved every other
 * query on the compute, including the feed loaders above.
 */
describe.skipIf(!RUN)("related-articles tag overlap — EXPLAIN", () => {
  test("tag overlap is served by documents_tags_norm_idx, not a scan", async () => {
    const anchor = await selectTagAnchorDocument();
    const plan = await explainSql(
      buildTagOverlapScoresSql(anchor.uri, anchor.publicationUri),
    );

    assertNoSeqScanOnDocuments(plan);
    // Positive assertion too: "no seq scan" alone would also pass if the
    // planner swapped in some other non-indexed shape.
    if (!/Bitmap Index Scan on documents_tags_norm_idx/.test(plan)) {
      expect.fail(
        `Plan does not use documents_tags_norm_idx — the tag predicate was ` +
          `rewritten into a form the GIN index can't match (wrapping ` +
          `\`tags\` in anything other than \`immutable_normalized_tags\` does ` +
          `this). Full plan:\n\n${plan}`,
      );
    }
    assertExecTimeUnder(plan, TAG_OVERLAP_BUDGET_MS);
  }, 30_000);
});

/**
 * A published document with enough tags to make the overlap scan non-trivial.
 * Override with `FEED_PERF_TAG_ANCHOR_URI` to pin a specific known-heavy doc.
 */
async function selectTagAnchorDocument(): Promise<{
  uri: string;
  publicationUri: string | null;
}> {
  const pinned = process.env.FEED_PERF_TAG_ANCHOR_URI;
  const result = await db.execute(
    pinned
      ? sql`select uri, publication_uri from documents where uri = ${pinned}`
      : sql`select uri, publication_uri from documents
            where deleted = false and published_at <= now()
              and cardinality(tags) >= 5
            limit 1`,
  );
  const row = (result.rows as Array<Record<string, unknown>>)[0];
  if (!row) {
    expect.fail(
      "No tagged document found to anchor the tag-overlap EXPLAIN. Point " +
        "DATABASE_URL at prod-scale data, or set FEED_PERF_TAG_ANCHOR_URI.",
    );
  }
  return {
    uri: row["uri"] as string,
    publicationUri: (row["publication_uri"] as string | null) ?? null,
  };
}

/**
 * Article search.
 *
 * Two regressions to guard, both measured on prod before the ranked path
 * landed:
 *  - The title arm must be served by `documents_meta_search_idx`. It matches an
 *    *expression*, so the planner only uses the index when the query repeats
 *    that expression verbatim — and when it stops matching, nothing fails, the
 *    query just degrades to a sequential scan of every document.
 *  - A broad single word matches ~100k documents. Ordering that whole match set
 *    took 16s (`q=ai`); the per-arm pool caps are what bound it, so a plan whose
 *    arms exceed their caps means a LIMIT stopped being an optimization barrier.
 */
const SEARCH_TITLE_QUERY =
  process.env.FEED_PERF_SEARCH_TITLE_QUERY ??
  "Making Feeds: Custom Logic Requests";
const SEARCH_BROAD_QUERY = process.env.FEED_PERF_SEARCH_BROAD_QUERY ?? "ai";

/** Selective queries rank their whole match set; 151 rows measured at ~10ms warm. */
const SEARCH_BUDGET_MS = Number(process.env.FEED_PERF_SEARCH_BUDGET_MS ?? 400);

/**
 * Looser than {@link SEARCH_BUDGET_MS}: the capped arms still touch ~900 heap
 * rows on a cold page store. The real guard is that this is nowhere near the
 * 16s it replaced.
 */
const SEARCH_BROAD_BUDGET_MS = Number(
  process.env.FEED_PERF_SEARCH_BROAD_BUDGET_MS ?? 1500,
);

const META_VECTOR = documentMetaVectorSql(
  sql`d.title`,
  sql`d.description`,
  sql`d.tags`,
);

/** The candidate pool + ranking, mirroring `searchArticles`. */
function buildSearchPoolSql(query: string): SQL {
  const tsq = sql`websearch_to_tsquery('english', ${query})`;
  const pooledMeta = documentMetaVectorSql(
    sql`pool.title`,
    sql`pool.description`,
    sql`pool.tags`,
  );
  return sql`
    select pool.uri
    from (
      (select d.uri, d.title, d.description, d.tags, d.published_at
       from documents d
       where d.deleted = false and (${META_VECTOR}) @@ ${tsq}
       limit ${sql.raw(String(TITLE_POOL_CAP))})
      union
      (select d.uri, d.title, d.description, d.tags, d.published_at
       from documents d
       where d.deleted = false and d.search_vector @@ ${tsq}
       limit ${sql.raw(String(BODY_POOL_CAP))})
    ) pool
    order by ${documentMetaRankSql(pooledMeta, tsq)} desc,
             pool.published_at desc, pool.uri desc
    limit 21
  `;
}

describe.skipIf(!RUN)("article search — EXPLAIN", () => {
  test("the title arm rides documents_meta_search_idx", async () => {
    const plan = await explainSql(sql`
      select d.uri from documents d
      where d.deleted = false
        and (${META_VECTOR}) @@ websearch_to_tsquery('english', ${SEARCH_TITLE_QUERY})
      limit ${sql.raw(String(TITLE_POOL_CAP))}
    `);

    assertNoSeqScanOnDocuments(plan);
    if (!plan.includes("documents_meta_search_idx")) {
      expect.fail(
        `The title arm is not using documents_meta_search_idx. Either the ` +
          `index has not been built on this database (see ` +
          `scripts/search-relevance-indexes.sql) or the query expression has ` +
          `drifted from the indexed one. Full plan:\n\n${plan}`,
      );
    }
  }, 30_000);

  test("a selective query ranks its whole match set within budget", async () => {
    const plan = await explainSql(buildSearchPoolSql(SEARCH_TITLE_QUERY));

    assertNoSeqScanOnDocuments(plan);
    assertExecTimeUnder(plan, SEARCH_BUDGET_MS);
  }, 30_000);

  test("a broad query stays bounded by the pool caps", async () => {
    const plan = await explainSql(buildSearchPoolSql(SEARCH_BROAD_QUERY));

    assertNoSeqScanOnDocuments(plan);
    assertExecTimeUnder(plan, SEARCH_BROAD_BUDGET_MS);

    // Every arm must stop at its cap. `actual rows=N` above the cap means a
    // LIMIT stopped acting as an optimization barrier and the outer ORDER BY
    // got pushed down into the arm — the 16s shape.
    const cap = Math.max(TITLE_POOL_CAP, BODY_POOL_CAP);
    const overCap = [...plan.matchAll(/rows=(\d+) loops=1/g)]
      .map((match) => Number(match[1]))
      .filter((rows) => rows > cap * 1.5);
    if (overCap.length > 0) {
      expect.fail(
        `A pool arm returned ${overCap.join(", ")} rows against a ${cap} cap — ` +
          `the LIMIT is no longer bounding the scan. Full plan:\n\n${plan}`,
      );
    }
  }, 30_000);
});

async function explainCandidate({
  unreadForDid,
  countOldPostsAsUnread,
  viewerDid,
  muterDid,
}: {
  unreadForDid: string;
  countOldPostsAsUnread: boolean | undefined;
  /** Set to force the block predicate on — see the block-filter describe. */
  viewerDid?: string;
  /** Set to force the mute predicate on — see the mute-filter describe. */
  muterDid?: string;
}): Promise<string> {
  const [publicationUris, followedUserDids] = await Promise.all([
    selectFollowUris(db, schema, READER_DID),
    selectFollowedUserDids(db, schema, READER_DID),
  ]);

  if (followedUserDids.length === 0) {
    // The union path only fires when there are followed users. Skip (not fail)
    // if this reader has none — the test is meaningless without them.
    expect.fail(
      `FEED_PERF_READER_DID ${READER_DID} has no followed users; ` +
        "point at a reader with follows to exercise the union path.",
    );
  }

  const candidateSql = buildFollowFeedCandidateSql(schema, {
    publicationUris,
    followedUserDids,
    unreadForDid,
    countOldPostsAsUnread,
    viewerDid,
    muterDid,
    limit: PAGE_LIMIT,
    offset: PAGE_OFFSET,
  });

  return explainSql(candidateSql);
}

/** `EXPLAIN (ANALYZE, BUFFERS)` a query, flattened to one plan string. */
async function explainSql(query: SQL): Promise<string> {
  const result = await db.execute(sql`EXPLAIN (ANALYZE, BUFFERS) ${query}`);
  const rows = Array.isArray(result)
    ? (result as Array<{ "QUERY PLAN"?: string } | string>)
    : ((result as { rows?: Array<{ "QUERY PLAN"?: string } | string> }).rows ??
      []);
  return rows
    .map((row) => (typeof row === "string" ? row : (row?.["QUERY PLAN"] ?? "")))
    .join("\n");
}

function assertNoSeqScanOnDocuments(plan: string): void {
  // Match `Seq Scan on documents` but not `Seq Scan on documents_something`
  // (other tables) and not an index scan. Word-boundary on the table name keeps
  // it specific.
  const seqScanMatch = /\bSeq Scan on documents\b/.test(plan);
  if (seqScanMatch) {
    expect.fail(
      `Plan contains a Seq Scan on documents — the cutoff regressed to a ` +
        `per-row correlated subquery (or the recommend aggregation was inlined ` +
        `across the join). Full plan:\n\n${plan}`,
    );
  }
}

/**
 * The two direct branches must each ride their per-source composite index.
 *
 * "No seq scan" alone does not catch the regression this replaced: collapsing
 * the branches back into `where did in (...) or publication_uri in (...)` still
 * plans an *Index* Scan — on `documents_published_idx`, walking the corpus
 * newest-first and discarding ~257K rows to return 214 (1651ms). The
 * distinguishing signal is *which* index, so assert on that.
 */
function assertPerSourceIndexScans(plan: string): void {
  for (const index of [
    "documents_publication_published_idx",
    "documents_did_published_idx",
  ]) {
    if (!plan.includes(index)) {
      expect.fail(
        `Plan does not use ${index} — a direct follow branch fell back to a ` +
          `corpus-ordered scan (usually: the two branches were merged back ` +
          `into one \`OR\`, or the \`unnest ... cross join lateral\` was ` +
          `rewritten as a bare \`in (...)\`). Full plan:\n\n${plan}`,
      );
    }
  }
}

function assertExecTimeUnder(plan: string, budgetMs: number): void {
  const match = plan.match(/Execution Time: ([\d.]+) ms/);
  if (!match) {
    expect.fail(
      `Could not parse "Execution Time" from plan. Full plan:\n\n${plan}`,
    );
  }
  const execMs = Number(match[1]);
  if (execMs > budgetMs) {
    expect.fail(
      `Execution Time ${execMs}ms exceeds ${budgetMs}ms budget. ` +
        `Full plan:\n\n${plan}`,
    );
  }
}
