/** Small text helpers for the email send path. Body rendering itself is handled
 * by @standard-reader/renderer-email (see NewsletterEmail / dispatch). */

export function previewText(textContent: string | null, max = 140): string {
  const text = (textContent ?? "").replaceAll(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
