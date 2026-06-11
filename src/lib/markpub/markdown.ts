import { markdownImageAlts } from "#/lib/document/structured-content/markdown";

import { applyMarkpubFacets, normalizeMarkpubFacets } from "./facets";
import { parseMarkpubContent } from "./parse";
import type { MarkpubDocument } from "./types";

const YAML_FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

function stripYamlFrontMatter(markdown: string): string {
  return markdown.replace(YAML_FRONT_MATTER, "").trimStart();
}

function hasYamlExtension(extensions: Array<string>): boolean {
  return extensions.some(
    (entry) => entry.toLowerCase() === "yaml" || entry.toLowerCase() === "yml",
  );
}

function hasLatexExtension(extensions: Array<string>): boolean {
  return extensions.some((entry) => entry.toLowerCase() === "latex");
}

/** Plaintext body for search, TTS, and renderability checks. */
export function markpubPlaintext(content: unknown): string | null {
  const prepared = prepareMarkpubMarkdown(content);
  return prepared?.body ?? null;
}

export interface PreparedMarkpubMarkdown {
  body: string;
  flavor: MarkpubDocument["flavor"];
  enableMath: boolean;
}

/**
 * Normalize an `at.markpub.markdown` record into renderable markdown: strip
 * separate front matter, apply facet transforms, and honor declared extensions.
 */
export function prepareMarkpubMarkdown(
  content: unknown,
): PreparedMarkpubMarkdown | null {
  const doc = parseMarkpubContent(content);
  if (!doc) return null;

  let body = doc.markdown;

  if (doc.frontMatter.length > 0 || hasYamlExtension(doc.extensions)) {
    body = stripYamlFrontMatter(body);
  }

  const facets = normalizeMarkpubFacets(doc.facets, doc.lenses);
  body = applyMarkpubFacets(body, facets);

  body = body.trim();
  if (!body) return null;

  return {
    body,
    flavor: doc.flavor,
    enableMath: hasLatexExtension(doc.extensions),
  };
}

/** Narration/search text including image alt lines. */
export function markpubNarrationText(content: unknown): string | null {
  const text = markpubPlaintext(content);
  return text ? markdownImageAlts(text) : null;
}
