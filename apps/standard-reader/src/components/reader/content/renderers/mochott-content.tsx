"use client";

import { StandardDocumentRenderer } from "@standard-reader/renderer-react";

import { MOCHOTT_ARTICLE } from "#/lib/mochott/types";

import { buildStandardReaderComponents } from "../standard-renderer-components";
import type { ContentRendererProps } from "../types";
import { ArticleBody } from "./shared/article-body";

/**
 * Renders a mochott body (`site.mochott.article`) through
 * `@standard-reader/renderer-react`.
 *
 * The content stored on the document is the article record itself — mochott's
 * `site.standard.document` has no body, so the sibling record at the same rkey
 * is what ingest indexes (see `#/server/mochott/resolve`). `renderer-core`
 * parses its TipTap tree onto the same block vocabulary every other format
 * uses, which is also what carries mochott's inline footnotes into the
 * document's endnotes — the structured-block path has no footnote channel.
 */
export function MochottContentRenderer({
  blobContext,
  codeHighlights,
  content,
  hasHero,
  leadDescription,
  skipFirstBlock,
}: ContentRendererProps) {
  const components = buildStandardReaderComponents({
    blobContext,
    codeHighlights,
  });

  return (
    <ArticleBody hasHero={hasHero}>
      <StandardDocumentRenderer
        document={{
          content,
          contentFormat: MOCHOTT_ARTICLE,
          authorDid: blobContext?.authorDid,
          description: leadDescription,
        }}
        components={components}
        options={{ dropCap: true, skipLeadingImage: skipFirstBlock }}
      />
    </ArticleBody>
  );
}
