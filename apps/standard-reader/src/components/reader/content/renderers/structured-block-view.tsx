"use client";

import {
  normalizeImageAlt,
  structuredImageAspectRatio,
  structuredImageHasSource,
  structuredImageUrl,
} from "#/lib/document/structured-content/image";
import type { StructuredRenderableBlock } from "#/lib/document/structured-content/types";
import { sanitizeArticleHtml } from "#/lib/markdown/sanitize-html";
import type { CodeHighlightsByScheme } from "#/lib/theme";

import type { ContentBlobContext } from "../types";
import { OffprintComponentBlockView } from "./offprint-component";
import { PcktGalleryBlockView } from "./pckt-gallery";
import { BlockquoteBlockView } from "./shared/blockquote-block";
import { BskyPostEmbedView } from "./shared/bsky-post-embed";
import { CalloutBlockView } from "./shared/callout-block";
import { CodeBlockView } from "./shared/code-block";
import { TextBlockView } from "./shared/faceted-text";
import { HeadingBlockView } from "./shared/heading-block";
import { HorizontalRuleView } from "./shared/horizontal-rule";
import { IframeEmbedView } from "./shared/iframe-embed";
import { ImageFigureView } from "./shared/image-figure";
import { StructuredButtonBlockView } from "./shared/structured-button";
import {
  StructuredImageCarouselBlockView,
  StructuredImageDiffBlockView,
  StructuredImageGridBlockView,
} from "./shared/structured-image-collection";
import { StructuredMathBlockView } from "./shared/structured-math";
import { UnknownBlockView } from "./shared/unknown-block";
import {
  StructuredBulletListView,
  StructuredOrderedListView,
  StructuredTableView,
  StructuredTaskListView,
  StructuredWebsiteView,
} from "./structured-views";

function blockquoteParagraphs(
  blocks: Array<StructuredRenderableBlock>,
): Array<{ plaintext: string; facets?: Array<unknown> }> {
  return blocks.flatMap((block) => {
    if (block.kind === "text") {
      return block.text.plaintext.trim()
        ? [
            {
              plaintext: block.text.plaintext,
              facets: block.text.facets,
            },
          ]
        : [];
    }
    if (block.kind === "heading") {
      return block.text.plaintext.trim()
        ? [
            {
              plaintext: block.text.plaintext,
              facets: block.text.facets,
            },
          ]
        : [];
    }
    return [];
  });
}

export function StructuredBlockView({
  block,
  blobContext,
  codeHighlights,
  dropCap = false,
  nested = false,
}: {
  block: StructuredRenderableBlock;
  blobContext?: ContentBlobContext;
  codeHighlights?: CodeHighlightsByScheme;
  dropCap?: boolean;
  /** Set when this block sits inside a list item rather than the article flow. */
  nested?: boolean;
}) {
  /** Lists nest; their children are ordinary blocks, rendered right back here. */
  const renderNested = (child: StructuredRenderableBlock, index: number) => (
    <StructuredBlockView
      key={index}
      block={child}
      blobContext={blobContext}
      codeHighlights={codeHighlights}
      nested
    />
  );

  switch (block.kind) {
    case "text": {
      return (
        <TextBlockView
          plaintext={block.text.plaintext}
          facets={block.text.facets}
          dropCap={dropCap}
        />
      );
    }
    case "heading": {
      return (
        <HeadingBlockView
          plaintext={block.text.plaintext}
          level={block.level}
          facets={block.text.facets}
        />
      );
    }
    case "blockquote": {
      return (
        <BlockquoteBlockView paragraphs={blockquoteParagraphs(block.blocks)} />
      );
    }
    case "callout": {
      return (
        <CalloutBlockView
          plaintext={block.text.plaintext}
          facets={block.text.facets}
          emoji={block.emoji}
          color={block.color}
        />
      );
    }
    case "horizontalRule": {
      return <HorizontalRuleView />;
    }
    case "bulletList": {
      return (
        <StructuredBulletListView
          items={block.items}
          nested={nested}
          renderChildBlock={renderNested}
        />
      );
    }
    case "orderedList": {
      return (
        <StructuredOrderedListView
          items={block.items}
          nested={nested}
          renderChildBlock={renderNested}
          start={block.start}
        />
      );
    }
    case "taskList": {
      return <StructuredTaskListView items={block.items} />;
    }
    case "blueskyEmbed": {
      return <BskyPostEmbedView postUri={block.postUri} />;
    }
    case "image": {
      if (!structuredImageHasSource(block) || !blobContext) return null;
      const src = structuredImageUrl(block, blobContext.authorDid);
      if (!src) return null;
      return (
        <ImageFigureView
          src={src}
          alt={normalizeImageAlt(block.alt)}
          caption={block.caption}
          aspectRatio={structuredImageAspectRatio(block)}
          lightboxEnabled
          fit="natural"
        />
      );
    }
    case "code": {
      return (
        <CodeBlockView
          plaintext={block.plaintext}
          language={block.language}
          codeHighlights={codeHighlights}
        />
      );
    }
    case "iframe": {
      return <IframeEmbedView url={block.url} height={block.height} />;
    }
    case "table": {
      return <StructuredTableView rows={block.rows} />;
    }
    case "website": {
      return (
        <StructuredWebsiteView
          src={block.src}
          title={block.title}
          description={block.description}
          previewImage={block.previewImage}
        />
      );
    }
    case "gallery": {
      return (
        <PcktGalleryBlockView
          block={{ ref: block.ref }}
          blobContext={blobContext}
        />
      );
    }
    case "offprintComponent": {
      return <OffprintComponentBlockView componentUri={block.componentUri} />;
    }
    case "button": {
      return (
        <StructuredButtonBlockView
          text={block.text}
          href={block.href}
          caption={block.caption}
          alignment={block.alignment}
        />
      );
    }
    case "math": {
      return <StructuredMathBlockView tex={block.tex} />;
    }
    case "imageGrid": {
      return (
        <StructuredImageGridBlockView block={block} blobContext={blobContext} />
      );
    }
    case "imageCarousel": {
      return (
        <StructuredImageCarouselBlockView
          block={block}
          blobContext={blobContext}
        />
      );
    }
    case "imageDiff": {
      return (
        <StructuredImageDiffBlockView block={block} blobContext={blobContext} />
      );
    }
    case "html": {
      // Raw markup from the record, sanitized with the app's own schema —
      // `renderer-core` carries it but refuses to decide what is safe.
      const safe = sanitizeArticleHtml(block.html);
      return safe ? <div dangerouslySetInnerHTML={{ __html: safe }} /> : null;
    }
    case "unknown": {
      return <UnknownBlockView blockType={block.blockType} />;
    }
  }
}
