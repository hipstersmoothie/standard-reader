import { Fragment, type ReactNode } from "react";

import { useComponents, useDocumentContext } from "../components/context";
import { asTextBlock, leafletWebsiteSrc } from "../core/leaflet/blocks";
import { leafletImageAspectRatio } from "../core/leaflet/image";
import type {
  LeafletListItem,
  LeafletOrderedListBlock,
  LeafletRenderableBlock,
  LeafletUnorderedListBlock,
} from "../core/leaflet/types";
import { LEAFLET_BLOCK } from "../core/leaflet/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Render an ordered list of Leaflet blocks. */
export function LeafletBlockList({
  blocks,
  dropCapIndex,
}: {
  blocks: Array<LeafletRenderableBlock>;
  dropCapIndex: number;
}) {
  return (
    <>
      {blocks.map((block, index) => (
        <LeafletBlock
          key={index}
          block={block}
          dropCap={index === dropCapIndex}
        />
      ))}
    </>
  );
}

export function LeafletBlock({
  block,
  dropCap = false,
}: {
  block: LeafletRenderableBlock;
  dropCap?: boolean;
}) {
  const { shared, leaflet } = useComponents();
  const { authorDid, resolveImageUrl } = useDocumentContext();

  switch (block.kind) {
    case "text": {
      if (!block.block.plaintext) return null;
      return (
        <shared.Paragraph dropCap={dropCap}>
          <shared.FacetText
            plaintext={block.block.plaintext}
            facets={block.block.facets}
          />
        </shared.Paragraph>
      );
    }
    case "header": {
      if (!block.block.plaintext) return null;
      return (
        <shared.Heading level={block.block.level ?? 2}>
          <shared.FacetText
            plaintext={block.block.plaintext}
            facets={block.block.facets}
          />
        </shared.Heading>
      );
    }
    case "blockquote": {
      return (
        <shared.Blockquote>
          <shared.Paragraph>
            <shared.FacetText
              plaintext={block.block.plaintext}
              facets={block.block.facets}
            />
          </shared.Paragraph>
        </shared.Blockquote>
      );
    }
    case "horizontalRule":
      return <shared.HorizontalRule />;
    case "unorderedList":
      return <LeafletList block={block.block} ordered={false} />;
    case "orderedList":
      return <LeafletList block={block.block} ordered />;
    case "bskyPost": {
      const uri = block.block.postRef?.uri;
      return uri ? <shared.BlueskyEmbed postUri={uri} /> : null;
    }
    case "image": {
      const src = resolveImageUrl({ blob: block.block.image, authorDid });
      if (!src) return null;
      return (
        <shared.Image
          src={src}
          alt={block.block.alt?.trim() || ""}
          aspectRatio={leafletImageAspectRatio(block.block)}
          fullBleed={block.block.fullBleed}
        />
      );
    }
    case "code":
      return (
        <shared.Code
          code={block.block.plaintext}
          language={block.block.language}
        />
      );
    case "iframe":
      return (
        <shared.Iframe
          url={block.block.url ?? ""}
          height={block.block.height}
          aspectRatio={block.block.aspectRatio}
        />
      );
    case "website": {
      const src = leafletWebsiteSrc(block.block);
      if (!src) return null;
      return (
        <shared.Website
          src={src}
          title={block.block.title}
          description={block.block.description}
          previewImage={block.block.previewImage}
        />
      );
    }
    case "math": {
      const tex = block.block.tex?.trim();
      return tex ? <shared.Math tex={tex} /> : null;
    }
    case "button": {
      const href = block.block.url?.trim();
      const text = block.block.text?.trim();
      if (!href || !text) return null;
      return <shared.Button href={href} text={text} />;
    }
    case "poll": {
      const uri = block.block.pollRef?.uri;
      return uri ? <leaflet.Poll pollUri={uri} /> : null;
    }
    case "separator":
      return <leaflet.Separator />;
    case "standardSitePost": {
      const uri = block.block.uri;
      return uri ? <leaflet.StandardSitePost uri={uri} /> : null;
    }
    case "standardSitePublication": {
      const uri = block.block.uri;
      return uri ? (
        <leaflet.StandardSitePublication
          uri={uri}
          cid={block.block.cid}
          showPublicationTheme={block.block.showPublicationTheme}
        />
      ) : null;
    }
    case "imageGallery": {
      const images = (block.block.images ?? []).flatMap((image) => {
        const src = resolveImageUrl({ blob: image.image, authorDid });
        if (!src) return [];
        return [
          {
            src,
            alt: image.alt?.trim() || "",
            aspectRatio: leafletImageAspectRatio(image),
          },
        ];
      });
      if (images.length === 0) return null;
      const Collection =
        (block.block.format?.trim() || "grid") === "carousel"
          ? shared.ImageCarousel
          : shared.ImageGrid;
      return <Collection images={images} layout={block.block.format} />;
    }
    case "signup":
      return <leaflet.Signup />;
    case "pageEmbed":
      return (
        <leaflet.PageEmbed pageId={block.pageId} pageType={block.pageType}>
          <LeafletBlockList blocks={block.blocks} dropCapIndex={-1} />
        </leaflet.PageEmbed>
      );
    case "unknown":
      return <shared.Unknown blockType={block.blockType} />;
  }
}

function LeafletList({
  block,
  ordered,
}: {
  block: LeafletUnorderedListBlock | LeafletOrderedListBlock;
  ordered: boolean;
}) {
  const { shared } = useComponents();
  const items = (block.children ?? []).filter(
    (child) => leafletItemText(child) || leafletNestedList(child),
  );
  if (items.length === 0) return null;

  const rendered = (
    <>
      {items.map((item, index) => (
        <LeafletListItemView key={index} item={item} />
      ))}
    </>
  );

  return ordered ? (
    <shared.OrderedList start={(block as LeafletOrderedListBlock).startIndex}>
      {rendered}
    </shared.OrderedList>
  ) : (
    <shared.BulletList>{rendered}</shared.BulletList>
  );
}

function LeafletListItemView({ item }: { item: LeafletListItem }) {
  const { shared } = useComponents();
  const text = leafletItemText(item);
  const nested = leafletNestedList(item);
  return (
    <shared.ListItem>
      {text ? (
        <shared.FacetText plaintext={text.plaintext} facets={text.facets} />
      ) : null}
      {nested}
    </shared.ListItem>
  );
}

function leafletItemText(item: LeafletListItem) {
  const text = asTextBlock(item.content);
  if (!text?.plaintext.trim()) return null;
  return text;
}

function leafletNestedList(item: LeafletListItem): ReactNode {
  if (item.children?.length) {
    return <LeafletList block={{ children: item.children }} ordered />;
  }
  const unordered = item.unorderedListChildren;
  if (
    isRecord(unordered) &&
    unordered.$type === LEAFLET_BLOCK.unorderedList &&
    Array.isArray(unordered.children) &&
    unordered.children.length > 0
  ) {
    return (
      <LeafletList
        block={unordered as LeafletUnorderedListBlock}
        ordered={false}
      />
    );
  }
  const ordered = item.orderedListChildren;
  if (
    isRecord(ordered) &&
    ordered.$type === LEAFLET_BLOCK.orderedList &&
    Array.isArray(ordered.children) &&
    ordered.children.length > 0
  ) {
    return (
      <Fragment>
        <LeafletList block={ordered as LeafletOrderedListBlock} ordered />
      </Fragment>
    );
  }
  return null;
}
