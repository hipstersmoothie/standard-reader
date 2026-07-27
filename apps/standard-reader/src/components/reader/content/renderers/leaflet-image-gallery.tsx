"use client";

import { useLingui } from "@lingui/react/macro";
import {
  AspectRatio,
  AspectRatioImage,
} from "@standard-reader/design-system/aspect-ratio";
import { Lightbox } from "@standard-reader/design-system/lightbox";
import {
  LIGHTBOX_IMAGE_TRANSITION_NAME,
  startLightboxViewTransition,
} from "@standard-reader/design-system/lightbox/transition";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import * as stylex from "@stylexjs/stylex";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { normalizeImageAlt } from "#/lib/document/structured-content/image";
import { leafletImageAspectRatio, leafletImageUrl } from "#/lib/leaflet/image";
import type { LeafletImageGalleryBlock } from "#/lib/leaflet/types";

import { articleBodyStyles } from "../body-styles";
import type { ContentBlobContext } from "../types";

const GRID_LANES_COLUMNS = "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))";
const GRID_LANES_MIN_COLUMN_PX = 288;
const GRID_LANES_GAP_PX = 8;

const galleryStyles = stylex.create({
  imageButton: {
    padding: spacing["0"],
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: "zoom-in",
    display: "block",
    width: "100%",
  },
  itemFigure: {
    marginBottom: spacing["0"],
    marginInlineStart: spacing["0"],
    marginInlineEnd: spacing["0"],
    marginTop: spacing["0"],
    width: "100%",
  },
  grid: {
    gap: gap.md,
    alignItems: "start",
    display: "grid",
    gridTemplateColumns: GRID_LANES_COLUMNS,
  },
});

interface GalleryImage {
  src: string;
  alt: string;
  aspectRatio: number;
}

export function LeafletImageGalleryBlockView({
  block,
  blobContext,
}: {
  block: LeafletImageGalleryBlock;
  blobContext?: ContentBlobContext;
}) {
  const { t } = useLingui();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [transitionIndex, setTransitionIndex] = useState<number | null>(null);
  const [polyfillColumns, setPolyfillColumns] = useState(
    "repeat(1, minmax(0, 1fr))",
  );
  const gridRef = useRef<HTMLDivElement | null>(null);
  const format = block.format?.trim() || "grid";
  const isCarousel = format === "carousel";

  useEffect(() => {
    if (isCarousel) return;
    const element = gridRef.current;
    if (!element || globalThis.ResizeObserver === undefined) return;

    const updateColumns = () => {
      const width = element.getBoundingClientRect().width;
      if (width <= 0) return;
      const columns = Math.max(
        1,
        Math.floor(
          (width + GRID_LANES_GAP_PX) /
            (GRID_LANES_MIN_COLUMN_PX + GRID_LANES_GAP_PX),
        ),
      );
      const columnWidth = (width - GRID_LANES_GAP_PX * (columns - 1)) / columns;
      setPolyfillColumns(`repeat(${columns}, ${columnWidth}px)`);
    };

    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isCarousel]);

  useEffect(() => {
    if (isCarousel) return;
    const element = gridRef.current;
    if (!element) return;

    let cleanup: { destroy?: () => void } | null = null;
    let cancelled = false;

    void import("#/vendor/grid-lanes-polyfill.js").then(
      ({ apply, supportsGridLanes }) => {
        if (cancelled || supportsGridLanes()) return;
        cleanup = apply(element, { force: true });
      },
    );

    return () => {
      cancelled = true;
      cleanup?.destroy?.();
    };
  }, [isCarousel]);

  if (!blobContext) return null;

  const allImages = block.images ?? [];
  if (allImages.length === 0) return null;

  const galleryImages: Array<GalleryImage> = [];
  for (const image of allImages) {
    const src = leafletImageUrl(image, blobContext.authorDid);
    if (!src) continue;
    galleryImages.push({
      src,
      alt: normalizeImageAlt(image.alt),
      aspectRatio: leafletImageAspectRatio(image),
    });
  }

  if (galleryImages.length === 0) return null;

  const gridLanesStyle: CSSProperties & {
    "--grid-lanes-polyfill": string;
    "--grid-template-columns": string;
  } = {
    display: "grid-lanes",
    gridTemplateColumns: GRID_LANES_COLUMNS,
    "--grid-lanes-polyfill": "1",
    "--grid-template-columns": polyfillColumns,
  };

  return (
    <figure {...stylex.props(articleBodyStyles.gallery)}>
      <div
        ref={isCarousel ? undefined : gridRef}
        {...stylex.props(
          isCarousel ? articleBodyStyles.galleryCarousel : galleryStyles.grid,
        )}
        style={isCarousel ? undefined : gridLanesStyle}
      >
        {galleryImages.map((image, index) => {
          const transitionName = LIGHTBOX_IMAGE_TRANSITION_NAME;
          const position = index + 1;
          return (
            <figure
              key={index}
              {...stylex.props(
                galleryStyles.itemFigure,
                isCarousel && articleBodyStyles.galleryCarouselItem,
              )}
            >
              <button
                aria-label={image.alt || t`Open image ${position}`}
                type="button"
                onClick={() => {
                  flushSync(() => setTransitionIndex(index));
                  startLightboxViewTransition(() => setLightboxIndex(index));
                }}
                style={
                  transitionIndex === index && lightboxIndex !== index
                    ? { viewTransitionName: transitionName }
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
              {isCarousel && image.alt ? (
                <figcaption
                  aria-hidden="true"
                  {...stylex.props(articleBodyStyles.imageCaption)}
                >
                  {image.alt}
                </figcaption>
              ) : null}
            </figure>
          );
        })}
      </div>
      <Lightbox
        alt={t`Image gallery`}
        images={galleryImages.map((image, index) => ({
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
    </figure>
  );
}
