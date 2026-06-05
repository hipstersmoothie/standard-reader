import * as stylex from "@stylexjs/stylex";
import { use } from "react";

import type { Size } from "./types";

import { SizeContext } from "../context";
import { radius } from "../theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import {
  fontSize,
  fontWeight,
  lineHeight,
  typeramp,
} from "../theme/typography.stylex";
import { animationDuration } from "./animations.stylex";
import { criticalColor, primaryColor, uiColor } from "./color.stylex";

const styles = stylex.create({
  item: {
    display: "flex",
    userSelect: "none",

    outline: {
      default: "none",
      ":focus": "none",
    },
    boxSizing: "border-box",
    fontWeight: {
      default: fontWeight["normal"],
      [":is([data-react-aria-pressable=true][data-selected=true])"]:
        fontWeight["medium"],
    },
    paddingBottom: verticalSpace["xxs"],
    paddingLeft: horizontalSpace["xs"],
    paddingRight: horizontalSpace["xs"],
    paddingTop: verticalSpace["xxs"],
  },
  sm: { minHeight: sizeSpace["2xl"] },
  md: { minHeight: sizeSpace["4xl"] },
  lg: { minHeight: sizeSpace["5xl"] },
  itemInner: {
    borderRadius: radius.md,
    cornerShape: "squircle",
    gap: gap["xl"],
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      [":is([data-focused]:not([data-disabled]) *)"]: uiColor.component2,
      [":is([data-react-aria-pressable=true]:not([data-disabled])[data-pressed=true] *)"]:
        uiColor.component3,
      [":is([data-react-aria-pressable=true][data-hovered]:not([data-disabled]) *)"]:
        uiColor.component2,
    },
    boxSizing: "border-box",
    color: {
      default: uiColor.text2,
      [":is([data-react-aria-pressable=true][data-disabled] *)"]:
        uiColor.border3,
    },
    display: "flex",
    flexGrow: 1,
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease-in-out",
    paddingBottom: verticalSpace["md"],
    paddingLeft: horizontalSpace["xl"],
    paddingRight: horizontalSpace["xl"],
    paddingTop: verticalSpace["md"],

    /* eslint-disable-next-line @stylexjs/no-legacy-contextual-styles, @stylexjs/valid-styles */
    ":is([data-variant=destructive] *) *": {
      color: criticalColor.text1,
    },
  },
  smItemInner: {
    gap: gap["md"],
    fontSize: fontSize["xs"],
    lineHeight: lineHeight["xs"],
    paddingBottom: verticalSpace["xs"],
    paddingTop: verticalSpace["xs"],
  },
  lgItemInner: {
    fontSize: fontSize["base"],
  },
  check: {
    color: primaryColor.solid1,
  },
  addon: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    marginBottom: `calc(${verticalSpace["sm"]} * -1)`,
    marginTop: `calc(${verticalSpace["sm"]} * -1)`,
    minWidth: sizeSpace["md"],

    // eslint-disable-next-line @stylexjs/valid-styles, @stylexjs/no-legacy-contextual-styles
    ":is(*) svg": {
      flexShrink: 0,
      pointerEvents: "none",
      height: sizeSpace["md"],
      width: sizeSpace["md"],
    },
  },
  label: {
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxEdge: "cap alphabetic",
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxTrim: "trim-both",
    gap: gap["sm"],
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
  },
});

export const estimatedRowHeights: Record<Size, number> = {
  sm: 24,
  md: 32,
  lg: 40,
};

export function useListBoxItemStyles() {
  const size = use(SizeContext);

  return {
    wrapper: [
      typeramp.label,
      styles.item,
      size === "sm" && styles.sm,
      size === "md" && styles.md,
      size === "lg" && styles.lg,
    ],
    inner: [
      styles.itemInner,
      size === "sm" && styles.smItemInner,
      size === "lg" && styles.lgItemInner,
    ],
    label: styles.label,
    addon: styles.addon,
    check: styles.check,
  };
}
