/**
 * Markdown-in-record content formats: third-party lexicons whose `content`
 * union entry is just a markdown string under a format-specific key. They all
 * funnel into the same markdown pipeline as `site.standard.content.markdown`.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type MarkdownExtractor = (content: Record<string, unknown>) => string | null;

const field =
  (key: string): MarkdownExtractor =>
  (content) => {
    const text = content[key];
    return typeof text === "string" ? text : null;
  };

/** `at.markpub.markdown` nests the text under `text: { markdown }`. */
const markpubText: MarkdownExtractor = (content) => {
  const text = content.text;
  if (typeof text === "string") return text;
  if (isRecord(text) && typeof text.markdown === "string") {
    return text.markdown;
  }
  return null;
};

/**
 * Known markdown-in-record formats, keyed by content `$type`. Each entry
 * extracts the raw markdown body from the format's payload shape.
 */
const ALT_MARKDOWN_EXTRACTORS: Record<string, MarkdownExtractor> = {
  "actor.rpg.news#markdown": field("value"),
  "app.blento.markdown": field("value"),
  "app.wtr.content.markdown": field("markdown"),
  "at.markpub.markdown": markpubText,
  "at.unthread.content": field("content"),
  "com.pricelessmisc.content.markdown": field("markdown"),
  "com.scanash.content.markdown": field("markdown"),
  "dev.disnet.blog.content.markdown": field("markdown"),
  "download.darkworld.content.markdown#markdown": field("body"),
  "me.tompscanlan.content.markdown": field("markdown"),
  "net.commoninternet.lichen.content.markdown": field("text"),
  "pub.lemma.blog.entry": field("content"),
  "rip.nate.content.markdown": field("text"),
  "site.standard.document#markdown": field("value"),
};

export const ALT_MARKDOWN_FORMATS = Object.keys(ALT_MARKDOWN_EXTRACTORS);

/** Whether `format` is a known markdown-in-record content `$type`. */
export function isAltMarkdownFormat(format: string | null | undefined) {
  return Boolean(format && format in ALT_MARKDOWN_EXTRACTORS);
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
  if (!format) return null;
  const extract = ALT_MARKDOWN_EXTRACTORS[format];
  if (!extract) return null;
  const text = extract(content)?.trim();
  return text || null;
}
