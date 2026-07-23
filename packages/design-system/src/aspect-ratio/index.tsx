import * as stylex from "@stylexjs/stylex";

import { radius } from "../theme/radius.stylex";
import type { StyleXComponentProps } from "../theme/types";

const styles = stylex.create({
  aspectRatio: (aspectRatio: number) => ({
    aspectRatio,
  }),
  container: {
    overflow: "hidden",
    position: "relative",
    maxWidth: "100%",
    minWidth: 0,
    width: "100%",
  },
  rounded: {
    cornerShape: "squircle",
    borderEndStartRadius: radius.lg,
    borderEndEndRadius: radius.lg,
    borderStartStartRadius: radius.lg,
    borderStartEndRadius: radius.lg,
  },
  imageContainer: {
    inset: 0,
    position: "absolute",
  },
  image: {
    objectFit: "cover",
    height: "100%",
    width: "100%",
  },
});

export interface AspectRatioProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  aspectRatio?: number;
  rounded?: boolean;
}

export function AspectRatio({
  style,
  aspectRatio = 1,
  rounded = true,
  ...props
}: AspectRatioProps) {
  return (
    <div
      {...props}
      {...stylex.props(
        styles.container,
        styles.aspectRatio(aspectRatio),
        rounded && styles.rounded,
        style,
      )}
    />
  );
}

export interface AspectRatioImageProps extends StyleXComponentProps<
  React.ComponentProps<"img">
> {}

export function AspectRatioImage({
  style,
  children,
  ...props
}: AspectRatioImageProps) {
  return (
    <div {...stylex.props(styles.imageContainer, style)}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img {...props} {...stylex.props(styles.image, style)} />
      {children}
    </div>
  );
}
