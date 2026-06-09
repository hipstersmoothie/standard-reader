/**
 * HTML-in-record content formats: lexicons whose `content` union entry carries
 * a raw HTML body (WordPress exports, Known/idno, Ghost-style markup, the
 * standard `#html` variant) plus SkyPress Gutenberg blocks, which serialize to
 * HTML fragments.
 *
 * This module only *extracts* the HTML string. Rendering always goes through
 * `rehype-sanitize` (see `renderers/html-content.tsx`) — the raw markup is
 * never injected into the DOM directly.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Formats whose payload is `{ html: string }`. */
const INLINE_HTML_FORMATS = new Set([
  "co.idno.html",
  "com.apparition.content",
  "net.yrriban.content", // `html` inlined at ingest from the `doc.html` blob
  "org.wordpress.html",
  "site.standard.document.content#html",
]);

const GUTENBERG_FORMAT = "blog.skypress.content.gutenberg";

export const HTML_CONTENT_FORMATS = [...INLINE_HTML_FORMATS, GUTENBERG_FORMAT];

export function isHtmlContentFormat(format: string | null | undefined) {
  return Boolean(
    format && (INLINE_HTML_FORMATS.has(format) || format === GUTENBERG_FORMAT),
  );
}

interface GutenbergBlock {
  name?: unknown;
  attributes?: unknown;
  innerBlocks?: unknown;
}

function gutenbergBlockHtml(block: GutenbergBlock): string {
  const name = typeof block.name === "string" ? block.name : "";
  const attributes = isRecord(block.attributes) ? block.attributes : {};
  const content =
    typeof attributes.content === "string" ? attributes.content : "";
  const innerBlocks = Array.isArray(block.innerBlocks)
    ? block.innerBlocks.filter(isRecord)
    : [];
  const inner = innerBlocks.map((child) => gutenbergBlockHtml(child)).join("");

  switch (name) {
    case "core/paragraph": {
      return content ? `<p>${content}</p>` : "";
    }
    case "core/heading": {
      const level =
        typeof attributes.level === "number" &&
        attributes.level >= 1 &&
        attributes.level <= 6
          ? attributes.level
          : 2;
      return content ? `<h${level}>${content}</h${level}>` : "";
    }
    case "core/list": {
      const tag = attributes.ordered === true ? "ol" : "ul";
      return inner ? `<${tag}>${inner}</${tag}>` : "";
    }
    case "core/list-item": {
      return content ? `<li>${content}</li>` : "";
    }
    case "core/quote": {
      const body = inner || (content ? `<p>${content}</p>` : "");
      return body ? `<blockquote>${body}</blockquote>` : "";
    }
    case "core/code":
    case "core/preformatted": {
      return content ? `<pre><code>${content}</code></pre>` : "";
    }
    case "core/separator": {
      return "<hr />";
    }
    case "core/image": {
      const url = typeof attributes.url === "string" ? attributes.url : null;
      if (!url) return "";
      const alt = typeof attributes.alt === "string" ? attributes.alt : "";
      const caption =
        typeof attributes.caption === "string" ? attributes.caption : "";
      const img = `<img src="${url}" alt="${alt.replaceAll('"', "&quot;")}" />`;
      return caption
        ? `<figure>${img}<figcaption>${caption}</figcaption></figure>`
        : img;
    }
    default: {
      // Unknown block: fall back to its HTML content / children, if any.
      const body = content || inner;
      return body ? `<p>${body}</p>` : "";
    }
  }
}

/**
 * The HTML body for an HTML-family `content` payload, or null when the format
 * isn't HTML-based (or the payload is empty). Output is *unsanitized* — run it
 * through the article sanitize schema before rendering.
 */
export function htmlContentBody(
  content: unknown,
  contentFormat?: string | null,
): string | null {
  if (!isRecord(content)) return null;
  const format =
    typeof content.$type === "string" ? content.$type : contentFormat;
  if (!format) return null;

  if (INLINE_HTML_FORMATS.has(format)) {
    const html = typeof content.html === "string" ? content.html.trim() : "";
    return html || null;
  }

  if (format === GUTENBERG_FORMAT) {
    const blocks = Array.isArray(content.blocks)
      ? content.blocks.filter(isRecord)
      : [];
    const html = blocks
      .map((block) => gutenbergBlockHtml(block))
      .join("\n")
      .trim();
    return html || null;
  }

  return null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntities(text: string): string {
  return text.replaceAll(
    /&(#x?[\da-f]+|[a-z]+);/gi,
    (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      if (entity.startsWith("#")) {
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

/**
 * Best-effort plaintext from an HTML body for search indexing and reading-time
 * estimates. Block-level tags become paragraph breaks; everything else is
 * stripped. (Search text doesn't need perfect fidelity — the rendered article
 * is produced by the sanitizing renderer, not this.)
 */
export function htmlPlaintext(html: string): string | null {
  const text = html
    // Drop non-content subtrees entirely.
    .replaceAll(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replaceAll(/<!--[\s\S]*?-->/g, " ")
    // Block-level boundaries become paragraph breaks.
    .replaceAll(
      /<\/(p|div|section|article|h[1-6]|li|blockquote|figcaption|pre|tr)>/gi,
      "\n\n",
    )
    .replaceAll(/<(br|hr)\s*\/?>/gi, "\n")
    // Strip remaining tags.
    .replaceAll(/<[^>]+>/g, " ");

  const decoded = decodeEntities(text)
    .replaceAll(/[^\S\n]+/g, " ")
    .replaceAll(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  return decoded || null;
}

/** Plaintext for an HTML-family `content` payload (search / reading time). */
export function htmlContentPlaintext(
  content: unknown,
  contentFormat?: string | null,
): string | null {
  const html = htmlContentBody(content, contentFormat);
  return html ? htmlPlaintext(html) : null;
}
