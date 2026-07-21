"use client";

import * as stylex from "@stylexjs/stylex";
import { use } from "react";
import type {
  ToggleButtonGroupProps as AriaToggleButtonGroupProps,
  ToggleButtonProps as AriaToggleButtonProps,
} from "react-aria-components";
import {
  ToggleButton as AriaToggleButton,
  ToggleButtonGroup as AriaToggleButtonGroup,
  SelectionIndicator,
} from "react-aria-components";

import { SizeContext } from "../context";
import { useHaptics } from "../haptics";
import { animationDuration } from "../theme/animations.stylex";
import { focusColor, uiColor } from "../theme/color.stylex";
import { mediaQueries } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { shadow } from "../theme/shadow.stylex";
import type { Size, StyleXComponentProps } from "../theme/types";

const styles = stylex.create({
  group: {
    paddingBottom: verticalSpace["xxs"],
    paddingInlineStart: horizontalSpace["xxs"],
    paddingInlineEnd: horizontalSpace["xxs"],
    paddingTop: verticalSpace["xxs"],

    cornerShape: "squircle",
    gap: gap["md"],
    alignItems: "center",
    backgroundColor: uiColor.component1,
    boxShadow: "inset 0 0 8px 0 rgba(0, 0, 0, 0.1)",
    boxSizing: "border-box",
    display: "flex",
    height: {
      ":is([data-size=lg])": sizeSpace["4xl"],
      ":is([data-size=md])": sizeSpace["3xl"],
      ":is([data-size=sm])": sizeSpace["2xl"],
    },
  },
  small: {
    borderRadius: radius.md,
  },
  large: {
    borderRadius: radius.md,
  },
  /* eslint-disable @stylexjs/sort-keys -- toggle item layout order */
  item: {
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxEdge: "cap alphabetic",
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxTrim: "trim-both",
    borderWidth: 0,

    cornerShape: "squircle",
    gap: gap["xs"],
    alignItems: "center",
    backgroundColor: "transparent",
    boxSizing: "border-box",
    color: {
      default: uiColor.text1,
      ":is([data-hovered])": uiColor.text2,
      ":is([data-selected])": uiColor.text2,
    },
    display: "flex",
    flexGrow: 1,
    justifyContent: "center",
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "-2px",
    position: "relative",
    zIndex: {
      default: 1,
      ":is([data-selected])": 0,
    },
    height: "100%",
    paddingBottom: verticalSpace["xs"],
    paddingInlineStart: horizontalSpace["md"],
    paddingInlineEnd: horizontalSpace["md"],
    paddingTop: verticalSpace["xs"],

    // eslint-disable-next-line @stylexjs/no-legacy-contextual-styles, @stylexjs/valid-styles
    ":is(*) svg": {
      flexShrink: 0,
      pointerEvents: "none",
      height: sizeSpace["md"],
      width: sizeSpace["md"],
    },
  },
  itemFillSelection: {
    backgroundColor: {
      ":is([data-selected])": uiColor.bgSubtle,
    },
    boxShadow: {
      ":is([data-selected])": shadow.sm,
    },
    zIndex: {
      default: 1,
      ":is([data-selected])": 1,
    },
  },
  /* eslint-enable @stylexjs/sort-keys */
  selectionIndicator: {
    borderRadius: radius.md,

    cornerShape: "squircle",
    backgroundColor: uiColor.bgSubtle,
    boxShadow: shadow.sm,
    position: "absolute",
    transitionDuration: animationDuration.slow,
    transitionProperty: {
      default: "translate, width",
      [mediaQueries.reducedMotion]: "none",
    },
    zIndex: -1,
    height: "100%",
    insetInlineStart: 0,
    top: 0,
    width: "100%",
  },
});

export interface SegmentedControlProps extends StyleXComponentProps<
  Omit<
    AriaToggleButtonGroupProps,
    "children" | "disallowEmptySelection" | "selectionMode"
  >
> {
  children?: React.ReactNode;
  size?: Size;
}

export const SegmentedControl = ({
  children,
  style,
  size: sizeProp,
  onSelectionChange,
  ...props
}: SegmentedControlProps) => {
  const { trigger } = useHaptics();
  const size = sizeProp ?? use(SizeContext);

  const handleSelectionChange = (
    keys: Parameters<NonNullable<typeof onSelectionChange>>[0],
  ) => {
    trigger("selection");
    onSelectionChange?.(keys);
  };

  return (
    <AriaToggleButtonGroup
      disallowEmptySelection
      selectionMode="single"
      data-size={size}
      onSelectionChange={handleSelectionChange}
      {...props}
      {...stylex.props(
        styles.group,
        size === "sm" ? styles.small : styles.large,
        style,
      )}
    >
      {children}
    </AriaToggleButtonGroup>
  );
};

export interface SegmentedControlItemProps extends StyleXComponentProps<
  Omit<AriaToggleButtonProps, "children">
> {
  children?: React.ReactNode;
  /**
   * `indicator` — sliding pill (default). Avoid with controlled `selectedKeys`
   * that update in the same commit as `onSelectionChange` (React DOM race).
   * `fill` — paints the selected segment in place, no DOM reparenting.
   */
  selection?: "fill" | "indicator";
}

export const SegmentedControlItem = ({
  children,
  selection = "indicator",
  style,
  ...props
}: SegmentedControlItemProps) => {
  return (
    <AriaToggleButton
      {...props}
      {...stylex.props(
        styles.item,
        selection === "fill" ? styles.itemFillSelection : undefined,
        style,
      )}
    >
      {selection === "indicator" ? (
        <SelectionIndicator {...stylex.props(styles.selectionIndicator)} />
      ) : null}
      {children}
    </AriaToggleButton>
  );
};
