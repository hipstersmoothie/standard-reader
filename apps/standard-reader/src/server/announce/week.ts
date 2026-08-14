/**
 * The week the thread belongs to, and the record keys derived from it.
 *
 * Everything here is a pure function of the run's calendar week, which is what
 * makes the weekly thread postable exactly once. Two mechanisms hang off it:
 *
 *  1. `weekly_thread_runs` is keyed by {@link isoWeekKey} — the claim that stops
 *     a second run from doing the work at all (see `./ledger.ts`).
 *  2. The posts themselves are written at {@link threadRkeys} with `putRecord`,
 *     so a run that gets past the claim anyway — the DB unreachable, the guard
 *     forced, a bug — *overwrites* last run's thread instead of publishing a
 *     second one. Fresh TIDs (`tid.now()`) are what made the old job duplicate.
 *
 * Kept transport- and DB-free so the runner, the thread builder, and tests can
 * all share it.
 */
import { create as createTid } from "@atcute/tid";

/** Millis in a day / week, for the ISO week arithmetic below. */
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Fixed clock id for every TID this job mints. TIDs encode (timestamp, clockid),
 * so pinning the clockid is what makes the same week always produce the same
 * record keys — the point of the whole scheme.
 */
const THREAD_CLOCK_ID = 0;

/** The hour the cron fires (`0 16 * * 5`), used as each week's anchor instant. */
const THREAD_CRON_HOUR_UTC = 16;

/**
 * ISO-8601 week of `date` in UTC (`2026-W33`).
 *
 * The cron fires Friday 16:00 UTC and ISO weeks roll over on Monday, so every
 * re-run over that Friday-to-Sunday tail maps to the same key — which is the
 * window a duplicate post would land in. A run the following week gets a new key
 * and is free to post, as it should be.
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

/**
 * The instant a week's thread is *nominally* posted: that week's Friday at the
 * cron hour, UTC. Used as both the TID seed and the records' `createdAt`, so a
 * re-run rewrites byte-identical records rather than shifting the thread's
 * timestamp. A late catch-up run therefore posts under the Friday it stands in
 * for, which is what the thread says it is anyway.
 */
export function weekAnchor(periodKey: string): Date {
  const match = /^(\d{4})-W(\d{2})$/.exec(periodKey);
  if (!match) {
    throw new Error(`Not an ISO week key: ${periodKey}`);
  }
  const monday =
    isoWeek1Monday(Number(match[1])).getTime() +
    (Number(match[2]) - 1) * WEEK_MS;
  // Monday + 4 days = Friday, at the cron hour.
  return new Date(monday + 4 * DAY_MS + THREAD_CRON_HOUR_UTC * 3_600_000);
}

/**
 * The `count` record keys this week's thread posts live at, in thread order.
 *
 * TIDs are (timestamp, clockid) pairs, so seeding from the week's anchor instant
 * with a pinned clockid yields the same keys on every run — `putRecord` at those
 * keys is an upsert, and the thread can never be published twice. One
 * microsecond apart keeps them sorting in thread order.
 */
export function threadRkeys(periodKey: string, count: number): Array<string> {
  const anchorMicros = weekAnchor(periodKey).getTime() * 1000;
  return Array.from({ length: count }, (_, i) =>
    createTid(anchorMicros + i, THREAD_CLOCK_ID),
  );
}
