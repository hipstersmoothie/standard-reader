"use client";

import type { PcktGalleryBlock } from "#/lib/pckt/types";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { fetchPcktGallery, pcktImageBlockFromAttrs } from "#/lib/pckt/gallery";
import {
  pcktImageAlt,
  pcktImageAspectRatio,
  pcktImageHasSource,
  pcktImageUrl,
} from "#/lib/pckt/image";

import type { ContentBlobContext } from "../types";

import { articleBodyStyles } from "../body-styles";
import { ImageFigureView } from "./shared/image-figure";

function galleryLayoutStyle(layout: string | undefined) {
  switch (layout) {
    case "carousel": {
      return articleBodyStyles.galleryCarousel;
    }
    case "masonry": {
      return articleBodyStyles.galleryMasonry;
    }
    case "list": {
      return articleBodyStyles.galleryList;
    }
    default: {
      return articleBodyStyles.galleryGrid;
    }
  }
}

function galleryItemStyle(layout: string | undefined) {
  return layout === "carousel"
    ? articleBodyStyles.galleryCarouselItem
    : layout === "masonry"
      ? articleBodyStyles.galleryMasonryItem
      : undefined;
}

export function PcktGalleryBlockView({
  block,
  blobContext,
}: {
  block: PcktGalleryBlock;
  blobContext?: ContentBlobContext;
}) {
  const galleryUri = block.ref?.trim();
  const { data: resolved, isPending } = useQuery({
    queryKey: ["pckt-gallery", galleryUri] as const,
    queryFn: async () => {
      if (!galleryUri) return null;
      return fetchPcktGallery(galleryUri);
    },
    enabled: Boolean(galleryUri),
    staleTime: 5 * 60 * 1000,
  });

  if (!galleryUri) return null;

  const gallery = resolved?.record;
  const galleryDid = resolved?.did;

  const title = gallery?.title?.trim();
  const caption = gallery?.caption?.trim();
  const layout = gallery?.layout?.trim() || "grid";
  const images = (gallery?.images ?? []).filter((attrs) =>
    pcktImageHasSource(pcktImageBlockFromAttrs(attrs)),
  );

  const layoutStyle = galleryLayoutStyle(layout);
  const itemStyle = galleryItemStyle(layout);

  return (
    <figure {...stylex.props(articleBodyStyles.gallery)}>
      {title ? (
        <figcaption {...stylex.props(articleBodyStyles.galleryTitle)}>
          {title}
        </figcaption>
      ) : null}
      {isPending && images.length === 0 ? (
        <div {...stylex.props(layoutStyle)}>
          <div {...stylex.props(articleBodyStyles.gallerySkeleton)} />
        </div>
      ) : null}
      {images.length > 0 ? (
        <div {...stylex.props(layoutStyle)}>
          {images.map((attrs, index) => {
            const imageBlock = pcktImageBlockFromAttrs(attrs);
            const src = pcktImageUrl(
              imageBlock,
              galleryDid ?? blobContext?.authorDid ?? "",
            );
            if (!src) return null;
            return (
              <div key={index} {...stylex.props(itemStyle)}>
                <ImageFigureView
                  src={src}
                  alt={pcktImageAlt(imageBlock)}
                  aspectRatio={pcktImageAspectRatio(imageBlock)}
                />
              </div>
            );
          })}
        </div>
      ) : null}
      {caption ? (
        <figcaption {...stylex.props(articleBodyStyles.galleryCaption)}>
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
