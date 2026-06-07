"use client";

import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";

import * as stylex from "@stylexjs/stylex";
import {
  HighlightedPlaintext,
  intersectHighlightRange,
  renderDropCapChar,
  useQuoteHighlightTracker,
} from "#/components/reader/quote-highlight-context";
import { parseArticleBlocks } from "#/lib/document/blocks";

import type { ContentRendererProps } from "./types";

import { articleBodyStyles } from "./body-styles";
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
  const blocks = parseArticleBlocks({
    textContent: article.textContent,
    contentJson: article.contentJson,
  });

  if (blocks.length === 0) return null;

  return (
    <div
      {...stylex.props(
        articleBodyStyles.body,
        hasHero ? articleBodyStyles.bodyAfterHero : undefined,
      )}
    >
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
              <span {...stylex.props(articleBodyStyles.dropCap)} aria-hidden>
                {renderDropCapChar(first, firstCharRange)}
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
  hasHero,
}: {
  article: ArticleDetail;
  hasHero: boolean;
}) {
  const contentType = resolveContentType(article);
  const Renderer = contentType ? CONTENT_RENDERERS[contentType] : undefined;

  if (Renderer) {
    const props: ContentRendererProps = {
      blobContext: {
        authorDid: article.did,
        authorPds: article.authorPds,
      },
      codeHighlights: article.codeHighlights,
      content: article.contentJson,
      hasHero,
    };
    return <Renderer {...props} />;
  }

  return <FallbackContent article={article} hasHero={hasHero} />;
}
