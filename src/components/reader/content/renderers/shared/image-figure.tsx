"use client";

import * as stylex from "@stylexjs/stylex";
import { AspectRatio, AspectRatioImage } from "#/design-system/aspect-ratio";

import { articleBodyStyles } from "../../body-styles";

export function ImageFigureView({
  src,
  alt = "",
  aspectRatio = 16 / 9,
  fullBleed = false,
}: {
  src: string;
  alt?: string;
  aspectRatio?: number;
  fullBleed?: boolean;
}) {
  return (
    <figure
      {...stylex.props(
        articleBodyStyles.imageFigure,
        fullBleed ? articleBodyStyles.imageFullBleed : undefined,
      )}
    >
      <AspectRatio aspectRatio={aspectRatio} rounded={!fullBleed}>
        <AspectRatioImage alt={alt} referrerPolicy="no-referrer" src={src} />
      </AspectRatio>
    </figure>
  );
}
