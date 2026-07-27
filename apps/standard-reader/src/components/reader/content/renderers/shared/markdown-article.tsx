"use client";

/**
 * The react-markdown pipeline.
 *
 * This is no longer how *document* markdown renders — `site.standard.content.markdown`,
 * the markdown-in-record lexicons and Markpub all go through
 * `@standard-reader/renderer-react` now, so there is one markdown parser behind
 * every format the reader shows (see `markdown-content.tsx`).
 *
 * What is left needs an HTML pipeline rather than a markdown one:
 *   · HTML-in-record documents (WordPress, Ghost, Known, Gutenberg-as-HTML),
 *     which `rehype-raw` re-parses and `rehype-sanitize` filters. `renderer-core`
 *     parses markdown, not HTML documents, so it has nothing to offer here.
 *   · small in-app markdown strings such as a collection colophon, which are
 *     not document bodies at all.
 */

import { useLingui } from "@lingui/react/macro";
import { Lightbox } from "@standard-reader/design-system/lightbox";
import {
  LIGHTBOX_IMAGE_TRANSITION_NAME,
  startLightboxViewTransition,
} from "@standard-reader/design-system/lightbox/transition";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { createElement, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { SmartArticleLink } from "#/components/reader/content/smart-article-link";
import { stripLeadingMarkupImage } from "#/lib/document/lead-image";
import { normalizeImageAlt } from "#/lib/document/structured-content/image";
import { articleMarkdownSanitizeSchema } from "#/lib/markdown/article-sanitize-schema";
import { readCalloutProps } from "#/lib/markdown/callouts";
import { remarkCallouts } from "#/lib/markdown/remark-callouts";
import { useReadingTypography } from "#/lib/use-reading-typography";

import "katex/dist/katex.min.css";

import { articleBodyStyles, readingDropCapStyleProps } from "../../body-styles";
import type { ContentRendererProps } from "../../types";
import { ArticleBody } from "./article-body";
import { Callout } from "./callout";
import { CodeBlockView } from "./code-block";
import { MarkdownIframeEmbed } from "./iframe-embed";
import { reactNodeHasText, splitLeadingChar } from "./react-node-text";
import { standaloneImageParagraph } from "./standalone-image-paragraph";

const markdownStyles = stylex.create({
  blockquote: {
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
  },
  imageButton: {
    backgroundColor: "transparent",
    borderWidth: 0,
    cursor: "zoom-in",
    display: "block",
    // Spacing below a standalone image is owned by the enclosing <figure>
    // (`imageFigure`), so the button itself adds none — otherwise the margin
    // would open a gap between the image and its caption inside the figure.
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    maxWidth: "100%",
    padding: spacing["0"],
  },
  imageButtonImage: {
    borderRadius: radius.sm,
    display: "block",
    height: "auto",
    maxWidth: "100%",
  },
  // Layered over `articleBodyStyles.imageCaption` so the shared caption style
  // (used by structured image blocks) is untouched: center the caption under
  // the image and open up a touch more breathing room above it.
  imageCaption: {
    marginTop: gap.xl,
    textAlign: "center",
  },
});

function MarkdownImage({
  src,
  alt,
  title,
  className,
  width,
  height,
}: {
  src?: string;
  alt?: string;
  title?: string;
  className?: string;
  width?: string | number;
  height?: string | number;
}) {
  const { t } = useLingui();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [transitionActive, setTransitionActive] = useState(false);

  if (className === "playlist-song-artwork" && src) {
    return (
      <img
        src={src}
        alt={alt ?? ""}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer"
        width={width ?? 72}
        height={height ?? 72}
        {...stylex.props(articleBodyStyles.playlistSongArtwork)}
      />
    );
  }
  if (!src) return null;

  const altText = alt ?? "";
  const transitionName = LIGHTBOX_IMAGE_TRANSITION_NAME;

  return (
    <>
      <button
        aria-label={altText || t`Open image`}
        type="button"
        onClick={() => {
          flushSync(() => setTransitionActive(true));
          startLightboxViewTransition(() => setLightboxOpen(true));
        }}
        style={
          transitionActive && !lightboxOpen
            ? { viewTransitionName: transitionName }
            : undefined
        }
        {...stylex.props(markdownStyles.imageButton)}
      >
        <img
          src={src}
          alt={altText}
          title={title}
          loading="lazy"
          referrerPolicy="no-referrer"
          width={width}
          height={height}
          {...stylex.props(markdownStyles.imageButtonImage)}
        />
      </button>
      <Lightbox
        alt={t`Image`}
        images={[
          {
            src,
            alt: altText,
            transitionName: transitionActive ? transitionName : undefined,
          },
        ]}
        isOpen={lightboxOpen}
        onOpenChange={(open) => {
          setLightboxOpen(open);
          if (!open) setTransitionActive(false);
        }}
      />
    </>
  );
}

function useMarkdownComponents(
  codeHighlights: ContentRendererProps["codeHighlights"],
  bodyText: string,
): Components {
  // Which paragraph owns the drop cap, identified by its offset in the markdown
  // source (`node.position.start.offset`). We key on that offset — not a
  // one-shot boolean — because the same paragraph's render function runs more
  // than once: React's dev double-invoke calls each `p` twice back to back, and
  // any state change (e.g. `useReadingTypography` resolving) re-renders the
  // whole body. A boolean flag flipped on the first pass makes every later pass
  // start "already applied" and drop the cap entirely. Matching by offset makes
  // the decision idempotent: the owning paragraph re-renders its cap, and no
  // other paragraph ever claims it.
  const dropCapOffset = useRef<number | null>(null);
  const prevText = useRef<string | null>(null);
  if (prevText.current !== bodyText) {
    // New body (e.g. an in-place article swap): recompute from scratch.
    prevText.current = bodyText;
    dropCapOffset.current = null;
  }
  const { preference } = useReadingTypography();

  return useMemo(
    () => ({
      h1: ({ children }) =>
        createElement(
          "h1",
          { ...stylex.props(articleBodyStyles.heading1) },
          children,
        ),
      h2: ({ children }) =>
        createElement(
          "h2",
          { ...stylex.props(articleBodyStyles.heading2) },
          children,
        ),
      h3: ({ children }) =>
        createElement(
          "h3",
          { ...stylex.props(articleBodyStyles.heading2) },
          children,
        ),
      h4: ({ children }) =>
        createElement(
          "h4",
          { ...stylex.props(articleBodyStyles.heading2) },
          children,
        ),
      h5: ({ children }) =>
        createElement(
          "h5",
          { ...stylex.props(articleBodyStyles.heading2) },
          children,
        ),
      h6: ({ children }) =>
        createElement(
          "h6",
          { ...stylex.props(articleBodyStyles.heading2) },
          children,
        ),
      p: ({ children, node }) => {
        // A paragraph that is nothing but a lone image renders as a semantic
        // <figure>. The Markdown title (`![alt](url "title")`) becomes the
        // visible caption, falling back to the alt text — matching how
        // structured image blocks caption themselves (`ImageFigureView`). The
        // real alt stays on the <img> (set in `MarkdownImage`) for screen
        // readers, so the caption is `aria-hidden` to avoid double-announcing.
        // Lifting the image out of the <p> also keeps the <figure> from being
        // illegally nested inside a paragraph, which the SSR HTML parser would
        // otherwise unwrap and break hydration.
        const standaloneImage = node ? standaloneImageParagraph(node) : null;
        if (standaloneImage) {
          const caption = normalizeImageAlt(
            standaloneImage.title,
            standaloneImage.alt,
          );
          return (
            <figure {...stylex.props(articleBodyStyles.imageFigure)}>
              {children}
              {caption ? (
                <figcaption
                  aria-hidden="true"
                  {...stylex.props(
                    articleBodyStyles.imageCaption,
                    markdownStyles.imageCaption,
                  )}
                >
                  {caption}
                </figcaption>
              ) : null}
            </figure>
          );
        }
        // The drop cap belongs on the first letter of the first prose paragraph,
        // and nowhere else. A paragraph is eligible only when no other paragraph
        // has claimed the slot, or when THIS paragraph is the one that claimed it
        // (so re-renders and the dev double-invoke reproduce the same cap — see
        // `dropCapOffset` above). `splitLeadingChar` lifts off the opening
        // character even when the rest of the paragraph carries inline markup (a
        // link, bold, …) so the formatting survives. A paragraph that opens with
        // markup itself has no bare letter to enlarge — it still claims the slot
        // (as long as it has text) so the cap never falls to a later paragraph.
        // A media-only paragraph (a lone image) carries no text, so it leaves the
        // slot for the first real prose that follows.
        const offset = node?.position?.start?.offset ?? null;
        const eligible =
          dropCapOffset.current === null || dropCapOffset.current === offset;
        if (eligible) {
          const split = splitLeadingChar(children);
          if (split && split.first.trim()) {
            if (offset !== null) dropCapOffset.current = offset;
            return (
              <p
                {...stylex.props(
                  articleBodyStyles.paragraph,
                  articleBodyStyles.dropCapParagraph,
                )}
              >
                <span {...readingDropCapStyleProps(preference)} aria-hidden>
                  {split.first}
                </span>
                {split.rest}
              </p>
            );
          }
          if (
            dropCapOffset.current === null &&
            offset !== null &&
            reactNodeHasText(children)
          ) {
            dropCapOffset.current = offset;
          }
        }
        return <p {...stylex.props(articleBodyStyles.paragraph)}>{children}</p>;
      },
      a: ({ href, children }) =>
        href ? (
          <SmartArticleLink href={href} linkStyle={articleBodyStyles.facetLink}>
            {children}
          </SmartArticleLink>
        ) : (
          <>{children}</>
        ),
      ul: ({ children }) => (
        <ul {...stylex.props(articleBodyStyles.list)}>{children}</ul>
      ),
      ol: ({ children, start }) => (
        <ol {...stylex.props(articleBodyStyles.list)} start={start}>
          {children}
        </ol>
      ),
      li: ({ children }) => (
        <li {...stylex.props(articleBodyStyles.listItem)}>{children}</li>
      ),
      blockquote: ({ children, node }) => {
        const callout = readCalloutProps(node?.properties);
        if (callout) {
          return (
            <Callout
              kind={callout.kind}
              title={callout.title}
              fold={callout.fold}
            >
              {children}
            </Callout>
          );
        }
        return (
          <blockquote
            {...stylex.props(
              articleBodyStyles.pullquote,
              markdownStyles.blockquote,
            )}
          >
            {children}
          </blockquote>
        );
      },
      hr: () => <hr {...stylex.props(articleBodyStyles.horizontalRule)} />,
      pre: ({ children }) => <>{children}</>,
      code: ({ className, children }) => {
        const text = String(children ?? "").replace(/\n$/, "");
        const match = /language-(\w+)/.exec(className ?? "");
        const language = match?.[1];
        const isBlock = Boolean(className);

        if (isBlock) {
          return (
            <CodeBlockView
              plaintext={text}
              language={language}
              codeHighlights={codeHighlights}
            />
          );
        }

        return (
          <code {...stylex.props(articleBodyStyles.facetCode)}>{children}</code>
        );
      },
      table: ({ children }) => (
        <table {...stylex.props(articleBodyStyles.table)}>{children}</table>
      ),
      th: ({ children }) => (
        <th
          {...stylex.props(
            articleBodyStyles.tableCell,
            articleBodyStyles.tableHeaderCell,
          )}
        >
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td {...stylex.props(articleBodyStyles.tableCell)}>{children}</td>
      ),
      strong: ({ children }) => (
        <strong {...stylex.props(articleBodyStyles.facetBold)}>
          {children}
        </strong>
      ),
      em: ({ children }) => (
        <em {...stylex.props(articleBodyStyles.facetItalic)}>{children}</em>
      ),
      mark: ({ children }) => (
        <mark {...stylex.props(articleBodyStyles.facetHighlight)}>
          {children}
        </mark>
      ),
      div: ({ className, children }) => {
        if (className === "playlist-songs") {
          return (
            <div {...stylex.props(articleBodyStyles.playlistSongs)}>
              {children}
            </div>
          );
        }
        if (className === "playlist-song-copy") {
          return (
            <div {...stylex.props(articleBodyStyles.playlistSongCopy)}>
              {children}
            </div>
          );
        }
        return <div className={className}>{children}</div>;
      },
      article: ({ className, children }) => {
        if (className === "playlist-song") {
          return (
            <article {...stylex.props(articleBodyStyles.playlistSong)}>
              {children}
            </article>
          );
        }
        return <article className={className}>{children}</article>;
      },
      span: ({ className, children }) => {
        if (className === "playlist-song-number") {
          return (
            <span {...stylex.props(articleBodyStyles.playlistSongNumber)}>
              {children}
            </span>
          );
        }
        return <span className={className}>{children}</span>;
      },
      img: MarkdownImage,
      iframe: ({ src, width, height }) => (
        <MarkdownIframeEmbed src={src} width={width} height={height} />
      ),
    }),
    [codeHighlights, preference],
  );
}

/**
 * Shared sanitized article pipeline: markdown (with embedded raw HTML) or a
 * raw HTML document. Everything flows through `rehype-raw` +
 * `rehype-sanitize` with the article schema — raw markup is never injected
 * into the DOM directly.
 */
export function MarkdownArticle({
  text,
  hasHero,
  skipFirstBlock,
  codeHighlights,
  flavor = "gfm",
  enableMath = false,
}: {
  text: string;
  hasHero: boolean;
  skipFirstBlock?: boolean;
  codeHighlights: ContentRendererProps["codeHighlights"];
  flavor?: "gfm" | "commonmark";
  enableMath?: boolean;
}) {
  const components = useMarkdownComponents(codeHighlights, text);

  const remarkPlugins = useMemo(() => {
    const plugins = [];
    if (flavor === "gfm") plugins.push(remarkGfm);
    if (enableMath) plugins.push(remarkMath);
    plugins.push(remarkCallouts);
    return plugins;
  }, [enableMath, flavor]);

  const body = skipFirstBlock ? stripLeadingMarkupImage(text) : text;
  if (!body.trim()) return null;

  const rehypePlugins = (
    enableMath
      ? [
          rehypeRaw,
          [rehypeSanitize, articleMarkdownSanitizeSchema],
          rehypeKatex,
        ]
      : [rehypeRaw, [rehypeSanitize, articleMarkdownSanitizeSchema]]
  ) satisfies ComponentProps<typeof ReactMarkdown>["rehypePlugins"];

  return (
    <ArticleBody hasHero={hasHero}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {body}
      </ReactMarkdown>
    </ArticleBody>
  );
}
