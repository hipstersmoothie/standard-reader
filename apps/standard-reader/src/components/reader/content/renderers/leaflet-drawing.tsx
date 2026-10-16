"use client";

import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import * as stylex from "@stylexjs/stylex";

import type {
  LeafletDrawingColor,
  LeafletDrawingThemeColor,
} from "#/lib/leaflet/drawing";
import { leafletDrawingGeometry } from "#/lib/leaflet/drawing";
import type { LeafletDrawingBlock } from "#/lib/leaflet/types";

import { canvasBlockStyles } from "./leaflet-canvas-styles";

const styles = stylex.create({
  figure: {
    display: "flex",
    justifyContent: "center",
    marginInlineEnd: spacing["0"],
    marginInlineStart: spacing["0"],
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
  },
  svg: {
    // Strokes may reach past the view box (per the lexicon); let them show.
    overflow: "visible",
    display: "block",
    height: "auto",
    width: "100%",
  },
  strokePrimary: { stroke: uiColor.text2 },
  strokeAccent: { stroke: primaryColor.solid1 },
  strokeTertiary: { stroke: uiColor.text1 },
  fillPrimary: { fill: uiColor.text2 },
  fillAccent: { fill: primaryColor.solid1 },
  fillTertiary: { fill: uiColor.text1 },
});

const STROKE_STYLES: Record<LeafletDrawingThemeColor, stylex.StyleXStyles> = {
  primary: styles.strokePrimary,
  accent: styles.strokeAccent,
  tertiary: styles.strokeTertiary,
};

const FILL_STYLES: Record<LeafletDrawingThemeColor, stylex.StyleXStyles> = {
  primary: styles.fillPrimary,
  accent: styles.fillAccent,
  tertiary: styles.fillTertiary,
};

/** A hex color goes on the attribute; a theme color maps to the reader's own
 *  theme tokens so it follows light/dark and publication themes. */
function colorProps(
  color: LeafletDrawingColor,
  attribute: "stroke" | "fill",
): React.SVGProps<SVGPathElement> {
  if (color.kind === "hex") return { [attribute]: color.value };
  return stylex.props(
    (attribute === "stroke" ? STROKE_STYLES : FILL_STYLES)[color.value],
  );
}

/** `pub.leaflet.blocks.drawing` — freehand ink, scaled to the block's width. */
export function LeafletDrawingBlockView({
  block,
  canvas = false,
}: {
  block: LeafletDrawingBlock;
  /** Drawn inside a Leaflet canvas block, which sizes it. */
  canvas?: boolean;
}) {
  const geometry = leafletDrawingGeometry(block);
  if (!geometry) return null;
  const { viewBox } = geometry;

  return (
    <figure
      {...stylex.props(styles.figure, canvas && canvasBlockStyles.figure)}
    >
      {/* The lexicon gives drawings no alt text, so they are decorative. */}
      <svg
        aria-hidden="true"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        {...stylex.props(styles.svg, canvas && canvasBlockStyles.drawing)}
      >
        {geometry.fills.map((fill, index) => (
          <path
            key={`fill-${index}`}
            d={fill.d}
            fillRule="nonzero"
            {...colorProps(fill.color, "fill")}
          />
        ))}
        {geometry.strokes.map((stroke, index) => (
          <path
            key={`stroke-${index}`}
            d={stroke.d}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={stroke.width}
            {...colorProps(stroke.color, "stroke")}
          />
        ))}
      </svg>
    </figure>
  );
}
