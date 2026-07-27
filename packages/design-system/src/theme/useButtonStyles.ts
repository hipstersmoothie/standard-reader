"use client";

import * as stylex from "@stylexjs/stylex";
import { use } from "react";

import { ButtonGroupContext } from "../button/context";
import { SizeContext } from "../context";
import type { ButtonVariant, Size } from "../theme/types";
import { animationDuration } from "./animations.stylex";
import { focusColor, uiColor } from "./color.stylex";
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
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "2px",
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
    paddingInlineStart: {
      default: horizontalSpace["md"],
    },
    paddingInlineEnd: horizontalSpace["md"],

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
    paddingInlineStart: {
      default: horizontalSpace["xl"],
      ":has(svg+*)": horizontalSpace["md"],
    },
    paddingInlineEnd: horizontalSpace["xl"],
  },
  large: {
    gap: gap["md"],
    fontSize: fontSize["sm"],
    height: sizeSpace["4xl"],
    paddingInlineStart: {
      default: horizontalSpace["3xl"],
      ":has(svg+*)": horizontalSpace["md"],
    },
    paddingInlineEnd: horizontalSpace["3xl"],
  },
  xl: {
    gap: gap["md"],
    fontSize: fontSize["lg"],
    height: sizeSpace["5xl"],
    paddingInlineStart: {
      default: horizontalSpace["4xl"],
      ":has(svg+*)": horizontalSpace["2xl"],
    },
    paddingInlineEnd: horizontalSpace["4xl"],
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
    borderEndStartRadius: { ":not(:first-child)": `0 !important` },
    borderEndEndRadius: { ":not(:last-child)": `0 !important` },
    borderInlineStartWidth: { ":not(:first-child)": `0 !important` },
    borderStartStartRadius: { ":not(:first-child)": `0 !important` },
    borderStartEndRadius: { ":not(:last-child)": `0 !important` },
  },
  secondaryGroupedHorizontal: {
    borderInlineEndColor: { ":not(:last-child)": uiColor.border2 },
  },
  groupVertical: {
    borderEndStartRadius: { ":not(:last-child)": `0 !important` },
    borderEndEndRadius: { ":not(:last-child)": `0 !important` },
    borderStartStartRadius: { ":not(:first-child)": `0 !important` },
    borderStartEndRadius: { ":not(:first-child)": `0 !important` },
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
