"use client";

import * as stylex from "@stylexjs/stylex";

import { uiColor } from "../design-system/theme/color.stylex";
import { containerBreakpoints } from "../design-system/theme/media-queries.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import { SiteLegalLinks } from "./site-legal-links";

// Mirrors the bottom-nav breakpoint in `app-shell.tsx`: below it the floating
// dock is pinned over the bottom of the content column, so the footer has to
// reserve room for it or the legal links sit behind the nav pill.
const DESKTOP = "@media (min-width: 60rem)";

// The dock's own bottom offset (`app-shell.tsx` → `styles.dock`) plus the nav
// pill's height — a spacing["12"] tall row inside spacing["1.5"] padding.
const dockClearance = `calc(max(env(safe-area-inset-bottom, 0px), ${verticalSpace["3xl"]}) + ${spacing["12"]} + ${spacing["1.5"]} * 2)`;

const styles = stylex.create({
  footer: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: "auto",
    paddingBottom: {
      default: `calc(${dockClearance} + ${verticalSpace["7xl"]})`,
      [containerBreakpoints.sm]: `calc(${dockClearance} + ${verticalSpace["8xl"]})`,
      [DESKTOP]: verticalSpace["8xl"],
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
