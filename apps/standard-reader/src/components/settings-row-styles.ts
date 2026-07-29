import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";

const MOBILE = "@media (max-width: 47.5rem)";

/**
 * One labelled row in a settings group: label (+ optional description) on the
 * start edge, the control on the end edge, stacking on mobile.
 *
 * Shared by the settings page and the appearance panel so both read as the same
 * list rather than two designs that happen to sit next to each other. Styles
 * live apart from the component so each file exports one kind of thing (React
 * fast refresh only works when a module exports components alone).
 */
export const settingRowStyles = stylex.create({
  row: {
    alignItems: {
      [MOBILE]: "stretch",
      default: "center",
    },
    columnGap: gap["3xl"],
    display: "flex",
    flexDirection: {
      [MOBILE]: "column",
      default: "row",
    },
    justifyContent: "space-between",
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    rowGap: gap["lg"],
    paddingBottom: verticalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  label: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.xs,
    marginTop: verticalSpace.none,
  },
  description: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    maxWidth: "42ch",
  },
  control: {
    flexShrink: 0,
    width: {
      [MOBILE]: "100%",
      default: "auto",
    },
  },
  segmentedControl: {
    width: {
      [MOBILE]: "100%",
      default: "auto",
    },
  },
});
