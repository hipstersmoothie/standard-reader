/**
 * Once-per-week guard for the "hottest articles" Bluesky thread.
 *
 * The posting path is not idempotent and cannot be made so: every run writes
 * fresh `app.bsky.feed.post` records at new TIDs, and a published post must
 * never be rewritten to collapse a duplicate (that orphans the replies and likes
 * pinning its `cid`). So the job has to decide *before* it posts whether this
 * week is already spoken for. That decision is a row in `weekly_thread_runs`
 * keyed by ISO week: claiming the week is the same statement that records it, so
 * two processes racing on the same tick can never both post.
 *
 * Mirrors the push-queue claim in `src/server/push/run.ts`, minus the batching:
 * one atomic `insert … on conflict do update … where`, a reaper arm for runs
 * that died mid-flight, and a settle step afterwards.
 *
 * This is the first of two guards: it stops a duplicate run from doing the work.
 * The second is a read of the bot's own repo just before composing
 * (`findWeekThreadRoot` in `./thread.ts`), which catches the cases this row
 * cannot know about — a wiped table, a different database, a hand-run.
 */
import { sql } from "drizzle-orm";

import { db } from "../../db/index.ts";

/** States a week's row can be in. */
export type WeeklyThreadState = "running" | "posted" | "skipped" | "failed";

/**
 * A claim held by a run that died before it finished is reaped after this long.
 * Comfortably longer than a real run (a handful of blob uploads and six posts,
 * seconds to a couple of minutes) so a slow-but-alive run is never stolen from —
 * and it only ever matters within the same week, since next Friday is a new key.
 */
export const THREAD_CLAIM_TIMEOUT_MINUTES = 30;

/** Normalize `db.execute` across the neon-http and node-postgres drivers. */
async function unwrap<T>(query: Promise<unknown>): Promise<Array<T>> {
  const result = await query;
  if (Array.isArray(result)) return result as Array<T>;
  return ((result as { rows?: Array<T> }).rows ?? []) as Array<T>;
}

// Raw `db.execute` rows come back with the DB's snake_case column names. Type
// aliases, not interfaces: `db.execute<T>` constrains `T` to
// `Record<string, unknown>`, and only type aliases get an implicit index
// signature.
type ClaimRow = {
  period_key: string;
  attempts: number;
  state: WeeklyThreadState;
};

type ExistingRow = {
  state: WeeklyThreadState;
  root_uri: string | null;
};

export interface WeekClaim {
  /** The week this run is posting for. */
  periodKey: string;
  /** How many runs have claimed this week, this one included. */
  attempts: number;
}

export interface WeekTaken {
  periodKey: string;
  /** Why this run must not post. */
  reason: "already-posted" | "in-progress";
  /** Root of the thread already posted for this week, when there is one. */
  rootUri: string | null;
}

export type ClaimResult =
  | ({ claimed: true } & WeekClaim)
  | ({ claimed: false } & WeekTaken);

/**
 * Take this week's slot, or report who has it.
 *
 * The `on conflict do update … where` arms are the only way an existing row is
 * re-claimed: a previous run that failed outright, one that found nothing to
 * post (a later run that *does* find articles should still get to post), or one
 * whose claim went stale because the process died. A row in `posted`, or in
 * `running` with a fresh claim, matches no arm — `returning` comes back empty
 * and this run stands down.
 */
export async function claimWeek(
  periodKey: string,
  options: { force?: boolean } = {},
): Promise<ClaimResult> {
  // `force` drops the guard arms so a deliberate manual re-post always wins the
  // row — the ledger still ends up describing what actually went out.
  const guard = options.force
    ? sql``
    : sql`where weekly_thread_runs.state in ('failed', 'skipped')
              or (weekly_thread_runs.state = 'running'
                  and weekly_thread_runs.claimed_at
                      < now() - make_interval(mins => ${THREAD_CLAIM_TIMEOUT_MINUTES}))`;

  const claimed = await unwrap<ClaimRow>(
    db.execute<ClaimRow>(sql`
      insert into weekly_thread_runs (period_key, state, attempts, claimed_at)
      values (${periodKey}, 'running', 1, now())
      on conflict (period_key) do update
         set state = 'running',
             attempts = weekly_thread_runs.attempts + 1,
             claimed_at = now(),
             last_error = null,
             updated_at = now()
      ${guard}
      returning period_key, attempts, state
    `),
  );

  if (claimed.length > 0) {
    return { attempts: claimed[0].attempts, claimed: true, periodKey };
  }

  const existing = await unwrap<ExistingRow>(
    db.execute<ExistingRow>(sql`
      select state, root_uri
        from weekly_thread_runs
       where period_key = ${periodKey}
    `),
  );
  const row = existing[0];
  return {
    claimed: false,
    periodKey,
    reason: row?.state === "running" ? "in-progress" : "already-posted",
    rootUri: row?.root_uri ?? null,
  };
}

/**
 * Record the thread root the instant it exists, before the replies go out.
 *
 * This is what closes the crash window: once the root is written to the PDS the
 * thread is public, so a later run must never repost it — even if this process
 * dies before the CTA post. `posted` matches none of the re-claim arms above.
 */
export async function markRootPosted(
  periodKey: string,
  rootUri: string,
): Promise<void> {
  await db.execute(sql`
    update weekly_thread_runs
       set state = 'posted', root_uri = ${rootUri}, updated_at = now()
     where period_key = ${periodKey}
  `);
}

/** Stamp the finished run's post count. */
export async function markThreadComplete(
  periodKey: string,
  postCount: number,
): Promise<void> {
  await db.execute(sql`
    update weekly_thread_runs
       set state = 'posted', post_count = ${postCount}, updated_at = now()
     where period_key = ${periodKey}
  `);
}

/**
 * Release the claim without having posted anything — an empty week (`skipped`)
 * or a run that blew up before the root post (`failed`). Both are re-claimable,
 * so a later run this week can still post.
 */
export async function releaseWeek(
  periodKey: string,
  state: "skipped" | "failed",
  lastError: string | null = null,
): Promise<void> {
  await db.execute(sql`
    update weekly_thread_runs
       set state = ${state}, last_error = ${lastError}, updated_at = now()
     where period_key = ${periodKey}
       and state = 'running'
  `);
}
