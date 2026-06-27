"use client";

import type {
  StructuredGridImage,
  StructuredRenderableBlock,
} from "#/lib/document/structured-content/types";

import * as stylex from "@stylexjs/stylex";
import {
  structuredImageAspectRatio,
  structuredImageUrl,
} from "#/lib/document/structured-content/image";
import { useState } from "react";

import type { ContentBlobContext } from "../../types";

import { articleBodyStyles } from "../../body-styles";
import { ImageFigureView } from "./image-figure";

function blockAlignmentStyle(alignment?: string) {
  switch (alignment) {
    case "center": {
      return articleBodyStyles.alignCenter;
    }
    case "right": {
      return articleBodyStyles.alignRight;
    }
    default: {
      return articleBodyStyles.alignLeft;
    }
  }
}

function aspectRatioForMode(image: StructuredGridImage, mode?: string): number {
  switch (mode) {
    case "square": {
      return 1;
    }
    case "portrait": {
      return 3 / 4;
    }
    case "landscape": {
      return 4 / 3;
    }
    default: {
      return structuredImageAspectRatio(image);
    }
  }
}

function gridColumnCount(imageCount: number, gridRows?: number): number {
  const rows = gridRows === 2 ? 2 : 1;
  return Math.max(1, Math.ceil(imageCount / rows));
}

function StructuredGridImageView({
  image,
  blobContext,
  aspectRatio,
}: {
  image: StructuredGridImage;
  blobContext: ContentBlobContext;
  aspectRatio: number;
}) {
  const src = structuredImageUrl(image, blobContext.authorDid);
  if (!src) return null;

  return (
    <ImageFigureView src={src} alt={image.alt} aspectRatio={aspectRatio} />
  );
}

export function StructuredImageGridBlockView({
  block,
  blobContext,
}: {
  block: Extract<StructuredRenderableBlock, { kind: "imageGrid" }>;
  blobContext?: ContentBlobContext;
}) {
  if (!blobContext || block.images.length < 2) return null;

  const columns = gridColumnCount(block.images.length, block.gridRows);

  return (
    <figure {...stylex.props(articleBodyStyles.gallery)}>
      <div
        {...stylex.props(articleBodyStyles.galleryGrid)}
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {block.images.map((image, index) => (
          <div key={index}>
            <StructuredGridImageView
              image={image}
              blobContext={blobContext}
              aspectRatio={aspectRatioForMode(image, block.aspectRatioMode)}
            />
          </div>
        ))}
      </div>
      {block.caption?.trim() ? (
        <figcaption {...stylex.props(articleBodyStyles.galleryCaption)}>
          {block.caption.trim()}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function StructuredImageCarouselBlockView({
  block,
  blobContext,
}: {
  block: Extract<StructuredRenderableBlock, { kind: "imageCarousel" }>;
  blobContext?: ContentBlobContext;
}) {
  if (!blobContext || block.images.length < 2) return null;

  return (
    <figure {...stylex.props(articleBodyStyles.gallery)}>
      <div {...stylex.props(articleBodyStyles.galleryCarousel)}>
        {block.images.map((image, index) => (
          <div
            key={index}
            {...stylex.props(articleBodyStyles.galleryCarouselItem)}
          >
            <StructuredGridImageView
              image={image}
              blobContext={blobContext}
              aspectRatio={structuredImageAspectRatio(image)}
            />
          </div>
        ))}
      </div>
      {block.caption?.trim() ? (
        <figcaption {...stylex.props(articleBodyStyles.galleryCaption)}>
          {block.caption.trim()}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function StructuredImageDiffBlockView({
  block,
  blobContext,
}: {
  block: Extract<StructuredRenderableBlock, { kind: "imageDiff" }>;
  blobContext?: ContentBlobContext;
}) {
  const [position, setPosition] = useState(50);

  if (!blobContext) return null;

  const [beforeImage, afterImage] = block.images;
  const beforeSrc = structuredImageUrl(beforeImage, blobContext.authorDid);
  const afterSrc = structuredImageUrl(afterImage, blobContext.authorDid);
  if (!beforeSrc || !afterSrc) return null;

  const aspectRatio = Math.max(
    structuredImageAspectRatio(beforeImage),
    structuredImageAspectRatio(afterImage),
  );
  const beforeLabel = block.labels?.[0]?.trim() || "Before";
  const afterLabel = block.labels?.[1]?.trim() || "After";

  return (
    <figure
      {...stylex.props(
        articleBodyStyles.gallery,
        blockAlignmentStyle(block.alignment),
      )}
    >
      <div
        {...stylex.props(articleBodyStyles.imageDiff)}
        style={{ aspectRatio: String(aspectRatio) }}
      >
        <img
          alt={afterImage.alt ?? afterLabel}
          referrerPolicy="no-referrer"
          src={afterSrc}
          {...stylex.props(articleBodyStyles.imageDiffImage)}
        />
        <div
          {...stylex.props(articleBodyStyles.imageDiffBeforeClip)}
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <img
            alt={beforeImage.alt ?? beforeLabel}
            referrerPolicy="no-referrer"
            src={beforeSrc}
            {...stylex.props(articleBodyStyles.imageDiffImage)}
          />
        </div>
        <div
          {...stylex.props(articleBodyStyles.imageDiffHandle)}
          style={{ left: `${position}%` }}
        />
        <input
          aria-label="Compare before and after images"
          max={100}
          min={0}
          type="range"
          value={position}
          {...stylex.props(articleBodyStyles.imageDiffSlider)}
          onChange={(event) => {
            setPosition(Number(event.target.value));
          }}
        />
        <span {...stylex.props(articleBodyStyles.imageDiffLabelBefore)}>
          {beforeLabel}
        </span>
        <span {...stylex.props(articleBodyStyles.imageDiffLabelAfter)}>
          {afterLabel}
        </span>
      </div>
      {block.caption?.trim() ? (
        <figcaption {...stylex.props(articleBodyStyles.galleryCaption)}>
          {block.caption.trim()}
        </figcaption>
      ) : null}
    </figure>
  );
}
