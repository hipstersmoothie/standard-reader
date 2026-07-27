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
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import * as stylex from "@stylexjs/stylex";
import { use, useState } from "react";
import { flushSync } from "react-dom";

import { normalizeImageAlt } from "#/lib/document/structured-content/image";
import { MagazineColorContext } from "#/magazine/context";

import { articleBodyStyles } from "../../body-styles";

/** Caps how tall a naturally-proportioned image can render, matching the
 *  lightbox's own image cap so inline and expanded sizing feel consistent. */
const MAX_NATURAL_IMAGE_HEIGHT = "72vh";

const styles = stylex.create({
  imageButton: {
    padding: spacing["0"],
    borderWidth: 0,
    backgroundColor: "transparent",
    width: "100%",
  },
  imageButtonInteractive: {
    cursor: "zoom-in",
  },
  naturalWrapper: {
    display: "flex",
    justifyContent: "center",
    width: "100%",
  },
  naturalImage: (aspectRatio: number) => ({
    aspectRatio: `auto ${aspectRatio}`,
    display: "block",
    height: "auto",
    maxHeight: MAX_NATURAL_IMAGE_HEIGHT,
    maxWidth: "100%",
    width: "auto",
  }),
  naturalImageRounded: {
    borderRadius: radius.lg,
    cornerShape: "squircle",
  },
});

export function ImageFigureView({
  src,
  alt,
  aspectRatio = 16 / 9,
  fullBleed = false,
  lightboxEnabled = false,
  fit = "cover",
}: {
  src: string;
  alt?: string;
  aspectRatio?: number;
  fullBleed?: boolean;
  lightboxEnabled?: boolean;
  /** "cover" crops to `aspectRatio` (for grids/carousels with a uniform
   *  layout); "natural" shows the image's real proportions capped by
   *  `MAX_NATURAL_IMAGE_HEIGHT` instead of forcing a fixed box. */
  fit?: "cover" | "natural";
}) {
  const { t } = useLingui();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [transitionActive, setTransitionActive] = useState(false);
  const magazine = use(MagazineColorContext);
  const altText = normalizeImageAlt(alt);
  const canOpenLightbox = lightboxEnabled && !magazine;
  const transitionName = LIGHTBOX_IMAGE_TRANSITION_NAME;
  const natural = fit === "natural" && !magazine;

  const image = natural ? (
    <div {...stylex.props(styles.naturalWrapper)}>
      <img
        alt={altText}
        referrerPolicy="no-referrer"
        src={src}
        {...stylex.props(
          styles.naturalImage(aspectRatio),
          !fullBleed && styles.naturalImageRounded,
        )}
      />
    </div>
  ) : (
    <AspectRatio aspectRatio={aspectRatio} rounded={!fullBleed}>
      <AspectRatioImage alt={altText} referrerPolicy="no-referrer" src={src} />
    </AspectRatio>
  );

  return (
    <figure
      {...stylex.props(
        articleBodyStyles.imageFigure,
        fullBleed && !magazine ? articleBodyStyles.imageFullBleed : undefined,
      )}
    >
      {magazine ? (
        <img
          alt={altText}
          data-mag-block-photo=""
          loading="lazy"
          referrerPolicy="no-referrer"
          src={src}
        />
      ) : canOpenLightbox ? (
        <button
          aria-label={altText || t`Open image`}
          type="button"
          onClick={() => {
            flushSync(() => setTransitionActive(true));
            startLightboxViewTransition(() => setLightboxOpen(true));
          }}
          style={
            transitionActive && !lightboxOpen
              ? { viewTransitionName: transitionName }
              : undefined
          }
          {...stylex.props(styles.imageButton, styles.imageButtonInteractive)}
        >
          {image}
        </button>
      ) : (
        image
      )}
      {altText ? (
        <figcaption
          aria-hidden="true"
          {...stylex.props(articleBodyStyles.imageCaption)}
        >
          {altText}
        </figcaption>
      ) : null}
      {canOpenLightbox ? (
        <Lightbox
          alt={t`Image`}
          images={[
            {
              src,
              alt: altText,
              transitionName: transitionActive ? transitionName : undefined,
            },
          ]}
          isOpen={lightboxOpen}
          onOpenChange={(open) => {
            setLightboxOpen(open);
            if (!open) setTransitionActive(false);
          }}
        />
      ) : null}
    </figure>
  );
}
