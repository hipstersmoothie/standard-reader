/**
 * Mochott (`site.mochott.article`).
 *
 * [mochott](https://mochott.site) publishes every post twice: a
 * `site.standard.document` carrying the card metadata — with **no `content`
 * field at all** — and a `site.mochott.article` at the *same rkey* holding the
 * body as a TipTap document.
 *
 * Nothing in the document points at the sibling, so it is found by convention:
 * same repo, same rkey. That makes it the *sidecar* shape (like
 * `app.standard-reader.collection`) rather than the fetched-content shape
 * (Greengale, whose document carries a `#contentRef` uri to follow).
 *
 * The article record — `$type` and all — is what we store as the document's
 * content; `@standard-reader/renderer-core` parses it directly.
 */

export const MOCHOTT_ARTICLE = "site.mochott.article";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The stored content payload for a mochott article record: the record itself,
 * `$type` stamped on so format detection works wherever content travels
 * without its `content_format` column. Returns null when the record carries no
 * TipTap body.
 */
export function mochottArticleContent(record: unknown): unknown {
  if (!isRecord(record)) return null;
  const content = record.content;
  if (!isRecord(content) || content.type !== "doc") return null;
  if (!Array.isArray(content.content) || content.content.length === 0) {
    return null;
  }
  return { ...record, $type: MOCHOTT_ARTICLE };
}
