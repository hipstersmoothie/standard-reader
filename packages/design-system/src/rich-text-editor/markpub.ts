/**
 * Helpers for the `at.markpub.markdown` record the editor reads and writes.
 * Kept local to the design-system component so it stays free of app-lib
 * coupling — the shape mirrors the `at.markpub.markdown` / `at.markpub.text`
 * lexicons.
 */

export const MARKPUB_MARKDOWN = "at.markpub.markdown";
export const MARKPUB_TEXT = "at.markpub.text";

export type MarkpubFlavor = "gfm" | "commonmark";

export interface MarkpubTextValue {
  $type?: typeof MARKPUB_TEXT;
  markdown: string;
}

export interface MarkpubRecord {
  $type: typeof MARKPUB_MARKDOWN;
  text: MarkpubTextValue;
  flavor: MarkpubFlavor;
  extensions?: Array<string>;
}

/** A `$$…$$` or `$…$` run signals the LaTeX extension. */
function hasMath(markdown: string): boolean {
  return /(?<!\\)\$\$?[^$]/.test(markdown);
}

/** Wrap serialized GFM markdown into an `at.markpub.markdown` record. */
export function toMarkpubRecord(markdown: string): MarkpubRecord {
  const record: MarkpubRecord = {
    $type: MARKPUB_MARKDOWN,
    text: { $type: MARKPUB_TEXT, markdown },
    flavor: "gfm",
  };
  if (hasMath(markdown)) record.extensions = ["latex"];
  return record;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extract the markdown body from a value the editor may be initialized with:
 * a raw markdown string, an `at.markpub.text` object, or a full
 * `at.markpub.markdown` record.
 */
export function markdownFromMarkpub(
  value: string | MarkpubRecord | MarkpubTextValue | null | undefined,
): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";

  const text = value.text;
  if (isRecord(text) && typeof text.markdown === "string") {
    return text.markdown;
  }
  if (typeof value.markdown === "string") return value.markdown;
  return "";
}
