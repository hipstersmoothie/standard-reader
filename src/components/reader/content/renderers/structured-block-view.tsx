"use client";

import type { StructuredRenderableBlock } from "#/lib/document/structured-content/types";
import type { CodeHighlightsByScheme } from "#/lib/theme";

import {
  structuredImageAspectRatio,
  structuredImageHasSource,
  structuredImageUrl,
} from "#/lib/document/structured-content/image";

import type { ContentBlobContext } from "../types";

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
}: {
  block: StructuredRenderableBlock;
  blobContext?: ContentBlobContext;
  codeHighlights?: CodeHighlightsByScheme;
  dropCap?: boolean;
}) {
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
      return <StructuredBulletListView items={block.items} />;
    }
    case "orderedList": {
      return (
        <StructuredOrderedListView items={block.items} start={block.start} />
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
      const src = structuredImageUrl(
        block,
        blobContext.authorDid,
        blobContext.authorPds,
      );
      if (!src) return null;
      return (
        <ImageFigureView
          src={src}
          alt={block.alt ?? ""}
          aspectRatio={structuredImageAspectRatio(block)}
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
        <PcktGalleryBlockView block={{ ref: block.ref }} blobContext={blobContext} />
      );
    }
    case "unknown": {
      return <UnknownBlockView blockType={block.blockType} />;
    }
  }
}
