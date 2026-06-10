"use client";

import * as stylex from "@stylexjs/stylex";
import { AspectRatio, AspectRatioImage } from "#/design-system/aspect-ratio";
import { normalizeImageAlt } from "#/lib/document/structured-content/image";

import { articleBodyStyles } from "../../body-styles";

export function ImageFigureView({
  src,
  alt,
  aspectRatio = 16 / 9,
  fullBleed = false,
}: {
  src: string;
  alt?: string;
  aspectRatio?: number;
  fullBleed?: boolean;
}) {
  const altText = normalizeImageAlt(alt);

  return (
    <figure
      {...stylex.props(
        articleBodyStyles.imageFigure,
        fullBleed ? articleBodyStyles.imageFullBleed : undefined,
      )}
    >
      <AspectRatio aspectRatio={aspectRatio} rounded={!fullBleed}>
        <AspectRatioImage
          alt={altText}
          referrerPolicy="no-referrer"
          src={src}
        />
      </AspectRatio>
      {altText ? (
        <figcaption
          aria-hidden="true"
          {...stylex.props(articleBodyStyles.imageCaption)}
        >
          {altText}
        </figcaption>
      ) : null}
    </figure>
  );
}
