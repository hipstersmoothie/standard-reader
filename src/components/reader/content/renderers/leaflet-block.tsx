"use client";

import type { LeafletRenderableBlock } from "#/lib/leaflet/types";
import type { CodeHighlightsByScheme } from "#/lib/theme";

import {
  Disclosure,
  DisclosurePanel,
  DisclosureTitle,
} from "#/design-system/disclosure";
import { normalizeImageAlt } from "#/lib/document/structured-content/image";
import { leafletPageEmbedLabel, leafletWebsiteSrc } from "#/lib/leaflet/blocks";
import { leafletImageAspectRatio, leafletImageUrl } from "#/lib/leaflet/image";

import type { ContentBlobContext } from "../types";

import { articleBodyStyles } from "../body-styles";
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
  embedded = false,
}: {
  block: LeafletRenderableBlock;
  blobContext?: ContentBlobContext;
  codeHighlights?: CodeHighlightsByScheme;
  dropCap?: boolean;
  embedded?: boolean;
}) {
  switch (block.kind) {
    case "text": {
      return (
        <TextBlockView
          plaintext={block.block.plaintext}
          facets={block.block.facets}
          dropCap={dropCap}
          embedded={embedded}
        />
      );
    }
    case "header": {
      return (
        <HeadingBlockView
          plaintext={block.block.plaintext}
          level={block.block.level}
          embedded={embedded}
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
          embedded={embedded}
        />
      );
    }
    case "horizontalRule": {
      return <HorizontalRuleView embedded={embedded} />;
    }
    case "unorderedList": {
      return (
        <LeafletUnorderedListBlockView
          block={block.block}
          embedded={embedded}
        />
      );
    }
    case "orderedList": {
      return (
        <LeafletOrderedListBlockView block={block.block} embedded={embedded} />
      );
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
      const src = leafletWebsiteSrc(block.block);
      if (!src) return null;
      return (
        <StructuredWebsiteView
          src={src}
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
    case "pageEmbed": {
      return (
        <LeafletPageEmbedView
          blocks={block.blocks}
          blobContext={blobContext}
          codeHighlights={codeHighlights}
        />
      );
    }
    case "unknown": {
      return <UnknownBlockView blockType={block.blockType} />;
    }
  }
}

function LeafletPageEmbedView({
  blocks,
  blobContext,
  codeHighlights,
}: {
  blocks: Array<LeafletRenderableBlock>;
  blobContext?: ContentBlobContext;
  codeHighlights?: CodeHighlightsByScheme;
}) {
  if (blocks.length === 0) return null;

  const title = leafletPageEmbedLabel(blocks);
  let skippedTitleHeader = false;
  const bodyBlocks = blocks.filter((block) => {
    if (
      title &&
      !skippedTitleHeader &&
      block.kind === "header" &&
      block.block.plaintext.trim() === title
    ) {
      skippedTitleHeader = true;
      return false;
    }
    return true;
  });

  const label = title ?? "Linked page";

  return (
    <Disclosure size="sm" style={articleBodyStyles.pageEmbedDisclosure}>
      <DisclosureTitle aria-label={`Toggle ${label}`}>{label}</DisclosureTitle>
      {bodyBlocks.length > 0 ? (
        <DisclosurePanel contentStyle={articleBodyStyles.pageEmbedPanelContent}>
          {bodyBlocks.map((block, index) => (
            <LeafletBlockView
              key={index}
              block={block}
              blobContext={blobContext}
              codeHighlights={codeHighlights}
              embedded
            />
          ))}
        </DisclosurePanel>
      ) : null}
    </Disclosure>
  );
}
