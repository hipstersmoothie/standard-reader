import type { ColorSwatchProps as AriaColorSwatchProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { use } from "react";
import { ColorSwatch as AriaColorSwatch } from "react-aria-components";

import type { Size, StyleXComponentProps } from "../theme/types";

import { SizeContext } from "../context";
import { uiColor } from "../theme/color.stylex";
import { mediaQueries } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import { size as sizeSpace } from "../theme/semantic-spacing.stylex";

const styles = stylex.create({
  swatch: {
    borderColor: uiColor.border2,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",

    cornerShape: "squircle",
  },
  swatchSm: {
    borderRadius: radius.xs,
    height: sizeSpace["md"],
    width: sizeSpace["md"],
  },
  swatchMd: {
    borderRadius: radius.sm,
    height: sizeSpace["xl"],
    width: sizeSpace["xl"],
  },
  swatchLg: {
    borderRadius: radius.md,
    height: sizeSpace["3xl"],
    width: sizeSpace["3xl"],
  },
  circle: {
    borderRadius: {
      default: "50%",
      [mediaQueries.supportsSquircle]: "50%",
    },

    cornerShape: "unset",
  },
});

export interface ColorSwatchProps extends StyleXComponentProps<
  Omit<AriaColorSwatchProps, "children">
> {
  children?: React.ReactNode;
  size?: Size;
  variant?: "default" | "circle";
}

export function ColorSwatch({
  style,
  size: sizeProp,
  variant = "default",
  ...props
}: ColorSwatchProps) {
  const size = sizeProp || use(SizeContext);

  return (
    <AriaColorSwatch
      {...props}
      {...stylex.props(
        styles.swatch,
        size === "sm" && styles.swatchSm,
        size === "md" && styles.swatchMd,
        size === "lg" && styles.swatchLg,
        variant === "circle" && styles.circle,
        style,
      )}
      style={({ color }) => ({
        background: `linear-gradient(${color.toString()}, ${color.toString()}),
          repeating-conic-gradient(#CCC 0% 25%, white 0% 50%) 50% / 16px 16px`,
      })}
    />
  );
}
