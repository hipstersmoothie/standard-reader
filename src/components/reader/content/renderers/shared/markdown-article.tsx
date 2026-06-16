"use client";

import type { ComponentProps } from "react";
import type { Components } from "react-markdown";

import * as stylex from "@stylexjs/stylex";
import { AppLink } from "#/components/reader/app-link";
import { spacing } from "#/design-system/theme/spacing.stylex";
import { stripLeadingMarkupImage } from "#/lib/document/lead-image";
import { articleMarkdownSanitizeSchema } from "#/lib/markdown/article-sanitize-schema";
import { useReadingTypography } from "#/lib/use-reading-typography";
import { createElement, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

import type { ContentRendererProps } from "../../types";

import { articleBodyStyles, readingDropCapStyleProps } from "../../body-styles";
import { ArticleBody } from "./article-body";
import { CodeBlockView } from "./code-block";
import { MarkdownIframeEmbed } from "./iframe-embed";

const markdownStyles = stylex.create({
  blockquote: {
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
  },
});

function useMarkdownComponents(
  codeHighlights: ContentRendererProps["codeHighlights"],
): Components {
  const dropCapApplied = useRef(false);
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
      p: ({ children }) => {
        if (!dropCapApplied.current) {
          dropCapApplied.current = true;
          const text = String(children ?? "");
          const chars = [...text];
          const firstChar = chars[0] ?? "";
          const rest = chars.slice(1).join("");
          if (firstChar) {
            return (
              <p
                {...stylex.props(
                  articleBodyStyles.paragraph,
                  articleBodyStyles.dropCapParagraph,
                )}
              >
                <span {...readingDropCapStyleProps(preference)} aria-hidden>
                  {firstChar}
                </span>
                {rest}
              </p>
            );
          }
        }
        return <p {...stylex.props(articleBodyStyles.paragraph)}>{children}</p>;
      },
      a: ({ href, children }) =>
        href ? (
          <AppLink href={href} linkStyle={articleBodyStyles.facetLink}>
            {children}
          </AppLink>
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
      blockquote: ({ children }) => (
        <blockquote
          {...stylex.props(
            articleBodyStyles.pullquote,
            markdownStyles.blockquote,
          )}
        >
          {children}
        </blockquote>
      ),
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
      img: ({ src, alt, className, width, height }) => {
        if (className === "playlist-song-artwork" && src) {
          return (
            <img
              src={src}
              alt={alt ?? ""}
              loading="lazy"
              referrerPolicy="no-referrer"
              width={width ?? 72}
              height={height ?? 72}
              {...stylex.props(articleBodyStyles.playlistSongArtwork)}
            />
          );
        }
        if (!src) return null;
        return (
          <img
            src={src}
            alt={alt ?? ""}
            loading="lazy"
            referrerPolicy="no-referrer"
            width={width}
            height={height}
            {...stylex.props(articleBodyStyles.markdownImage)}
          />
        );
      },
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
  const components = useMarkdownComponents(codeHighlights);

  const remarkPlugins = useMemo(() => {
    const plugins = [];
    if (flavor === "gfm") plugins.push(remarkGfm);
    if (enableMath) plugins.push(remarkMath);
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
