"use client";

import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";

import * as stylex from "@stylexjs/stylex";

import type { ContentRendererProps } from "./types";

import { parseArticleBlocks } from "../article-content";
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
        if (block.type === "pullquote") {
          return (
            <p key={index} {...stylex.props(articleBodyStyles.pullquote)}>
              {block.text}
            </p>
          );
        }

        const isFirst =
          index === blocks.findIndex((b) => b.type === "paragraph");
        if (isFirst && block.text.length > 0) {
          const first = block.text[0] ?? "";
          const rest = block.text.slice(1);
          return (
            <p
              key={index}
              {...stylex.props(
                articleBodyStyles.paragraph,
                articleBodyStyles.dropCapParagraph,
              )}
            >
              <span {...stylex.props(articleBodyStyles.dropCap)} aria-hidden>
                {first}
              </span>
              {rest}
            </p>
          );
        }

        return (
          <p key={index} {...stylex.props(articleBodyStyles.paragraph)}>
            {block.text}
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
