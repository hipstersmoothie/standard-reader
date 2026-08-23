/**
 * Dates as a standalone site prints them.
 *
 * Two shapes only: a compact one for row meta, and a long one for a dateline.
 * `Intl` formatters are expensive to construct, so both are built once at module
 * load — a site has no locale switcher, so there is nothing to rebuild for.
 */
const short = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const long = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function parse(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Jun 12, 2026" */
export function siteDate(iso: string | null): string {
  const date = parse(iso);
  return date ? short.format(date) : "";
}

/** "June 12, 2026" */
export function siteLongDate(iso: string | null): string {
  const date = parse(iso);
  return date ? long.format(date) : "";
}
