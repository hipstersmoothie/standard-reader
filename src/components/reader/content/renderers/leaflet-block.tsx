"use client";

import type { LeafletRenderableBlock } from "#/lib/leaflet/types";
import type { CodeHighlightsByScheme } from "#/lib/theme";

import type { ContentBlobContext } from "../types";

import { LeafletBlockquoteBlockView } from "./leaflet-blockquote";
import { LeafletBskyPostBlockView } from "./leaflet-bsky-post";
import { LeafletCodeBlockView } from "./leaflet-code";
import { LeafletHeaderBlockView } from "./leaflet-header";
import { LeafletIframeBlockView } from "./leaflet-iframe";
import { LeafletHorizontalRuleBlockView } from "./leaflet-horizontal-rule";
import { LeafletImageBlockView } from "./leaflet-image";
import { LeafletUnorderedListBlockView } from "./leaflet-list";
import { LeafletTextBlockView } from "./leaflet-text";
import { LeafletUnknownBlockView } from "./leaflet-unknown";

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
    case "text":
      return <LeafletTextBlockView block={block.block} dropCap={dropCap} />;
    case "header":
      return <LeafletHeaderBlockView block={block.block} />;
    case "blockquote":
      return <LeafletBlockquoteBlockView block={block.block} />;
    case "horizontalRule":
      return <LeafletHorizontalRuleBlockView />;
    case "unorderedList":
      return <LeafletUnorderedListBlockView block={block.block} />;
    case "bskyPost":
      return <LeafletBskyPostBlockView block={block.block} />;
    case "image":
      return (
        <LeafletImageBlockView block={block.block} blobContext={blobContext} />
      );
    case "code":
      return (
        <LeafletCodeBlockView
          block={block.block}
          codeHighlights={codeHighlights}
        />
      );
    case "iframe":
      return <LeafletIframeBlockView block={block.block} />;
    case "unknown":
      return <LeafletUnknownBlockView blockType={block.blockType} />;
  }
}
