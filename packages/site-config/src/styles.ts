/**
 * The presentations a standalone site can be laid out in.
 *
 * Kept client-safe and free of any component imports: the ingest handler
 * normalizes a record's `style` through here, the settings picker enumerates it,
 * and the route resolves a `?style=` preview against it, so all three agree on
 * exactly one list. The translated names and descriptions live next door in
 * `./style-copy`, which the ingest handler must not pull in — the Lingui macro
 * it needs is a build-time transform the server bundle does not run.
 */
export const SITE_STYLES = [
  "broadsheet",
  "journal",
  "gallery",
  "marquee",
] as const;

export type SiteStyle = (typeof SITE_STYLES)[number];

/**
 * The style a site falls back to — when the record says nothing, when it names
 * a style this build doesn't know (a newer client wrote it), or when there is
 * no record at all. Broadsheet is the most forgiving of the four: it reads
 * correctly with one post or with two hundred.
 */
export const DEFAULT_SITE_STYLE: SiteStyle = "broadsheet";

export function isSiteStyle(value: unknown): value is SiteStyle {
  return (
    typeof value === "string" &&
    (SITE_STYLES as ReadonlyArray<string>).includes(value)
  );
}

/**
 * Coerce anything — a record field, a search param, nothing at all — to a style
 * we can render.
 */
export function toSiteStyle(value?: unknown): SiteStyle {
  return isSiteStyle(value) ? value : DEFAULT_SITE_STYLE;
}
