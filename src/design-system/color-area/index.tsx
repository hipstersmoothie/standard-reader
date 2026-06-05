import type {
  ColorAreaProps as AriaColorAreaProps,
  ColorThumbProps as AriaColorThumbProps,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import {
  ColorArea as AriaColorArea,
  ColorThumb as AriaColorThumb,
} from "react-aria-components";

import type { StyleXComponentProps } from "../theme/types";

import { radius } from "../theme/radius.stylex";
import { size as sizeSpace } from "../theme/semantic-spacing.stylex";

const styles = stylex.create({
  colorArea: {
    borderRadius: radius["md"],
    cornerShape: "squircle",
    filter: {
      ":is([data-disabled])": "grayscale(1)",
    },
    flexShrink: 0,
  },
  thumb: {
    borderColor: "white",
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 2,

    cornerShape: "squircle",
    boxShadow: " 0 0 0 1px black, inset 0 0 0 1px black",
    boxSizing: "border-box",
    filter: {
      ":is([data-disabled])": "grayscale(1)",
    },
    height: {
      default: sizeSpace["md"],
      ":is([data-focus-visible])": sizeSpace["xl"],
      ":is([data-size=lg] *)": sizeSpace["xl"],
      ":is([data-size=md] *)": sizeSpace["md"],
      ":is([data-size=sm] *)": sizeSpace["xxs"],
    },
    width: {
      default: sizeSpace["md"],
      ":is([data-focus-visible])": sizeSpace["xl"],
      ":is([data-size=lg] *)": sizeSpace["xl"],
      ":is([data-size=md] *)": sizeSpace["md"],
      ":is([data-size=sm] *)": sizeSpace["xxs"],
    },
  },
  aspectRatio: (aspectRatio: number) => ({
    aspectRatio,
  }),
});

export function ColorThumb({
  style,
  ...props
}: StyleXComponentProps<Omit<AriaColorThumbProps, "children">>) {
  return <AriaColorThumb {...props} {...stylex.props(styles.thumb, style)} />;
}

export interface ColorAreaProps extends StyleXComponentProps<
  Omit<AriaColorAreaProps, "children">
> {
  children?: React.ReactNode;
  aspectRatio?: number;
}

export function ColorArea({
  style,
  aspectRatio = 1,
  ...props
}: ColorAreaProps) {
  return (
    <AriaColorArea
      {...props}
      {...stylex.props(
        styles.colorArea,
        style,
        styles.aspectRatio(aspectRatio),
      )}
    >
      <ColorThumb />
    </AriaColorArea>
  );
}
