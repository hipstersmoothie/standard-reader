import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * One row per week the "hottest articles" Bluesky thread job has run — the
 * dedupe ledger that makes the Friday cron post exactly once per week.
 *
 * The job creates `app.bsky.feed.post` records at fresh TIDs, so re-running it
 * always writes a brand-new thread rather than overwriting the old one. Nothing
 * about the posting path is idempotent, and plenty of things fire it more than
 * once per week: a redeploy or manual restart of the `thread-cron` service runs
 * the start command immediately, an operator can run `pnpm thread:post` by
 * hand, and a Railway retry would tick it again. The guard therefore lives
 * here, ahead of the write.
 *
 * The primary key is the ISO week (`2026-W33`, UTC), so a `insert … on conflict`
 * claim is the whole mutual exclusion — two processes racing on the same week
 * can never both win, without needing a transaction (the Neon HTTP driver has
 * none). See `claimWeek()` in `src/server/announce/ledger.ts`.
 *
 * `rootUri` is stamped the moment the thread root exists, before the replies go
 * out — a run killed mid-thread leaves a partial thread that must never be
 * reposted, only inspected.
 */
export const weeklyThreadRuns = pgTable("weekly_thread_runs", {
  /** ISO-8601 week of the run, UTC (`2026-W33`). One thread per week. */
  periodKey: text("period_key").primaryKey(),

  /** `running` | `posted` | `skipped` | `failed` (see WEEKLY_THREAD_STATES). */
  state: text("state").notNull().default("running"),
  /** How many times a run has claimed this week — >1 means a retry took over. */
  attempts: integer("attempts").notNull().default(0),

  /** When the current claim was taken. A run killed mid-flight leaves this
   * stale, which is how the next run's reaper finds it. */
  claimedAt: timestamp("claimed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** AT-URI of the thread root, stamped as soon as the root post is created. */
  rootUri: text("root_uri"),
  /** Posts actually written (article posts + the CTA post). */
  postCount: integer("post_count").notNull().default(0),
  /** Last failure, kept for inspecting `failed` rows. */
  lastError: text("last_error"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type WeeklyThreadRun = typeof weeklyThreadRuns.$inferSelect;
