/**
 * Extract a renderable body from a document for the email.
 *
 * standard.site markdown documents store their source in `contentJson` (e.g.
 * `at.markpub.markdown` → `{ markdown }`, or a nested `at.markpub.text`). When we
 * can find that markdown string the email renders it richly via React Email's
 * <Markdown>; otherwise it falls back to plaintext paragraphs (<Text>).
 */

export function extractMarkdown(contentJson: unknown): string | null {
  if (!contentJson || typeof contentJson !== "object") return null;
  const c = contentJson as Record<string, unknown>;

  if (typeof c.markdown === "string" && c.markdown.trim()) {
    return c.markdown.trim();
  }
  const text = c.text;
  if (text && typeof text === "object") {
    const md = (text as Record<string, unknown>).markdown;
    if (typeof md === "string" && md.trim()) return md.trim();
  }
  if (typeof c.value === "string" && c.value.trim()) return c.value.trim();
  return null;
}

export function previewText(textContent: string | null, max = 140): string {
  const text = (textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Split plaintext into paragraph strings for the <Text> fallback. */
export function toParagraphs(textContent: string | null): string[] {
  return (textContent ?? "")
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}
