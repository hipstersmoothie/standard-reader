"use client";

import { useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { use, useState } from "react";
import { flushSync } from "react-dom";

import { AspectRatio, AspectRatioImage } from "#/design-system/aspect-ratio";
import { Lightbox } from "#/design-system/lightbox";
import {
  LIGHTBOX_IMAGE_TRANSITION_NAME,
  startLightboxViewTransition,
} from "#/design-system/lightbox/transition";
import { spacing } from "#/design-system/theme/spacing.stylex";
import { fetchPcktGallery, pcktImageBlockFromAttrs } from "#/lib/pckt/gallery";
import {
  pcktImageAlt,
  pcktImageAspectRatio,
  pcktImageHasSource,
  pcktImageUrl,
} from "#/lib/pckt/image";
import type { PcktGalleryBlock } from "#/lib/pckt/types";
import { MagazineColorContext } from "#/magazine/context";

import { articleBodyStyles } from "../body-styles";
import type { ContentBlobContext } from "../types";
import { ImageFigureView } from "./shared/image-figure";

const galleryStyles = stylex.create({
  imageButton: {
    padding: spacing["0"],
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: "zoom-in",
    display: "block",
    width: "100%",
  },
});

interface GalleryImage {
  src: string;
  alt: string;
  aspectRatio: number;
}

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
  const { t } = useLingui();
  const magazine = use(MagazineColorContext);
  // `lightboxIndex` is which image the lightbox opened on; `transitionIndex` is
  // the thumbnail that owns the shared view-transition name while it animates
  // into (and back out of) the expanded image.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [transitionIndex, setTransitionIndex] = useState<number | null>(null);
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

  const images: Array<GalleryImage> = [];
  for (const attrs of gallery?.images ?? []) {
    const imageBlock = pcktImageBlockFromAttrs(attrs);
    if (!pcktImageHasSource(imageBlock)) continue;
    const src = pcktImageUrl(
      imageBlock,
      galleryDid ?? blobContext?.authorDid ?? "",
    );
    if (!src) continue;
    images.push({
      src,
      alt: pcktImageAlt(imageBlock),
      aspectRatio: pcktImageAspectRatio(imageBlock),
    });
  }

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
          {images.map((image, index) => {
            const position = index + 1;
            return (
              <div key={index} {...stylex.props(itemStyle)}>
                {/* In magazine mode the edition binds its own lightbox to the
                  bare <img>, so defer to `ImageFigureView`'s magazine
                  rendering rather than wrapping the image in a button. */}
                {magazine ? (
                  <ImageFigureView
                    src={image.src}
                    alt={image.alt}
                    aspectRatio={image.aspectRatio}
                  />
                ) : (
                  <figure {...stylex.props(articleBodyStyles.imageFigure)}>
                    <button
                      aria-label={image.alt || t`Open image ${position}`}
                      type="button"
                      onClick={() => {
                        flushSync(() => setTransitionIndex(index));
                        startLightboxViewTransition(() =>
                          setLightboxIndex(index),
                        );
                      }}
                      style={
                        transitionIndex === index && lightboxIndex !== index
                          ? {
                              viewTransitionName:
                                LIGHTBOX_IMAGE_TRANSITION_NAME,
                            }
                          : undefined
                      }
                      {...stylex.props(galleryStyles.imageButton)}
                    >
                      <AspectRatio aspectRatio={image.aspectRatio} rounded>
                        <AspectRatioImage
                          alt={image.alt}
                          referrerPolicy="no-referrer"
                          src={image.src}
                        />
                      </AspectRatio>
                    </button>
                    {image.alt ? (
                      <figcaption
                        aria-hidden="true"
                        {...stylex.props(articleBodyStyles.imageCaption)}
                      >
                        {image.alt}
                      </figcaption>
                    ) : null}
                  </figure>
                )}
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
      {magazine ? null : (
        <Lightbox
          alt={t`Image gallery`}
          images={images.map((image, index) => ({
            ...image,
            transitionName:
              transitionIndex === index
                ? LIGHTBOX_IMAGE_TRANSITION_NAME
                : undefined,
          }))}
          initialIndex={lightboxIndex ?? 0}
          isOpen={lightboxIndex !== null}
          onOpenChange={(open) => {
            if (!open) {
              setLightboxIndex(null);
              setTransitionIndex(null);
            }
          }}
        />
      )}
    </figure>
  );
}
