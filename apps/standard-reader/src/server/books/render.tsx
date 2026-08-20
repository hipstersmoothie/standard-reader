/**
 * A document body, rendered to EPUB-ready XHTML.
 *
 * The RSS feeds get their HTML from `lib/document/content-html.ts`, which only
 * covers the formats with a straight text-to-HTML path — a Leaflet or pckt
 * document falls back to its excerpt there. That is an acceptable trade for a
 * feed item; it is not one for a book, where the excerpt *is* the whole
 * download.
 *
 * So books render through `@standard-reader/renderer-react` instead — the same
 * headless renderer the in-app reader uses — with `renderToStaticMarkup`. Every
 * block vocabulary the app can display, a book can carry, and the two stay in
 * step by construction: a new block type shows up in both or neither.
 *
 * Images are the one thing that cannot be resolved in a single pass. Blob refs
 * become CDN URLs, but a book wants its images *inside* the file, and which
 * ones we managed to fetch is not known until we have tried. So rendering is
 * two-phase: render once to discover the URLs, fetch them, then render again
 * with the fetched ones pointing at in-book paths (see `epub.ts`).
 */

import type {
  ImageUrlResolver,
  StandardSiteDocument,
} from "@standard-reader/renderer-core";
import {
  buildRenderTree,
  defaultImageUrlResolver,
} from "@standard-reader/renderer-core";
import { StandardDocumentRenderer } from "@standard-reader/renderer-react";
import type { RendererComponentsInput } from "@standard-reader/renderer-react";
import { renderToStaticMarkup } from "react-dom/server";

import { documentContentHtml } from "#/lib/document/content-html";
import { bskyPostUrl } from "#/lib/leaflet/bsky";

import { sanitizeToXhtml } from "./xhtml";

/**
 * `epub:type` carries the semantics that make a reader treat these as endnotes
 * — popped up in place rather than jumped to. React renders namespaced
 * attributes verbatim; JSX has no typing for them, hence the spread.
 */
const EPUB_TYPE = {
  backlink: { "epub:type": "backlink" },
  footnote: { "epub:type": "footnote" },
  footnotes: { "epub:type": "footnotes" },
} satisfies Record<string, Record<string, string>>;

export interface RenderBodyInput {
  /** The `content` union payload from the document record. */
  content: unknown;
  contentFormat: string | null;
  /** DID of the repo hosting the body's image blobs. */
  authorDid: string;
  description?: string | null;
  /** Absolute URL the document lives at, for resolving relative links. */
  documentUrl?: string | null;
  /**
   * Remote image URL to in-book href. Absent on the discovery pass; on the
   * final pass, any URL missing from the map keeps its remote address (the
   * image failed to fetch, and a live URL degrades better than a dead one).
   */
  localImages?: Map<string, string>;
}

export interface RenderedBody {
  /** XHTML markup for the chapter body — no `<html>` wrapper. */
  markup: string;
  /** Every remote image URL the body referenced, first appearance first. */
  imageUrls: Array<string>;
}

/**
 * Make `href` absolute so a link still works on a device that has no idea what
 * site the book came from. Fragments stay relative — they address the chapter.
 */
function absoluteHref(href: string, base: string | null): string {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) return trimmed;
  if (/^[a-z][\d+.a-z-]*:/i.test(trimmed)) return trimmed;
  if (!base) return trimmed;
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return trimmed;
  }
}

/**
 * Component overrides for book output.
 *
 * The headless defaults are already semantic HTML, so this is a short list of
 * genuine differences between a web page and a book:
 *
 *  - **Raw HTML blocks render.** The default drops them (deciding what markup
 *    is safe is the host's call, not the renderer's); a book that silently
 *    dropped an HTML-format article's entire body would be an empty book.
 *  - **Nothing embeds.** `iframe` is dead weight in an offline file — every
 *    embed becomes a link the reader can follow when they are back online.
 *  - **No lazy-loading or referrer hints.** Both are browser affordances that
 *    mean nothing to an e-reader, and they only add bytes per image.
 */
function bookComponents(
  documentUrl: string | null,
  resolveImage: (url: string) => string,
): RendererComponentsInput {
  const link = (href: string) => absoluteHref(href, documentUrl);

  return {
    shared: {
      Link: ({ href, children }) => <a href={link(href)}>{children}</a>,

      Html: ({ html }) => {
        const safe = sanitizeToXhtml(html);
        if (!safe) return null;
        return <div dangerouslySetInnerHTML={{ __html: safe }} />;
      },
      HtmlEmbed: ({ html }) => {
        // A `srcdoc` embed is a self-contained document; inlined, it is just
        // more of this chapter. The sandbox it needs on the web is moot here —
        // scripts do not run in an e-reader.
        const safe = sanitizeToXhtml(html);
        if (!safe) return null;
        return <div dangerouslySetInnerHTML={{ __html: safe }} />;
      },
      Iframe: ({ url }) => (
        <p>
          <a href={link(url)}>{url}</a>
        </p>
      ),
      Website: ({ src, title, description }) => (
        <p>
          <a href={link(src)}>{title || src}</a>
          {description ? <span> — {description}</span> : null}
        </p>
      ),
      BlueskyEmbed: ({ postUri }) => {
        const url = bskyPostUrl(postUri);
        return (
          <p>
            <a href={url ?? postUri}>{url ?? postUri}</a>
          </p>
        );
      },

      Image: ({ src, alt, caption }) => (
        <figure>
          <img src={resolveImage(src)} alt={alt} />
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      ),
      ImageGrid: ({ images, caption }) => (
        <figure>
          {images.map((image, index) => (
            <img key={index} src={resolveImage(image.src)} alt={image.alt} />
          ))}
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      ),
      ImageCarousel: ({ images, caption }) => (
        <figure>
          {images.map((image, index) => (
            <img key={index} src={resolveImage(image.src)} alt={image.alt} />
          ))}
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      ),
      ImageDiff: ({ before, after, caption, labels }) => (
        <figure>
          <img
            src={resolveImage(before.src)}
            alt={before.alt || labels?.[0] || ""}
          />
          <img
            src={resolveImage(after.src)}
            alt={after.alt || labels?.[1] || ""}
          />
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      ),

      // Endnote semantics: a reader that understands these pops the note up in
      // place instead of throwing the reader to the back of the book.
      Footnotes: ({ children }) => (
        <section {...EPUB_TYPE.footnotes} role="doc-endnotes">
          <hr />
          <ol>{children}</ol>
        </section>
      ),
      FootnoteItem: ({ id, children }) => (
        <li {...EPUB_TYPE.footnote} id={`fn-${id}`} role="doc-endnote">
          {children}{" "}
          <a {...EPUB_TYPE.backlink} href={`#fnref-${id}`} role="doc-backlink">
            ↩
          </a>
        </li>
      ),
    },
  };
}

/**
 * The fallback body, for formats the block renderer does not know.
 *
 * `renderer-core` covers the block vocabularies (Leaflet, pckt, Offprint,
 * structured, markdown). It does not cover the HTML families a bridge produces
 * — WordPress/Gutenberg, micro.blog — which the app renders through its own
 * HTML pipeline. Without this, a book of bridged posts would be a book of
 * empty chapters, which is exactly the failure the whole two-tier render was
 * meant to avoid.
 *
 * The markup is sanitized against the article schema (same as the reader), then
 * its images are pulled out by hand: they never passed through the resolver, so
 * this is the only chance to collect and rewrite them.
 */
function renderHtmlFallback(
  input: RenderBodyInput,
  collect: (url: string) => void,
  resolveImage: (url: string) => string,
): string {
  const html = documentContentHtml(input.content, input.contentFormat);
  if (!html) return "";

  const safe = sanitizeToXhtml(html);
  if (!safe) return "";

  return safe.replaceAll(
    /(<img\b[^>]*?\bsrc=")([^"]*)(")/gi,
    (match, prefix: string, src: string, suffix: string) => {
      const absolute = absoluteHref(src, input.documentUrl ?? null);
      if (!/^https?:/i.test(absolute)) return match;
      collect(absolute);
      return `${prefix}${resolveImage(absolute)}${suffix}`;
    },
  );
}

/** Render one document body to XHTML, collecting the images it references. */
export function renderDocumentBody(input: RenderBodyInput): RenderedBody {
  const seen = new Set<string>();
  const imageUrls: Array<string> = [];

  // Discovery and rewriting share one hook: the resolver hands back the CDN URL
  // (recording it), and the component layer swaps in the in-book path if we
  // have one by then.
  const resolveImageUrl: ImageUrlResolver = (args) => {
    const url = defaultImageUrlResolver(args);
    if (url && !seen.has(url)) {
      seen.add(url);
      imageUrls.push(url);
    }
    return url;
  };

  const collect = (url: string) => {
    if (seen.has(url)) return;
    seen.add(url);
    imageUrls.push(url);
  };

  const resolveImage = (url: string): string =>
    input.localImages?.get(url) ?? url;

  const document: StandardSiteDocument = {
    authorDid: input.authorDid,
    content: input.content,
    contentFormat: input.contentFormat,
    description: input.description,
  };

  // Ask the block renderer first, and check before rendering rather than after:
  // an empty tree still serializes to a wrapper element, which reads as "we
  // rendered something" when nothing was rendered at all.
  const tree = buildRenderTree(document, { resolveImageUrl });
  if (!tree || tree.children.length === 0) {
    return {
      imageUrls,
      markup: renderHtmlFallback(input, collect, resolveImage),
    };
  }

  const markup = renderToStaticMarkup(
    <StandardDocumentRenderer
      components={bookComponents(input.documentUrl ?? null, resolveImage)}
      document={document}
      options={{ resolveImageUrl }}
    />,
  );

  return { imageUrls, markup };
}
