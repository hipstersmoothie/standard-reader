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
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "#/db";
import * as schema from "#/db/schema";
import {
  buildFollowFeedCandidateSql,
  selectFollowUris,
  selectFollowedUserDids,
} from "#/server/reader/queries";

const RUN = process.env.FEED_PERF_TEST === "1";
const READER_DID =
  process.env.FEED_PERF_READER_DID ?? "did:plc:m2sjv3wncvsasdapla35hzwj";

/** Generous — Neon cold starts + the `documents` table growing over time. */
const EXEC_TIME_BUDGET_MS = Number(
  process.env.FEED_PERF_EXEC_BUDGET_MS ?? 1500,
);
const PAGE_LIMIT = 22;
const PAGE_OFFSET = 0;

describe.skipIf(!RUN)("follow-feed candidate query — EXPLAIN", () => {
  // EXPLAIN ANALYZE runs the query for real over the prod Neon RTT (~230ms),
  // after two follow-fetch round trips — generous timeout to avoid flake.
  test("suppressed-old (countOldPostsAsUnread=false) does not seq-scan documents", async () => {
    const plan = await explainCandidate({
      unreadForDid: READER_DID,
      countOldPostsAsUnread: false,
    });

    assertNoSeqScanOnDocuments(plan);
    assertExecTimeUnder(plan, EXEC_TIME_BUDGET_MS);
  }, 30_000);

  test("no-cutoff path does not seq-scan documents", async () => {
    const plan = await explainCandidate({
      unreadForDid: READER_DID,
      countOldPostsAsUnread: true,
    });

    assertNoSeqScanOnDocuments(plan);
  }, 30_000);
});

async function explainCandidate({
  unreadForDid,
  countOldPostsAsUnread,
}: {
  unreadForDid: string;
  countOldPostsAsUnread: boolean | undefined;
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
    limit: PAGE_LIMIT,
    offset: PAGE_OFFSET,
  });

  const result = await db.execute(
    sql`EXPLAIN (ANALYZE, BUFFERS) ${candidateSql}`,
  );
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
