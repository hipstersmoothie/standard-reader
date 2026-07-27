/**
 * Detects a paragraph whose only content is a single image.
 *
 * Markdown wraps a lone `![alt](url "title")` in its own paragraph. The article
 * renderer lifts those into a semantic `<figure>` with a caption, so it needs
 * to tell a standalone image apart from one sitting inline amid prose (which
 * stays inline and uncaptioned).
 *
 * Typed against the minimal shape of a hast element node — the same value
 * `react-markdown` hands a component as its `node` prop — to avoid coupling to
 * the full `@types/hast` tree.
 */

interface HastNodeLike {
  type?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Array<HastNodeLike>;
}

export interface StandaloneImage {
  alt?: string;
  title?: string;
}

/**
 * Returns the lone image's `alt`/`title` when `node` is a paragraph containing
 * nothing but a single image (insignificant whitespace aside), otherwise
 * `null`. Anything else in the paragraph — real text or a second element —
 * disqualifies it.
 */
export function standaloneImageParagraph(
  node: HastNodeLike | undefined | null,
): StandaloneImage | null {
  const children = node?.children;
  if (!children) return null;

  let image: HastNodeLike | null = null;
  for (const child of children) {
    if (child.type === "text") {
      // Whitespace between block tokens is insignificant; real text is not.
      if ((child.value ?? "").trim() === "") continue;
      return null;
    }
    if (child.type === "element" && child.tagName === "img") {
      if (image) return null;
      image = child;
      continue;
    }
    return null;
  }

  if (!image) return null;
  const properties = image.properties ?? {};
  return {
    alt: typeof properties.alt === "string" ? properties.alt : undefined,
    title: typeof properties.title === "string" ? properties.title : undefined,
  };
}
