/**
 * The week the thread belongs to, and the ledger key derived from it.
 *
 * The ISO week is the job's identity: `weekly_thread_runs` is keyed by
 * {@link isoWeekKey}, and claiming that row is what stops a second run from
 * posting (see `./ledger.ts`). A repo-side check for a root already carrying
 * this week's marker backs it up (see `findWeekThreadRoot` in `./thread.ts`).
 *
 * There is deliberately no rkey derivation here. An earlier version minted
 * deterministic TIDs from the week and wrote the posts with `putRecord`, so a
 * re-run "upserted" the thread in place. That silently rewrote posts the network
 * had already seen: replies and likes pin a post's `cid`, so every overwrite
 * orphaned them onto content that did not exist when they were written, and
 * AppViews that had indexed an earlier version disagreed with the PDS about what
 * the post said. Posts are created at fresh TIDs now and never rewritten.
 *
 * Kept transport- and DB-free so the runner, the thread builder, and tests can
 * all share it.
 */

/** Millis in a day / week, for the ISO week arithmetic below. */
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * ISO-8601 week of `date` in UTC (`2026-W33`).
 *
 * The cron fires Friday 16:00 UTC and ISO weeks roll over on Monday, so every
 * re-run over that Friday-to-Sunday tail maps to the same key — which is the
 * window a duplicate post would land in. A run the following week gets a new key
 * and is free to post, as it should be.
 *
 * Week keys also compare correctly with `<`/`>`: the ISO year leads and the week
 * number is zero-padded, which is what lets the repo-side scan in
 * `findWeekThreadRoot` stop once it walks past the week it is looking for.
 */
export function isoWeekKey(date: Date): string {
  // Shift to the Thursday of this week: the ISO year is whichever year that
  // Thursday falls in, and week 1 is the week containing Jan 4th.
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const isoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - isoDay);
  const isoYear = d.getUTCFullYear();
  const week1Monday = isoWeek1Monday(isoYear);
  const week = Math.round((d.getTime() - week1Monday.getTime()) / WEEK_MS) + 1;
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** Monday of ISO week 1 of `isoYear` — the week containing January 4th. */
function isoWeek1Monday(isoYear: number): Date {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const isoDay = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  return new Date(jan4.getTime() - (isoDay - 1) * DAY_MS);
}
