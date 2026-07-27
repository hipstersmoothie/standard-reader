import rehypeParse from "rehype-parse";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";

import { articleMarkdownSanitizeSchema } from "./article-sanitize-schema";

/**
 * Sanitize a raw HTML fragment from a markdown document body.
 *
 * `renderer-core` carries raw HTML through as an `html` block rather than
 * dropping it, and deliberately renders nothing for it by default — deciding
 * what markup is safe belongs to the host, not to a framework-agnostic
 * renderer. This is that decision, against the same schema the markdown
 * pipeline has always used, so what publishers can write is unchanged.
 *
 * Returns an empty string when nothing survives, so callers can skip the block
 * rather than render an empty container.
 */
export function sanitizeArticleHtml(html: string): string {
  if (!html.trim()) return "";
  const file = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeSanitize, articleMarkdownSanitizeSchema)
    .use(rehypeStringify)
    .processSync(html);
  return String(file).trim();
}
