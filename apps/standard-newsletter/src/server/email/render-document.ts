/**
 * Render a document's body to email-safe HTML.
 *
 * Foundation: paragraphs from the document's plaintext (`documents.textContent`).
 * This is deliverable and safe today; rich rendering of the block structure
 * (`contentJson`: images, embeds, formatting) via @standard-reader/renderer-core
 * is a follow-up — buildRenderTree() emits a normalized tree that would need an
 * email-HTML serializer.
 */

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderDocumentBodyHtml(textContent: string | null): string {
  const text = (textContent ?? "").trim();
  if (!text) {
    return '<p style="margin:0 0 16px;line-height:1.6">Read the full post online.</p>';
  }
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p).replaceAll("\n", "<br/>")}</p>`,
    )
    .join("");
}

export function previewText(textContent: string | null, max = 140): string {
  const text = (textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
