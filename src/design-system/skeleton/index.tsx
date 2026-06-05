"use client";

import * as stylex from "@stylexjs/stylex";

import type { Size, StyleXComponentProps } from "../theme/types";

import { uiColor } from "../theme/color.stylex";
import { mediaQueries } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import { size as sizeSpace } from "../theme/semantic-spacing.stylex";
import { shadow } from "../theme/shadow.stylex";

const shimmer = stylex.keyframes({
  "0%": {
    transform: "translateX(-65%)",
  },
  "100%": {
    transform: "translateX(0%)",
  },
});

const styles = stylex.create({
  group: {},
  base: {
    overflow: "hidden",
    backgroundColor: uiColor.component1,
    boxShadow: shadow["insetSm"],
    position: "relative",
  },
  shimmer: {
    // eslint-disable-next-line @stylexjs/valid-styles
    animationDuration: "1.7s",
    animationIterationCount: "infinite",
    animationName: {
      default: shimmer,
      [mediaQueries.reducedMotion]: "none",
    },
    animationTimingFunction: "linear",
    backgroundImage: `linear-gradient(
      -80deg,
      transparent 0%,
      transparent 30%,
      ${uiColor.component3} 50%,
      transparent 70%,
      transparent 100%
    )`,
    backgroundSize: "100%",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    width: "300%",
  },
  circle: {
    borderRadius: radius.full,
  },
  rectangle: {
    borderRadius: radius.xl,
    cornerShape: "squircle",
  },
  sizeSm: {
    height: sizeSpace["3xl"],
    width: sizeSpace["3xl"],
  },
  sizeMd: {
    height: sizeSpace["4xl"],
    width: sizeSpace["4xl"],
  },
  sizeLg: {
    height: sizeSpace["6xl"],
    width: sizeSpace["6xl"],
  },
  height: (height: string | undefined) => ({
    height: height || sizeSpace["md"],
  }),
  width: (width: string | undefined) => ({
    width: width || "100%",
  }),
});

export interface SkeletonGroupProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  children: React.ReactNode;
}

export function SkeletonGroup({
  children,
  style,
  ...props
}: SkeletonGroupProps) {
  return (
    <div {...props} {...stylex.props(styles.group, style)}>
      {children}
    </div>
  );
}

export type SkeletonVariant = "circle" | "rectangle";

interface SkeletonBaseProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

interface SkeletonCircleProps extends SkeletonBaseProps {
  variant: "circle";
  size: Size;
  height?: never;
  width?: string;
}

interface SkeletonRectangleProps extends SkeletonBaseProps {
  variant: "rectangle";
  height?: string;
  size?: never;
  width?: string;
}

type SkeletonProps = SkeletonCircleProps | SkeletonRectangleProps;

export function Skeleton({
  variant,
  size,
  height,
  width,
  style,
  ...props
}: SkeletonProps) {
  if (variant === "circle") {
    return (
      <div
        {...props}
        {...stylex.props(
          styles.base,
          styles.circle,
          size === "sm" && styles.sizeSm,
          size === "md" && styles.sizeMd,
          size === "lg" && styles.sizeLg,
          width ? styles.width(width) : null,
          style,
        )}
      >
        <div {...stylex.props(styles.shimmer)} />
      </div>
    );
  }

  return (
    <div
      {...props}
      {...stylex.props(
        styles.base,
        styles.rectangle,
        styles.height(height),
        styles.width(width),
        style,
      )}
    >
      <div {...stylex.props(styles.shimmer)} />
    </div>
  );
}
