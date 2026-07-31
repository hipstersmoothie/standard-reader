/**
 * The prose a comic page's post carries alongside the art.
 *
 * A comic page is a document like any other: an image block, and often a few
 * lines from the author — a caption, a process note, an apology for the late
 * update. The theater shows the art, so that writing had nowhere to go but the
 * reading view, a navigation away from the page it belongs to.
 *
 * The body's plaintext is already extracted for every content format
 * (`documentExtractedText`), but it narrates image blocks by their alt text —
 * correct for search and for a screen reader walking the article, wrong here,
 * where the alt describes the page the reader is looking at. So the pages' own
 * alt text is subtracted from it, which is format-agnostic and exact: the
 * extractor inserts those lines verbatim, so they come back out verbatim.
 */

/** Extractors join blocks with a blank line; that is the paragraph boundary. */
const PARAGRAPH_BREAK = /\n{2,}/;

/** Whitespace-insensitive form, for comparing a paragraph against an alt. */
function normalize(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

/** A note's paragraphs, for rendering. Empty when there is no note. */
export function comicNoteParagraphs(note: string | null): Array<string> {
  if (!note) return [];
  return note
    .split(PARAGRAPH_BREAK)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/**
 * The note for one page: its post's body text, minus the alt text of the images
 * that post contributes as pages. Null when nothing is left — which is the
 * common case, since most comic pages are art and nothing else.
 */
export function comicPageNote(
  bodyText: string | null | undefined,
  images: Array<{ alt: string }>,
): string | null {
  const alts = new Set(
    images.map((image) => normalize(image.alt)).filter(Boolean),
  );
  const paragraphs = comicNoteParagraphs(bodyText ?? null).filter(
    (paragraph) => !alts.has(normalize(paragraph)),
  );
  return paragraphs.length > 0 ? paragraphs.join("\n\n") : null;
}
