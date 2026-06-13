"use client";

import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { animationDuration } from "../design-system/theme/animations.stylex";
import { primaryColor, uiColor } from "../design-system/theme/color.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "../design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
} from "../design-system/theme/typography.stylex";

const styles = stylex.create({
  nav: {
    alignItems: "center",
    columnGap: gap.lg,
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    rowGap: gap.sm,
  },
  link: {
    textDecoration: "none",
    color: {
      default: uiColor.text1,
      ":hover": primaryColor.text2,
    },
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    transitionDuration: animationDuration.fast,
    transitionProperty: "color",
    transitionTimingFunction: "ease-in-out",
    paddingBottom: verticalSpace.xxs,
    paddingLeft: horizontalSpace.xs,
    paddingRight: horizontalSpace.xs,
    paddingTop: verticalSpace.xxs,
  },
  linkActive: {
    color: primaryColor.text2,
  },
  separator: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    userSelect: "none",
  },
});

export function SiteLegalLinks({ style }: { style?: stylex.StyleXStyles }) {
  return (
    <nav aria-label="Site" {...stylex.props(styles.nav, style)}>
      <Link
        to="/about"
        {...stylex.props(styles.link)}
        activeProps={stylex.props(styles.link, styles.linkActive)}
      >
        About
      </Link>
      <span {...stylex.props(styles.separator)} aria-hidden>
        ·
      </span>
      <Link
        to="/privacy"
        {...stylex.props(styles.link)}
        activeProps={stylex.props(styles.link, styles.linkActive)}
      >
        Privacy
      </Link>
      <span {...stylex.props(styles.separator)} aria-hidden>
        ·
      </span>
      <Link
        to="/docs/api"
        {...stylex.props(styles.link)}
        activeProps={stylex.props(styles.link, styles.linkActive)}
      >
        API
      </Link>
    </nav>
  );
}
