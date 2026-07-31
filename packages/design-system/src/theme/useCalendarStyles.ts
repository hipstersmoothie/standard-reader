import * as stylex from "@stylexjs/stylex";
import type {
  CalendarProps as AriaCalendarProps,
  CalendarGridProps,
  DateValue,
} from "react-aria-components";

import { animationDuration } from "../theme/animations.stylex";
import { focusColor, primaryColor, uiColor } from "../theme/color.stylex";
import { radius } from "../theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import type { StyleXComponentProps } from "../theme/types";
import { fontSize, fontWeight } from "./typography.stylex";

export interface CalendarProps<T extends DateValue>
  extends
    StyleXComponentProps<AriaCalendarProps<T>>,
    Pick<CalendarGridProps, "weekdayStyle"> {
  errorMessage?: string;
}

const styles = stylex.create({
  cell: {
    borderRadius: radius.md,
    cornerShape: "squircle",
    textDecoration: {
      ":is([data-unavailable])": "line-through",
    },
    color: {
      default: uiColor.text1,
      ":is([data-hovered]):not(:is([data-unavailable]))": uiColor.text2,
      ":is([data-selected])": primaryColor.text2,
    },
    cursor: "default",
    lineHeight: sizeSpace["3xl"],
    opacity: {
      ":is([data-outside-visible-range],[data-unavailable])": 0.5,
    },
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "-2px",
    position: "relative",
    textAlign: "center",
    transitionDuration: animationDuration.fast,
    transitionProperty: "color",
    transitionTimingFunction: "ease-in-out",
    zIndex: 0,
    paddingBottom: verticalSpace["xxs"],
    paddingInlineStart: horizontalSpace["xxs"],
    paddingInlineEnd: horizontalSpace["xxs"],
    paddingTop: verticalSpace["xxs"],
    width: sizeSpace["3xl"],

    "::before": {
      inset: sizeSpace["xxs"],
      content: "''",
      position: "absolute",
      transitionDuration: animationDuration.fast,
      transitionProperty: "background-color",
      transitionTimingFunction: "ease-in-out",
      zIndex: -1,
    },
  },
  nonRangeCell: {
    borderRadius: {
      "::before": radius.md,
    },
    cornerShape: {
      "::before": "squircle",
    },
    backgroundColor: {
      ":is(*)::before": "transparent",
      ":is([data-hovered]):not(:is([data-unavailable]))::before":
        uiColor.component2,
      ":is([data-pressed]):not(:is([data-unavailable]))::before":
        uiColor.component3,
      ":is([data-selected]):not(:is([data-unavailable]))::before":
        primaryColor.component2,
      ":is([data-selected]):not(:is([data-unavailable])):is([data-hovered])::before":
        primaryColor.component3,
    },
    color: {
      default: uiColor.text1,
      ":is([data-hovered]):not(:is([data-unavailable]))": uiColor.text2,
      ":is([data-selected])": primaryColor.text2,
    },
  },
  rangeCell: {
    backgroundColor: {
      ":is(*)::before": "transparent",
      ":is([data-hovered]):not(:is([data-unavailable]))::before":
        uiColor.component3,
      ":is([data-pressed]):not(:is([data-unavailable]))::before":
        uiColor.border1,
      ":is([data-selected]):not([data-selection-start],[data-selection-end]):not(:is([data-unavailable]))::before":
        primaryColor.component1,
      ":is([data-selection-start],[data-selection-end]):not(:is([data-unavailable]))::before":
        primaryColor.component3,
      ":is([data-selection-start],[data-selection-end]):not(:is([data-unavailable])):is([data-hovered])::before":
        primaryColor.border1,
    },
    color: {
      default: uiColor.text1,
      ":is([data-hovered]):not(:is([data-unavailable]))": uiColor.text2,
      ":is([data-selection-start],[data-selection-end])": primaryColor.text2,
    },
    borderEndStartRadius: {
      ":is([data-selection-start],td:first-child > *)::before": radius.md,
    },
    borderEndEndRadius: {
      ":is([data-selection-end],td:last-child > *)::before": radius.md,
    },
    borderStartStartRadius: {
      ":is([data-selection-start],td:first-child > *)::before": radius.md,
    },
    borderStartEndRadius: {
      ":is([data-selection-end],td:last-child > *)::before": radius.md,
    },
    marginInlineStart: {
      ":is(td:not(:first-child) > [data-selected]):not([data-selection-start],[data-selection-end])::before": `calc(${horizontalSpace["md"]} * -1)`,
    },
    marginInlineEnd: {
      ":is(td:not(:last-child) > [data-selected]):not([data-selection-start],[data-selection-end])::before": `calc(${horizontalSpace["md"]} * -1)`,
    },
  },
  headerCell: {
    fontSize: fontSize["sm"],
    fontWeight: fontWeight["medium"],
    textAlign: "center",
    paddingBottom: verticalSpace["xs"],
  },
  heading: {
    fontSize: fontSize["lg"],
    fontWeight: fontWeight["semibold"],
    textAlign: "center",
    marginBottom: 0,
    marginInlineStart: 0,
    marginInlineEnd: 0,
    marginTop: 0,
  },
  grid: {
    borderCollapse: "collapse",
  },
  wrapper: {
    gap: gap["xl"],
    display: "flex",
    flexDirection: "column",
  },
});

export function useCalendarStyles({
  type,
}: {
  type: "calendar" | "range-calendar";
}) {
  return {
    wrapper: [styles.wrapper],
    grid: [styles.grid],
    heading: [styles.heading],
    headerCell: [styles.headerCell],
    cell: [
      styles.cell,
      type === "range-calendar" ? styles.rangeCell : styles.nonRangeCell,
    ],
  };
}
