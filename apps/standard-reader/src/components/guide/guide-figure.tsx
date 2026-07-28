"use client";

import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { useState, useSyncExternalStore } from "react";

import type { GuideShotId } from "#/lib/guide/screenshots";
import { getGuideShot, guideShotSrc } from "#/lib/guide/screenshots";
import { readDomResolvedScheme, subscribeToResolvedScheme } from "#/lib/theme";

import { guideStyles } from "./guide-page.stylex";

/**
 * A screenshot in the guide.
 *
 * The picture itself is produced by `pnpm guide:shots` — this component only
 * knows the shot's id, and reads its declared viewport as the image's
 * intrinsic size so the page doesn't jump while it loads.
 *
 * Two deliberate behaviors:
 *
 * - **Alt text is required.** A screenshot that only shows what it shows to
 *   sighted readers isn't documentation. Describe what the picture
 *   demonstrates, not that it is a screenshot.
 * - **A missing file degrades to its caption.** Captures are refreshed on
 *   demand rather than at build time, so a newly-declared shot may not exist
 *   yet. That should read as a page without a picture, not a broken image.
 */
export function GuideFigure({
  shot,
  alt,
  caption,
}: {
  shot: GuideShotId;
  alt: string;
  caption?: ReactNode;
}) {
  const meta = getGuideShot(shot);
  const [failed, setFailed] = useState(false);

  const scheme = useSyncExternalStore(
    subscribeToResolvedScheme,
    () => readDomResolvedScheme() ?? "light",
    () => "light" as const,
  );

  const useDark = scheme === "dark" && meta.schemes.includes("dark");
  const src = guideShotSrc(meta.id, useDark ? "dark" : "light");

  if (failed) {
    return caption == null ? null : (
      <p {...stylex.props(guideStyles.figureCaption)}>{caption}</p>
    );
  }

  return (
    <figure {...stylex.props(guideStyles.figure)}>
      <span {...stylex.props(guideStyles.figureFrame)}>
        <img
          key={src}
          src={src}
          alt={alt}
          width={meta.viewport.width}
          height={meta.viewport.height}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          {...stylex.props(guideStyles.figureImage)}
        />
      </span>
      {caption == null ? null : (
        <figcaption {...stylex.props(guideStyles.figureCaption)}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
