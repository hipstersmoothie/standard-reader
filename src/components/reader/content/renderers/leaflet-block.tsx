"use client";

import type { LeafletRenderableBlock } from "#/lib/leaflet/types";
import type { CodeHighlightsByScheme } from "#/lib/theme";

import { normalizeImageAlt } from "#/lib/document/structured-content/image";
import { leafletImageAspectRatio, leafletImageUrl } from "#/lib/leaflet/image";

import type { ContentBlobContext } from "../types";

import { LeafletButtonBlockView } from "./leaflet-button";
import {
  LeafletOrderedListBlockView,
  LeafletUnorderedListBlockView,
} from "./leaflet-list";
import { LeafletMathBlockView } from "./leaflet-math";
import { LeafletPollBlockView } from "./leaflet-poll";
import { LeafletSeparatorView } from "./leaflet-separator";
import { LeafletStandardSitePostBlockView } from "./leaflet-standard-site-post";
import { BlockquoteBlockView } from "./shared/blockquote-block";
import { BskyPostEmbedView } from "./shared/bsky-post-embed";
import { CodeBlockView } from "./shared/code-block";
import { TextBlockView } from "./shared/faceted-text";
import { HeadingBlockView } from "./shared/heading-block";
import { HorizontalRuleView } from "./shared/horizontal-rule";
import { IframeEmbedView } from "./shared/iframe-embed";
import { ImageFigureView } from "./shared/image-figure";
import { UnknownBlockView } from "./shared/unknown-block";
import { StructuredWebsiteView } from "./structured-views";

export function LeafletBlockView({
  block,
  blobContext,
  codeHighlights,
  dropCap = false,
}: {
  block: LeafletRenderableBlock;
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
    case "header": {
      return (
        <HeadingBlockView
          plaintext={block.block.plaintext}
          level={block.block.level}
        />
      );
    }
    case "blockquote": {
      return (
        <BlockquoteBlockView
          paragraphs={[
            {
              plaintext: block.block.plaintext,
              facets: block.block.facets,
            },
          ]}
        />
      );
    }
    case "horizontalRule": {
      return <HorizontalRuleView />;
    }
    case "unorderedList": {
      return <LeafletUnorderedListBlockView block={block.block} />;
    }
    case "orderedList": {
      return <LeafletOrderedListBlockView block={block.block} />;
    }
    case "bskyPost": {
      return <BskyPostEmbedView postUri={block.block.postRef?.uri} />;
    }
    case "image": {
      if (!blobContext) return null;
      const src = leafletImageUrl(
        block.block,
        blobContext.authorDid,
        blobContext.authorPds,
      );
      if (!src) return null;
      return (
        <ImageFigureView
          src={src}
          alt={normalizeImageAlt(block.block.alt)}
          aspectRatio={leafletImageAspectRatio(block.block)}
          fullBleed={block.block.fullBleed}
        />
      );
    }
    case "code": {
      return (
        <CodeBlockView
          plaintext={block.block.plaintext}
          language={block.block.language}
          codeHighlights={codeHighlights}
        />
      );
    }
    case "iframe": {
      return (
        <IframeEmbedView
          url={block.block.url ?? ""}
          aspectRatio={block.block.aspectRatio}
        />
      );
    }
    case "website": {
      const url = block.block.url?.trim();
      if (!url) return null;
      return (
        <StructuredWebsiteView
          src={url}
          title={block.block.title}
          description={block.block.description}
        />
      );
    }
    case "math": {
      return <LeafletMathBlockView block={block.block} />;
    }
    case "button": {
      return <LeafletButtonBlockView block={block.block} />;
    }
    case "poll": {
      return <LeafletPollBlockView block={block.block} />;
    }
    case "separator": {
      return <LeafletSeparatorView />;
    }
    case "standardSitePost": {
      return <LeafletStandardSitePostBlockView block={block.block} />;
    }
    case "unknown": {
      return <UnknownBlockView blockType={block.blockType} />;
    }
  }
}
