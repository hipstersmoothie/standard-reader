"use client";

import * as stylex from "@stylexjs/stylex";

import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { containerBreakpoints } from "@standard-reader/design-system/theme/media-queries.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { SiteLegalLinks } from "./site-legal-links";

const styles = stylex.create({
  footer: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: "auto",
    paddingBottom: {
      default: verticalSpace["7xl"],
      [containerBreakpoints.sm]: verticalSpace["8xl"],
    },
    paddingInlineStart: {
      default: horizontalSpace["3xl"],
      [containerBreakpoints.sm]: horizontalSpace["6xl"],
    },
    paddingInlineEnd: {
      default: horizontalSpace["3xl"],
      [containerBreakpoints.sm]: horizontalSpace["6xl"],
    },
    paddingTop: verticalSpace["5xl"],
  },
});

export function SiteFooter() {
  return (
    <footer {...stylex.props(styles.footer)}>
      <SiteLegalLinks />
    </footer>
  );
}
