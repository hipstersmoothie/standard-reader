import type {
  CalendarProps as AriaCalendarProps,
  CalendarGridProps,
  DateValue,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";

import type { StyleXComponentProps } from "../theme/types";

import { animationDuration } from "../theme/animations.stylex";
import { primaryColor, uiColor } from "../theme/color.stylex";
import { radius } from "../theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { fontSize, fontWeight } from "./typography.stylex";

export interface CalendarProps<T extends DateValue>
  extends
    StyleXComponentProps<AriaCalendarProps<T>>,
    Pick<CalendarGridProps, "weekdayStyle"> {
  errorMessage?: string;
}

const styles = stylex.create({
  cell: {
    paddingBottom: verticalSpace["xxs"],
    paddingLeft: horizontalSpace["xxs"],
    borderRadius: radius.md,
    paddingRight: horizontalSpace["xxs"],
    cornerShape: "squircle",
    paddingTop: verticalSpace["xxs"],
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
    position: "relative",
    textAlign: "center",
    transitionDuration: animationDuration.fast,
    transitionProperty: "color",
    transitionTimingFunction: "ease-in-out",
    zIndex: 0,
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
    borderBottomLeftRadius: {
      ":is([data-selection-start],td:first-child > *)::before": radius.md,
    },
    borderBottomRightRadius: {
      ":is([data-selection-end],td:last-child > *)::before": radius.md,
    },
    borderTopLeftRadius: {
      ":is([data-selection-start],td:first-child > *)::before": radius.md,
    },
    borderTopRightRadius: {
      ":is([data-selection-end],td:last-child > *)::before": radius.md,
    },
    marginLeft: {
      ":is(td:not(:first-child) > [data-selected]):not([data-selection-start],[data-selection-end])::before": `calc(${horizontalSpace["md"]} * -1)`,
    },
    marginRight: {
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
    marginBottom: 0,
    marginLeft: 0,
    fontSize: fontSize["lg"],
    marginRight: 0,
    fontWeight: fontWeight["semibold"],
    marginTop: 0,
    textAlign: "center",
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
