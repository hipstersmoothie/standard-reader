---
name: investigate-feed-query-perf
description: >-
  Playbook for investigating a slow read-model query in the standard-reader feed
  (home / latest / discover / tag / search). Covers finding the slow span in
  Honeycomb, reproducing against prod-scale Neon data, running and reading
  EXPLAIN ANALYZE, the known regression patterns (correlated cutoff subquery,
  inlined aggregation across a join), the fix templates, and how to verify.
  Use when a feed/home/latest query "feels slow", a perf budget is blown, or a
  Honeycomb p95/p99 tail needs explaining. Pairs with the gated EXPLAIN
  benchmark at `src/server/reader/queries.explain.test.ts` (`pnpm perf:explain`).
---

# Investigate a slow feed query

> **Paths:** this repo is a pnpm monorepo. Bare `src/…`, `scripts/…`, `perf/…`
> paths below — and `.env` — live under **`apps/standard-reader/`**. The `pnpm`
> commands are root passthroughs and work unchanged from the repo root.

This is the repeatable method behind the home-feed unread-cutoff fix (see memory
`home-feed-unread-cutoff-seq-scan`). Use it whenever a feed read path
(`feed.getHomePage`, `feed.getLatestFeed`, `feed.getDiscoverExtras`, tag/search)
shows a slow tail or blows a perf budget.

## 1. Find the slow span (Honeycomb MCP)

The app ships to the `standard-reader` Honeycomb dataset. Span names mirror the
server fn (`feed.getHomePage`, `feed.getLatestFeed`, …).

- `get_workspace_context` → grab the production environment slug.
- `list_spans` (or `find_queries`) scoped to the dataset, time_range `7d`, to
  confirm the span name and see relative volume.
- `run_query` on that span: `P50`/`P95`/`P99` of `duration_ms` over the last
  `7d`, plus a `HEATMAP` of duration over time. A **bimodal** distribution
  (fast clump + a long tail) is the signature of a path-conditional regression —
  some readers hit a slow branch, most don't.
- `get_span_details` on the span, then `run_bubbleup` (or a breakdown query) to
  find the differentiating attribute. Past culprits: `countOldPostsAsUnread`
  (true vs false), `scope`, `personalized`, reader DID/subscription count.
  BubbleUp tells you *who* is slow; that shapes the reproduction.

## 2. Reproduce against prod-scale data

**EXPLAIN is only meaningful against prod-scale data.** Local and CI Neon
branches are near-empty — a seq scan over 12 rows looks identical to a seq scan
over 364K rows, and the planner makes different choices on small tables.

- Your local `.env` `DATABASE_URL` points at **prod Neon** (see memory
  `railway-neon-region-mismatch` — and yes, that means ~230ms RTT; round-trip
  *count* matters more than SQL). `pnpm dev` then serves against prod.
- Reproduce the slow request as the affected reader. For signed-in routes,
  `PERF_TEST_SESSION_TOKEN` (preferred) or `PERF_TEST_IDENTIFIER` +
  `PERF_TEST_APP_PASSWORD` in `.env`, then `pnpm perf:test:signed-in`
  (`perf/lib/auth.ts` injects the cookie). The perf account
  `hipstersmoothie.com` (`did:plc:m2sjv3wncvsasdapla35hzwj`) is the heaviest
  known case and is the default `FEED_PERF_READER_DID`.
- If the perf budget is blown, `perf/lib/measure.ts` shows exactly what "ready"
  means (`main#main-content` visible + no `aria-busy='true'` inside it). The
  timer includes SSR data loads, so a slow query shows up here directly.

## 3. Get the SQL and EXPLAIN it

Drizzle emits parameterized SQL you can't just copy from a log. Two ways:

- **Best:** find a `buildXxxSql(opts): SQL` helper (e.g.
  `buildFollowFeedCandidateSql` in `src/server/reader/queries.ts`) that returns
  the raw SQL, and wrap it: `db.execute(sql\`EXPLAIN (ANALYZE, BUFFERS)
  ${buildXxxSql(opts)}\`)`. This is exactly what
  `src/server/reader/queries.explain.test.ts` does. If no such helper exists,
  extract one as part of the fix — it makes the query testable.
- **Quick path:** `EXPLAIN (ANALYZE, BUFFERS) <sql>` via the Neon MCP `run_sql`
  tool, or `psql "$DATABASE_URL"` with the reconstructed query (substitute the
  reader's real `publicationUris` / `followedUserDids` / `did` — the planner
  needs real cardinalities, not placeholders).

Always `ANALYZE, BUFFERS` — `Buffers: shared hit` tells you whether you're
reading a few index pages or scanning the whole table.

## 4. Read the plan — the regression signals

| Signal | Meaning |
|---|---|
| `Seq Scan on documents` (not `Index Scan`) | the planner couldn't use the index. On a 364K-row table this is the whole game. |
| `SubPlan` / `InitPlan` with `loops:` in the thousands | a correlated scalar subquery running once per candidate row. The loop count ≈ rows the outer scan produced. |
| `Rows Removed by Filter:` ≫ the result size | the scan is producing and then discarding a huge set — usually a WHERE predicate the index can't serve. |
| `Buffers: shared hit=` in the hundreds of thousands | touching most of the table. A healthy indexed lookup is tens to low hundreds. |
| `Nested Loop` with a huge row estimate | often the symptom of an aggregation planned *after* a join instead of before. |

The classic culprit in this codebase: a **correlated scalar subquery in a `WHERE`
that also carries an indexed `ORDER BY ... LIMIT`**. Postgres can't push the
correlated predicate into the index scan, so it walks the whole table newest-
first, runs the subquery per row, then applies the LIMIT. The fix is to make
the predicate *not* per-row.

## 5. Fix patterns (in order of preference)

### (a) Replace a per-row correlated subquery with precomputed per-source CTEs

There are two forms of this fix, depending on whether the query has a top-k
`ORDER BY ... LIMIT` scan to preserve:

- **Counting queries (no LIMIT/ORDER BY)** — e.g. `countFollowedDocuments`
  (`src/server/reader/queries.ts`): materialize the four cutoff aggregates once
  as small CTEs (`sc`/`uc`/`cc`/`rc`, each bounded by the reader's follows —
  ~166 subs + 9 follows, not 364K docs), `LEFT JOIN` them to the candidate set
  **inside the main query**, and compare `published_at >= least(sc.cutoff,
  uc.cutoff, cc.cutoff, rc.cutoff)`. `least()` ignores NULLs, so a doc reached
  through one source still gets that source's cutoff.

- **Top-k queries (`ORDER BY published_at DESC LIMIT k`)** — e.g.
  `selectFollowFeedCandidateUris`: the in-branch join form **defeats the index**
  here. The cutoff `LEFT JOIN`s block the `documents_published_idx` DESC +
  LIMIT scan from stopping early, so the planner walks the whole 364K table
  (measured: 1.8s, 6258 index rows scanned with cutoff CTEs joined per row).
  The fix that works: **over-fetch a bounded candidate pool, then apply the
  cutoff after the union.** Each union branch selects `k * CUTOFF_POOL_MULT`
  rows (cheap, index-served top-k per branch); the deduped pool is then
  `LEFT JOIN`ed to the four cutoff CTEs and filtered on
  `published_at >= least(...)`, with the final `ORDER BY feed_at DESC LIMIT k`.
  The pool size multiplier (`CUTOFF_POOL_MULT = 5`) trades a small over-fetch
  for keeping the cutoff out of the indexed scan. Measured: ~16ms.

`countFollowedDocuments` (in-branch join) and `selectFollowFeedCandidateUris`
(post-union on a bounded pool) are the two reference implementations — copy the
one that matches whether your query has a top-k scan.

### (b) Preserve subquery aggregation *before* a join (Shape A)

When a branch joins `documents` to an aggregate over `recommends`
(`document_contributors`, etc.), keep the aggregation **inside a subquery
joined to `documents`** (`select ... from documents join (select ... group by
rec.document_uri) fr on ...`). Do **NOT** inline the `GROUP BY` across the join
(`group by d.uri`) — that's "Shape B" and it regresses to a ~30s nested loop
because the planner aggregates *after* the join produces 113M rows. A trivial
rewrite flips the two; the comment at the recommend branch in
`selectFollowFeedCandidateUris` warns about this. If you touch that branch,
re-run `pnpm perf:explain` to confirm it stayed fast.

### (c) Gate expensive machinery behind the condition that needs it

Never build the cutoff CTEs / joins on the common path. The cutoff only fires
when `countOldPostsAsUnread === false` (new users; existing users backfilled to
`true`). Gate on `suppressOld = unreadForDid && countOldPostsAsUnread === false`
so the fast no-cutoff path is byte-for-byte unchanged. Building the four CTEs
on the no-cutoff path adds ~209ms for zero benefit.

## 6. Verify

1. **EXPLAIN before/after** (the core evidence): `pnpm perf:explain` (or Neon
   MCP `run_sql`). Before: `Seq Scan on documents`, thousands of SubPlan
   loops, ~1.6s. After: `Index Scan` on `documents_published_idx`, no per-row
   SubPlan, ~16ms cutoff path / ~8ms no-cutoff path. The gated spec asserts
   both "no Seq Scan on documents" and an execution-time budget so the next
   regression fails the spec.
2. **No-cutoff path unchanged**: EXPLAIN for the no-cutoff case should be
   byte-identical to before (no cutoff CTEs/joins emitted).
3. **Type/format/lint/tests:** `pnpm typecheck && pnpm lint && pnpm
   format:check && pnpm test`. Note (memory `preexisting-check-failures`):
   extension tsc, some oxlint, and vitest perf-spec failures exist on a clean
   tree — diff against a stash baseline, don't chase pre-existing noise.
4. **Wall-clock:** `pnpm perf:test:signed-in` against local dev pointed at
   prod Neon — the route's budget should clear with margin and the bimodal tail
   should be gone.
5. **Post-deploy:** watch the Honeycomb duration heatmap + p95 for the
   differentiating attribute (BubbleUp from step 1). The tail should collapse
   over the next few hours.

## 7. Add a regression guard

If you fixed a new query, add a case to `src/server/reader/queries.explain.test.ts`
(assert no `Seq Scan on <hot table>` + an exec-time budget), extracting a
`buildXxxSql` helper if there isn't one. The spec is gated on `FEED_PERF_TEST=1`
so it never runs in CI (CI's Neon branch is empty — EXPLAIN there is
meaningless); it's an operator-run check before a perf-sensitive deploy.

## Reference

- Memory: `home-feed-unread-cutoff-seq-scan` (the case this was written from).
- Memory: `railway-neon-region-mismatch` (why round-trip *count* dominates).
- Precedent: `scripts/search-perf-indexes.sql` (EXPLAIN-verify-before-deploy).
- Related skills: `neon-postgres`, `drizzle-migrations`, `railway-inspect`.
