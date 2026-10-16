/**
 * URLs for the weekly "hottest reads" page — the Standard Reader page the
 * Friday Bluesky thread roots on (`/weekly/2026-W42`). Shared by the thread job
 * (`src/server/announce/run.ts`), the route, and its OG image so the three can
 * never disagree about where a week lives.
 */

/** An ISO week key as minted by `isoWeekKey` (`2026-W42`). */
const WEEK_KEY_RE = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

export function isWeekKey(value: string): boolean {
  return WEEK_KEY_RE.test(value);
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

/** The week's page, e.g. `https://standard-reader.app/weekly/2026-W42`. */
export function weeklyPicksUrl(baseUrl: string, periodKey: string): string {
  return `${trimBase(baseUrl)}/weekly/${periodKey}`;
}

/** The week's 1200×630 share card. */
export function weeklyPicksOgImageUrl(
  baseUrl: string,
  periodKey: string,
): string {
  return `${trimBase(baseUrl)}/api/og/weekly/${periodKey}`;
}
