"use client";

import { StandardDocumentRenderer } from "@standard-reader/renderer-react";

import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";

import { buildStandardReaderComponents } from "../standard-renderer-components";
import type { ContentRendererProps } from "../types";
import { ArticleBody } from "./shared/article-body";

/**
 * Renders every markdown-bodied content format — `site.standard.content.markdown`
 * (including resolved GreenGale documents), the markdown-in-record third-party
 * lexicons, and Markpub — through `@standard-reader/renderer-react`.
 *
 * This used to be a second markdown implementation: react-markdown with its own
 * plugin stack, rendering the same documents by different rules than every
 * other format. Now one parser in `renderer-core` builds the render tree and
 * the app supplies the components, so a markdown heading and a Leaflet heading
 * are the same component with the same styles, and a fix to either lands in
 * both.
 *
 * The format is detected from the payload's `$type`, so one renderer covers all
 * three families.
 */
export function MarkdownContentRenderer({
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
          authorDid: blobContext?.authorDid,
          description: leadDescription,
        }}
        components={components}
        options={{ dropCap: true, skipLeadingImage: skipFirstBlock }}
      />
    </ArticleBody>
  );
}

export { STANDARD_MARKDOWN_CONTENT };
