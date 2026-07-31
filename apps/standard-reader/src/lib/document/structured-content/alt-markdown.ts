/**
 * Markdown-in-record content formats: third-party lexicons whose `content`
 * union entry is just a markdown string under a format-specific key. They all
 * funnel into the same markdown pipeline as `site.standard.content.markdown`.
 *
 * The format→body-key table lives in `@standard-reader/renderer-core` (it is
 * the same table its markdown parser dispatches on); the app kept a second copy
 * until the two were reconciled. What's left here is the app's own framing:
 * "alt" markdown means every markdown-in-record format *except* the canonical
 * `site.standard.content.markdown`, which has its own route.
 */

import {
  isMarkdownFormat,
  MARKDOWN_FORMATS,
  markdownText,
  STANDARD_MARKDOWN_CONTENT,
} from "@standard-reader/renderer-core";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Known markdown-in-record formats. `at.markpub.markdown` is handled by the
 * dedicated markpub module instead, and never appears here.
 */
export const ALT_MARKDOWN_FORMATS = MARKDOWN_FORMATS.filter(
  (format) => format !== STANDARD_MARKDOWN_CONTENT,
);

/** Whether `format` is a known markdown-in-record content `$type`. */
export function isAltMarkdownFormat(format: string | null | undefined) {
  return Boolean(
    format && format !== STANDARD_MARKDOWN_CONTENT && isMarkdownFormat(format),
  );
}

/**
 * Raw markdown body from a markdown-in-record `content` payload. The format is
 * resolved from `content.$type` (falling back to the stored `contentFormat`
 * when records omit a top-level `$type`).
 */
export function altMarkdownText(
  content: unknown,
  contentFormat?: string | null,
): string | null {
  if (!isRecord(content)) return null;
  const format =
    typeof content.$type === "string" ? content.$type : contentFormat;
  if (!isAltMarkdownFormat(format)) return null;
  const text = markdownText(content, format)?.trim();
  return text || null;
}
