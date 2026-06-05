"use client";

import * as stylex from "@stylexjs/stylex";
import { use } from "react";

import type { ButtonVariant, Size } from "../theme/types";

import { ButtonGroupContext } from "../button/context";
import { SizeContext } from "../context";
import { animationDuration } from "./animations.stylex";
import { uiColor } from "./color.stylex";
import { radius } from "./radius.stylex";
import { critical, primary, ui } from "./semantic-color.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
} from "./semantic-spacing.stylex";
import { shadow } from "./shadow.stylex";
import { fontFamily, fontSize, fontWeight } from "./typography.stylex";

const styles = stylex.create({
  shadow: {
    boxShadow: shadow["xs"],
  },
  base: {
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxEdge: "cap alphabetic",
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxTrim: "trim-both",

    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,

    cornerShape: "squircle",
    gap: gap["xs"],
    alignItems: "center",
    boxSizing: "border-box",
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: fontFamily["sans"],
    fontWeight: fontWeight["medium"],
    justifyContent: "center",
    opacity: {
      ":disabled": 0.5,
    },
    pointerEvents: {
      ":disabled": "none",
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color, color",
    transitionTimingFunction: "ease-in-out",
    userSelect: "none",
    whiteSpace: "nowrap",

    // eslint-disable-next-line @stylexjs/no-legacy-contextual-styles, @stylexjs/valid-styles
    ":is(*) svg": {
      flexShrink: 0,
      pointerEvents: "none",
      height: sizeSpace["md"],
      width: sizeSpace["md"],
    },
  },
  small: {
    fontSize: fontSize["xs"],
    height: sizeSpace["2xl"],
    paddingLeft: {
      default: horizontalSpace["md"],
    },
    paddingRight: horizontalSpace["md"],

    // eslint-disable-next-line @stylexjs/no-legacy-contextual-styles, @stylexjs/valid-styles
    ":is(*) svg": {
      flexShrink: 0,
      pointerEvents: "none",
      height: sizeSpace["md"],
      width: sizeSpace["md"],
    },
  },
  medium: {
    gap: gap["sm"],
    fontSize: fontSize["sm"],
    height: sizeSpace["3xl"],
    paddingLeft: {
      default: horizontalSpace["xl"],
      ":has(svg+*)": horizontalSpace["md"],
    },
    paddingRight: horizontalSpace["xl"],
  },
  large: {
    gap: gap["md"],
    fontSize: fontSize["sm"],
    height: sizeSpace["4xl"],
    paddingLeft: {
      default: horizontalSpace["3xl"],
      ":has(svg+*)": horizontalSpace["md"],
    },
    paddingRight: horizontalSpace["3xl"],
  },
  xl: {
    gap: gap["md"],
    fontSize: fontSize["lg"],
    height: sizeSpace["5xl"],
    paddingLeft: {
      default: horizontalSpace["4xl"],
      ":has(svg+*)": horizontalSpace["2xl"],
    },
    paddingRight: horizontalSpace["4xl"],
  },
  secondary: {
    borderColor: {
      default: uiColor.border1,
      ":is([data-hovered])": uiColor.border2,
      ":is([data-pressed])": uiColor.border3,
    },
  },
  tertiary: {
    borderColor: {
      default: "transparent",
      ":is([data-hovered])": uiColor.component2,
      ":is([data-pressed])": uiColor.component3,
    },
  },

  groupHorizontal: {
    borderBottomLeftRadius: { ":not(:first-child)": `0 !important` },
    borderBottomRightRadius: { ":not(:last-child)": `0 !important` },
    borderLeftWidth: { ":not(:first-child)": `0 !important` },
    borderTopLeftRadius: { ":not(:first-child)": `0 !important` },
    borderTopRightRadius: { ":not(:last-child)": `0 !important` },
  },
  secondaryGroupedHorizontal: {
    borderRightColor: { ":not(:last-child)": uiColor.border2 },
  },
  groupVertical: {
    borderBottomLeftRadius: { ":not(:last-child)": `0 !important` },
    borderBottomRightRadius: { ":not(:last-child)": `0 !important` },
    borderTopLeftRadius: { ":not(:first-child)": `0 !important` },
    borderTopRightRadius: { ":not(:first-child)": `0 !important` },
    borderTopWidth: { ":not(:first-child)": `0 !important` },
  },
  secondaryGroupedVertical: {
    borderBottomColor: { ":not(:last-child)": uiColor.border2 },
  },
  separate: {
    flexBasis:
      "calc((1 / var(--items-per-row)) * (100% - (var(--toggle-button-group-gap) * (var(--items-per-row) - 1))))",
    flexGrow: 1,
    flexShrink: 1,
  },
});

export const useButtonStyles = ({
  variant = "primary",
  size: sizeProp,
}: {
  variant?: ButtonVariant;
  size?: Size | "xl";
}) => {
  const size = sizeProp || use(SizeContext);
  const group = use(ButtonGroupContext);

  return [
    group?.orientation === "horizontal" &&
      group.variant === "grouped" &&
      styles.groupHorizontal,
    group?.orientation === "vertical" &&
      group.variant === "grouped" &&
      styles.groupVertical,
    variant === "primary" && [
      primary.bgAction,
      primary.borderInteractive,
      primary.text,
      styles.shadow,
    ],
    variant === "secondary" && [
      ui.bgUi,
      styles.secondary,
      ui.text,
      group?.orientation === "horizontal" &&
        group.variant === "grouped" &&
        styles.secondaryGroupedHorizontal,
      group?.orientation === "vertical" &&
        group.variant === "grouped" &&
        styles.secondaryGroupedVertical,
    ],
    variant === "tertiary" && [
      ui.bgGhost,
      styles.tertiary,
      ui.text,
      group?.orientation === "horizontal" &&
        group.variant === "grouped" &&
        styles.secondaryGroupedHorizontal,
      group?.orientation === "vertical" &&
        group.variant === "grouped" &&
        styles.secondaryGroupedVertical,
    ],
    variant === "outline" && [
      ui.borderInteractive,
      ui.bgGhost,
      ui.text,
      styles.shadow,
    ],
    variant === "critical" && [
      critical.bgSolidAction,
      critical.borderInteractive,
      critical.textContrast,
      styles.shadow,
    ],
    variant === "critical-outline" && [
      critical.borderInteractive,
      critical.bgUi,
      critical.text,
      styles.shadow,
    ],
    size === "sm" && styles.small,
    size === "md" && styles.medium,
    size === "lg" && styles.large,
    size === "xl" && styles.xl,
    group?.variant === "separate" && styles.separate,
    styles.base,
  ];
};
