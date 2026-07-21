"use client";

import { StandardDocumentRenderer } from "@standard-reader/renderer-react";

import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";

import {
  articleToStandardDocument,
  buildStandardReaderComponents,
} from "./standard-renderer-components";

/**
 * Render an article's body through `@standard-reader/renderer-react` using the
 * app's own components. A drop-in that produces the same output as the native
 * reader while going through the shared, published headless renderer.
 *
 * Must be rendered inside the reader's provider tree (inline mentions, content
 * links) so the app's interactive inline components resolve.
 */
export function StandardArticleBody({
  article,
  dropCap = false,
  skipLeadingImage = false,
}: {
  article: ArticleDetail;
  dropCap?: boolean;
  skipLeadingImage?: boolean;
}) {
  const components = buildStandardReaderComponents({
    blobContext: { authorDid: article.did },
    codeHighlights: article.codeHighlights,
  });
  return (
    <StandardDocumentRenderer
      document={articleToStandardDocument(article)}
      components={components}
      options={{ dropCap, skipLeadingImage }}
    />
  );
}
