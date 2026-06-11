/**
 * Postgres `ts_headline` emits HTML-escaped text with only `<mark>` (or `<b>`)
 * wrapper tags. Strip everything else before rendering.
 */
const MARK_OPEN = "\x00MARK_OPEN\x00";
const MARK_CLOSE = "\x00MARK_CLOSE\x00";

export function sanitizeTsHeadlineHtml(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withPlaceholders = trimmed.replace(/<\/?mark>/gi, (tag) =>
    tag.toLowerCase() === "<mark>" ? MARK_OPEN : MARK_CLOSE,
  );

  const escaped = withPlaceholders
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const restored = escaped
    .replaceAll(MARK_OPEN, "<mark>")
    .replaceAll(MARK_CLOSE, "</mark>");

  return restored || null;
}

/** True when `ts_headline` wrapped at least one query term. */
export function tsHeadlineHasMatch(html: string | null | undefined): boolean {
  return html?.includes("<mark>") ?? false;
}
