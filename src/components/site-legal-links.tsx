"use client";

import { Trans, useLingui } from "@lingui/react/macro";
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
    paddingInlineStart: horizontalSpace.xs,
    paddingInlineEnd: horizontalSpace.xs,
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
  const { t } = useLingui();
  return (
    <nav aria-label={t`Site`} {...stylex.props(styles.nav, style)}>
      <Link
        to="/about"
        {...stylex.props(styles.link)}
        activeProps={stylex.props(styles.link, styles.linkActive)}
      >
        <Trans>About</Trans>
      </Link>
      <span {...stylex.props(styles.separator)} aria-hidden>
        ·
      </span>
      <Link
        to="/privacy"
        {...stylex.props(styles.link)}
        activeProps={stylex.props(styles.link, styles.linkActive)}
      >
        <Trans>Privacy</Trans>
      </Link>
      <span {...stylex.props(styles.separator)} aria-hidden>
        ·
      </span>
      <Link
        to="/terms"
        {...stylex.props(styles.link)}
        activeProps={stylex.props(styles.link, styles.linkActive)}
      >
        <Trans>Terms</Trans>
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
      <span {...stylex.props(styles.separator)} aria-hidden>
        ·
      </span>
      <a
        href="https://github.com/hipstersmoothie/standard-reader"
        target="_blank"
        rel="noopener noreferrer"
        {...stylex.props(styles.link)}
      >
        <Trans>Source</Trans>
      </a>
    </nav>
  );
}
