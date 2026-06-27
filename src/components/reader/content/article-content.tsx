"use client";

import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";

import * as stylex from "@stylexjs/stylex";
import {
  DropCapChar,
  HighlightedPlaintext,
} from "#/components/reader/quote-highlight-context";
import {
  intersectHighlightRange,
  useQuoteHighlightTracker,
} from "#/components/reader/quote-highlight-tracker";
import { parseArticleBlocks } from "#/lib/document/blocks";
import { resolveArticleHeroImage } from "#/lib/document/lead-image";
import { useReadingTypography } from "#/lib/use-reading-typography";

import type { ContentRendererProps } from "./types";

import {
  articleBodyStyles,
  readingBodyStyleProps,
  readingDropCapStyleProps,
} from "./body-styles";
import { CONTENT_RENDERERS } from "./renderers";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveContentType(article: ArticleDetail): string | null {
  if (article.contentFormat) return article.contentFormat;
  if (
    isRecord(article.contentJson) &&
    typeof article.contentJson.$type === "string"
  ) {
    return article.contentJson.$type;
  }
  return null;
}

function FallbackContent({
  article,
  hasHero,
}: {
  article: ArticleDetail;
  hasHero: boolean;
}) {
  const tracker = useQuoteHighlightTracker();
  const { preference } = useReadingTypography();
  const blocks = parseArticleBlocks({
    textContent: article.textContent,
    contentJson: article.contentJson,
  });

  if (blocks.length === 0) return null;

  return (
    <div {...readingBodyStyleProps(preference, hasHero)}>
      {blocks.map((block, index) => {
        const highlightRange = tracker?.consume(block.text.length) ?? null;

        if (block.type === "pullquote") {
          return (
            <p key={index} {...stylex.props(articleBodyStyles.pullquote)}>
              <HighlightedPlaintext
                plaintext={block.text}
                highlightRange={highlightRange}
              />
            </p>
          );
        }

        const isFirst =
          index === blocks.findIndex((b) => b.type === "paragraph");
        if (isFirst && block.text.length > 0) {
          const first = block.text[0] ?? "";
          const rest = block.text.slice(1);
          const firstCharRange = intersectHighlightRange(highlightRange, 0, 1);
          const restRange = intersectHighlightRange(
            highlightRange,
            1,
            Math.max(0, block.text.length - 1),
          );

          return (
            <p
              key={index}
              {...stylex.props(
                articleBodyStyles.paragraph,
                articleBodyStyles.dropCapParagraph,
              )}
            >
              <span {...readingDropCapStyleProps(preference)} aria-hidden>
                <DropCapChar char={first} highlightRange={firstCharRange} />
              </span>
              <HighlightedPlaintext
                plaintext={rest}
                highlightRange={restRange}
              />
            </p>
          );
        }

        return (
          <p key={index} {...stylex.props(articleBodyStyles.paragraph)}>
            <HighlightedPlaintext
              plaintext={block.text}
              highlightRange={highlightRange}
            />
          </p>
        );
      })}
    </div>
  );
}

export function ArticleContent({
  article,
  hasHero: hasHeroProp,
  skipFirstBlock: skipFirstBlockProp,
}: {
  article: ArticleDetail;
  hasHero?: boolean;
  skipFirstBlock?: boolean;
}) {
  const hero = resolveArticleHeroImage(article);
  // Only an explicit `hasHero` (magazine cover above the body) suppresses the
  // article body's top margin. Header hero images in ArticleView sit above the
  // title, not between the byline and body, so auto-detecting them here used to
  // remove needed separation before the first paragraph.
  const hasHero = hasHeroProp ?? false;
  const skipFirstBlock = skipFirstBlockProp ?? hero?.fromFirstBlock ?? false;
  const contentType = resolveContentType(article);
  const Renderer = contentType ? CONTENT_RENDERERS[contentType] : undefined;

  if (Renderer) {
    const props: ContentRendererProps = {
      blobContext: {
        authorDid: article.did,
      },
      codeHighlights: article.codeHighlights,
      content: article.contentJson,
      hasHero,
      skipFirstBlock,
    };
    return <Renderer {...props} />;
  }

  return <FallbackContent article={article} hasHero={hasHero} />;
}
