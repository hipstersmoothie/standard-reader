/**
 * Read side of the weekly "hottest reads" page (`/weekly/$week`).
 *
 * The picks are whatever the Friday thread job stamped into
 * `weekly_thread_runs.article_uris` (see `recordWeekPicks` in
 * `src/server/announce/ledger.ts`) — never a re-run of the ranking, which is
 * relative to `now()` and would not reproduce what the thread posted.
 */
import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";

/**
 * Week rows that have a page: picks recorded, and the run either posting or
 * done. A `failed`/`skipped` row may still hold picks from a run that never
 * reached the root post — that thread does not exist, so neither does its page.
 */
function hasPage(schema: Schema) {
  const w = schema.weeklyThreadRuns;
  return and(
    inArray(w.state, ["running", "posted"]),
    sql`cardinality(${w.articleUris}) > 0`,
  );
}

export interface WeeklyPicksRow {
  periodKey: string;
  /** Document AT-URIs in rank order. */
  articleUris: Array<string>;
  /** When the picks were ranked — the end of the seven days they cover. */
  pickedAt: Date;
  /** The Bluesky thread root, once it is posted. */
  rootUri: string | null;
}

export async function readWeeklyPicks(
  db: Db,
  schema: Schema,
  periodKey: string,
): Promise<WeeklyPicksRow | null> {
  const w = schema.weeklyThreadRuns;
  const rows = await db
    .select({
      periodKey: w.periodKey,
      articleUris: w.articleUris,
      pickedAt: w.pickedAt,
      claimedAt: w.claimedAt,
      rootUri: w.rootUri,
    })
    .from(w)
    .where(and(eq(w.periodKey, periodKey), hasPage(schema)))
    .limit(1);
  const row = rows.at(0);
  if (!row) return null;
  return {
    periodKey: row.periodKey,
    articleUris: row.articleUris,
    pickedAt: row.pickedAt ?? row.claimedAt,
    rootUri: row.rootUri,
  };
}

/** The weeks either side of `periodKey` that have a page (keys sort as text). */
export async function adjacentWeeklyPicks(
  db: Db,
  schema: Schema,
  periodKey: string,
): Promise<{ previous: string | null; next: string | null }> {
  const w = schema.weeklyThreadRuns;
  const [previous, next] = await Promise.all([
    db
      .select({ periodKey: w.periodKey })
      .from(w)
      .where(and(lt(w.periodKey, periodKey), hasPage(schema)))
      .orderBy(desc(w.periodKey))
      .limit(1),
    db
      .select({ periodKey: w.periodKey })
      .from(w)
      .where(and(gt(w.periodKey, periodKey), hasPage(schema)))
      .orderBy(asc(w.periodKey))
      .limit(1),
  ]);
  return {
    previous: previous.at(0)?.periodKey ?? null,
    next: next.at(0)?.periodKey ?? null,
  };
}

/** The most recent week with a page, for `/weekly` with no week given. */
export async function latestWeeklyPicksKey(
  db: Db,
  schema: Schema,
): Promise<string | null> {
  const w = schema.weeklyThreadRuns;
  const rows = await db
    .select({ periodKey: w.periodKey })
    .from(w)
    .where(hasPage(schema))
    .orderBy(desc(w.periodKey))
    .limit(1);
  return rows.at(0)?.periodKey ?? null;
}
