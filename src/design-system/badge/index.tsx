import * as stylex from "@stylexjs/stylex";
import { use } from "react";

import type { Size, StyleXComponentProps } from "../theme/types";

import { SizeContext } from "../context";
import { radius } from "../theme/radius.stylex";
import {
  critical,
  primary,
  success,
  ui,
  warning,
} from "../theme/semantic-color.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { fontFamily, fontSize, fontWeight } from "../theme/typography.stylex";

const styles = stylex.create({
  wrapper: {
    // eslint-disable-next-lin @stylexjs/valid-styles
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    fontFamily: fontFamily["sans"],
    fontWeight: fontWeight["medium"],
    width: "fit-content",
  },
  sm: {
    gap: gap["xs"],
    fontSize: fontSize["xs"],
    height: sizeSpace["lg"],
    paddingBottom: verticalSpace["xxs"],
    paddingLeft: horizontalSpace["lg"],
    paddingRight: horizontalSpace["lg"],
    paddingTop: verticalSpace["xxs"],

    // eslint-disable-next-line @stylexjs/no-legacy-contextual-styles, @stylexjs/valid-styles
    ":is(*) svg": {
      flexShrink: 0,
      pointerEvents: "none",
      height: sizeSpace["xxs"],
      width: sizeSpace["xxs"],
    },
  },
  md: {
    gap: gap["sm"],
    fontSize: fontSize["sm"],
    height: sizeSpace["xl"],
    paddingBottom: verticalSpace["xxs"],
    paddingLeft: horizontalSpace["2xl"],
    paddingRight: horizontalSpace["2xl"],
    paddingTop: verticalSpace["xxs"],

    // eslint-disable-next-line @stylexjs/no-legacy-contextual-styles, @stylexjs/valid-styles
    ":is(*) svg": {
      flexShrink: 0,
      pointerEvents: "none",
      height: sizeSpace["md"],
      width: sizeSpace["md"],
    },
  },
});

export interface BadgeProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {
  size?: Extract<Size, "sm" | "md">;
  variant?: "primary" | "default" | "warning" | "critical" | "success";
}

export function Badge({
  style,
  size: sizeProp,
  variant = "default",
  ...props
}: BadgeProps) {
  const sizeContext = use(SizeContext);
  const size =
    sizeProp ||
    (sizeContext === "sm" || sizeContext === "md" ? sizeContext : "md");

  return (
    <div
      {...props}
      {...stylex.props(
        styles.wrapper,
        size === "sm" && styles.sm,
        size === "md" && styles.md,
        variant === "primary" && [
          primary.bgDim,
          primary.borderDim,
          primary.text,
        ],
        variant === "default" && [ui.bgDim, ui.borderDim, ui.textDim],
        variant === "warning" && [
          warning.bgDim,
          warning.borderDim,
          warning.textDim,
        ],
        variant === "critical" && [
          critical.bgDim,
          critical.borderDim,
          critical.textDim,
        ],
        variant === "success" && [
          success.bgDim,
          success.borderDim,
          success.textDim,
        ],
        style,
      )}
    />
  );
}
