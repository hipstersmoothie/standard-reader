/**
 * XHTML plumbing shared by every generated book: escaping, the per-chapter
 * document wrapper, and the one stylesheet the whole EPUB uses.
 *
 * EPUB content documents are XHTML, not HTML — an unclosed `<img>` or a bare
 * `&nbsp;` is a parse error, not a quirk the reader forgives. Everything that
 * reaches a chapter file therefore goes through {@link sanitizeToXhtml} (raw
 * publisher HTML) or comes from `renderToStaticMarkup`, which already
 * self-closes void elements and emits numeric character references.
 */

import rehypeParse from "rehype-parse";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";

import { articleMarkdownSanitizeSchema } from "#/lib/markdown/article-sanitize-schema";

export function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Strip characters XML 1.0 forbids outright. Record text is arbitrary user
 * input and a single stray control byte makes the whole package unparseable —
 * which a reader reports as "corrupt file", with no clue which of 40 chapters
 * carried it.
 */
export function xmlSafeText(value: string): string {
  // XML 1.0 allows #x9, #xA and #xD, then #x20 upward. Everything below that,
  // plus the two permanently-unassigned code points, is illegal anywhere in a
  // document — including inside CDATA.
  return value.replaceAll(
    // eslint-disable-next-line no-control-regex -- matching them is the point
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu,
    "",
  );
}

/**
 * Sanitize a raw HTML fragment from a document body and re-serialize it as
 * XHTML.
 *
 * Same schema as the in-app reader (`lib/markdown/sanitize-html.ts`) so a
 * publisher's markup means the same thing in a downloaded book as on the site;
 * the difference is purely serialization — void elements are closed and named
 * character references (`&nbsp;`, undefined in XHTML without a DTD) are written
 * numerically.
 */
export function sanitizeToXhtml(html: string): string {
  if (!html.trim()) return "";
  const file = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeSanitize, articleMarkdownSanitizeSchema)
    .use(rehypeStringify, {
      characterReferences: { useNamedReferences: false },
      closeSelfClosing: true,
    })
    .processSync(html);
  return String(file).trim();
}

/** Wrap rendered body markup in a complete XHTML content document. */
export function xhtmlDocument({
  title,
  body,
  language = "en",
  stylesheetHref = "../style.css",
}: {
  title: string;
  body: string;
  language?: string;
  stylesheetHref?: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${xmlEscape(language)}" xml:lang="${xmlEscape(language)}">
<head>
<meta charset="utf-8"/>
<title>${xmlEscape(xmlSafeText(title))}</title>
<link rel="stylesheet" type="text/css" href="${xmlEscape(stylesheetHref)}"/>
</head>
<body>
${body}
</body>
</html>
`;
}

/**
 * The book stylesheet.
 *
 * Deliberately small. An e-reader owns typography — the reader picked their
 * font, size, margins and theme on the device, and a book that overrides those
 * is a book they have to fight. This sets only what the device cannot infer:
 * that images fit the page, that captions read as captions, and that code does
 * not run off the edge. No colors, no font families, no font sizes on body
 * text.
 */
export const BOOK_STYLESHEET = `@namespace epub "http://www.idpf.org/2007/ops";

body { margin: 0 5%; line-height: 1.5; widows: 2; orphans: 2; }

h1, h2, h3, h4, h5, h6 { line-height: 1.25; page-break-after: avoid; }

img { max-width: 100%; height: auto; }

figure { margin: 1.5em 0; text-align: center; page-break-inside: avoid; }
figcaption { font-size: 0.85em; font-style: italic; text-align: center; margin-top: 0.4em; }

blockquote { margin: 1em 1.5em; font-style: italic; }

pre { white-space: pre-wrap; word-wrap: break-word; font-size: 0.85em; padding: 0.5em; }
code { font-size: 0.9em; }

hr { border: 0; border-top: 1px solid currentColor; opacity: 0.3; margin: 2em auto; width: 40%; }

table { border-collapse: collapse; width: 100%; font-size: 0.9em; }
th, td { border: 1px solid currentColor; padding: 0.3em 0.5em; text-align: left; }

aside[role="note"] { border-left: 3px solid currentColor; padding-left: 0.8em; margin: 1em 0; }

/* Chapter front matter: the byline and dateline above each article. */
.sr-chapter-meta { font-size: 0.85em; opacity: 0.75; margin: 0 0 1.5em; }
.sr-chapter-meta a { text-decoration: none; }

/* Where the article lives on the web, in the book's own words. */
.sr-source { font-size: 0.8em; opacity: 0.7; margin-top: 2.5em; border-top: 1px solid currentColor; padding-top: 0.8em; }

.sr-cover { margin: 0; padding: 0; text-align: center; }
.sr-cover img { max-width: 100%; max-height: 100%; }

/* Comic pages: one image per page, no margins to fight with. */
.sr-page { margin: 0; padding: 0; text-align: center; page-break-after: always; }
.sr-page img { max-width: 100%; max-height: 100%; }

/* Endnotes read better small and tight. */
section[epub|type="footnotes"] { font-size: 0.85em; }

/* An embedded Bluesky post. Bordered rather than tinted: an e-ink screen has
   no colour to spend, and a border survives every reader theme. */
.sr-post { border: 1px solid currentColor; border-radius: 0.4em; padding: 0.8em 1em; margin: 1.5em 0; font-size: 0.9em; }
.sr-post p { margin: 0.4em 0; }
.sr-post-byline { font-weight: bold; }
.sr-post-handle { font-weight: normal; opacity: 0.7; }
.sr-post-avatar { width: 1.4em; height: 1.4em; border-radius: 50%; vertical-align: middle; margin-right: 0.4em; }
.sr-post-image { display: block; max-width: 100%; height: auto; margin: 0.6em auto; }
.sr-post-source { font-size: 0.85em; opacity: 0.7; }
.sr-post-source a { text-decoration: none; }

/* Title page of a multi-article book. */
.sr-title-page { text-align: center; margin-top: 20%; }
.sr-title-page h1 { font-size: 1.8em; margin-bottom: 0.2em; }
.sr-title-page .sr-subtitle { font-size: 1em; opacity: 0.75; }
`;
