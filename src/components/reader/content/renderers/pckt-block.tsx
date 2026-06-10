"use client";

import type { PcktRenderableBlock } from "#/lib/pckt/types";
import type { CodeHighlightsByScheme } from "#/lib/theme";

import { asTextBlock, pcktCodeLanguage } from "#/lib/pckt/blocks";
import {
  pcktImageAlt,
  pcktImageAspectRatio,
  pcktImageHasSource,
  pcktImageUrl,
} from "#/lib/pckt/image";

import type { ContentBlobContext } from "../types";

import {
  PcktBulletListBlockView,
  PcktOrderedListBlockView,
  PcktTaskListBlockView,
} from "./pckt-list";
import { PcktGalleryBlockView } from "./pckt-gallery";
import { PcktTableBlockView } from "./pckt-table";
import { PcktWebsiteBlockView } from "./pckt-website";
import { BlockquoteBlockView } from "./shared/blockquote-block";
import { BskyPostEmbedView } from "./shared/bsky-post-embed";
import { CodeBlockView } from "./shared/code-block";
import { TextBlockView } from "./shared/faceted-text";
import { HeadingBlockView } from "./shared/heading-block";
import { HorizontalRuleView } from "./shared/horizontal-rule";
import { IframeEmbedView } from "./shared/iframe-embed";
import { ImageFigureView } from "./shared/image-figure";
import { UnknownBlockView } from "./shared/unknown-block";

export function PcktBlockView({
  block,
  blobContext,
  codeHighlights,
  dropCap = false,
}: {
  block: PcktRenderableBlock;
  blobContext?: ContentBlobContext;
  codeHighlights?: CodeHighlightsByScheme;
  dropCap?: boolean;
}) {
  switch (block.kind) {
    case "text": {
      return (
        <TextBlockView
          plaintext={block.block.plaintext}
          facets={block.block.facets}
          dropCap={dropCap}
        />
      );
    }
    case "heading": {
      return (
        <HeadingBlockView
          plaintext={block.block.plaintext}
          level={block.block.level}
          facets={block.block.facets}
        />
      );
    }
    case "blockquote": {
      return (
        <BlockquoteBlockView
          paragraphs={(block.block.content ?? []).flatMap((entry) => {
            const text = asTextBlock(entry);
            if (!text?.plaintext.trim()) return [];
            return [{ plaintext: text.plaintext, facets: text.facets }];
          })}
        />
      );
    }
    case "horizontalRule": {
      return <HorizontalRuleView />;
    }
    case "bulletList": {
      return <PcktBulletListBlockView block={block.block} />;
    }
    case "orderedList": {
      return <PcktOrderedListBlockView block={block.block} />;
    }
    case "taskList": {
      return <PcktTaskListBlockView block={block.block} />;
    }
    case "blueskyEmbed": {
      return <BskyPostEmbedView postUri={block.block.postRef?.uri} />;
    }
    case "image": {
      if (!pcktImageHasSource(block.block) || !blobContext) return null;
      const src = pcktImageUrl(
        block.block,
        blobContext.authorDid,
        blobContext.authorPds,
      );
      if (!src) return null;
      return (
        <ImageFigureView
          src={src}
          alt={pcktImageAlt(block.block)}
          aspectRatio={pcktImageAspectRatio(block.block)}
        />
      );
    }
    case "code": {
      return (
        <CodeBlockView
          plaintext={block.block.plaintext}
          language={pcktCodeLanguage(block.block)}
          codeHighlights={codeHighlights}
        />
      );
    }
    case "iframe": {
      return (
        <IframeEmbedView
          url={block.block.url ?? ""}
          height={block.block.height}
        />
      );
    }
    case "table": {
      return <PcktTableBlockView block={block.block} />;
    }
    case "website": {
      return <PcktWebsiteBlockView block={block.block} />;
    }
    case "gallery": {
      return (
        <PcktGalleryBlockView block={block.block} blobContext={blobContext} />
      );
    }
    case "unknown": {
      return <UnknownBlockView blockType={block.blockType} />;
    }
  }
}
