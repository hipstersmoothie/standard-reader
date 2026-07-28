"use client";

import * as stylex from "@stylexjs/stylex";

import {
  articleBodyStyles,
  IFRAME_FRAME_BORDER_WIDTH,
} from "../../body-styles";
import { parsePixelDimension } from "./iframe-dimensions";

const DEFAULT_ASPECT_RATIO = "16 / 9";

/**
 * The bordered, correctly-sized box every `<iframe>` embed sits in.
 *
 * Shared by the URL embeds (`IframeEmbedView`) and the srcdoc embeds
 * (`HtmlEmbedView`) so the two cannot drift on sizing: the iframe itself is
 * absolutely positioned to fill the frame, and the frame decides how tall it is.
 */
export function EmbedFrame({
  height,
  aspectRatio,
  children,
}: {
  height?: number;
  aspectRatio?: { width?: number; height?: number };
  children: React.ReactNode;
}) {
  const ratioWidth = parsePixelDimension(aspectRatio?.width);
  const ratioHeight = parsePixelDimension(aspectRatio?.height);
  const hasRatio = ratioWidth != null && ratioHeight != null;
  const fixedHeight = parsePixelDimension(height);

  // A declared aspect ratio means the embed should scale with the fluid
  // column width (e.g. a 16:9 video); a bare height with no ratio means the
  // embed has its own fixed pixel height regardless of width (e.g. an audio
  // player widget), so only fall back to a fixed height when no ratio is
  // available.
  const aspectRatioCss = hasRatio
    ? `${ratioWidth} / ${ratioHeight}`
    : fixedHeight == null
      ? DEFAULT_ASPECT_RATIO
      : undefined;

  return (
    <figure {...stylex.props(articleBodyStyles.iframeFigure)}>
      <div
        {...stylex.props(articleBodyStyles.iframeFrame)}
        style={{
          aspectRatio: aspectRatioCss,
          // The frame is `border-box`, so grow it by the border so the iframe
          // itself gets exactly the height the embed asked for.
          height:
            aspectRatioCss == null && fixedHeight != null
              ? `${fixedHeight + IFRAME_FRAME_BORDER_WIDTH * 2}px`
              : undefined,
        }}
      >
        {children}
      </div>
    </figure>
  );
}
