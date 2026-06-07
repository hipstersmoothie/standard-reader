import { STANDARD_MARKDOWN_CONTENT } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Plaintext from `site.standard.content.markdown`. */
export function markdownPlaintext(content: unknown): string | null {
  if (!isRecord(content) || content.$type !== STANDARD_MARKDOWN_CONTENT) {
    return null;
  }
  const text = typeof content.text === "string" ? content.text.trim() : "";
  return text || null;
}
