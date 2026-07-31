"use client";

import * as stylex from "@stylexjs/stylex";

import { animationDuration } from "../theme/animations.stylex";
import { focusColor, uiColor } from "../theme/color.stylex";
import { mediaQueries } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { shadow } from "../theme/shadow.stylex";
import type { StyleXComponentProps } from "../theme/types";
import { fontFamily, fontSize, fontWeight } from "../theme/typography.stylex";

const styles = stylex.create({
  link: {
    position: "fixed",
    top: verticalSpace.lg,
    insetInlineStart: horizontalSpace.lg,
    // Above the sticky sidebar and page chrome; below toasts (9999).
    zIndex: 1000,

    // Off-screen until focused. Kept in the DOM and tab order — unlike
    // display:none (unreachable) — and reliably revealable — unlike clip().
    transform: {
      default: "translateY(calc(-100% - 1rem))",
      ":focus": "translateY(0)",
    },
    opacity: { default: 0, ":focus": 1 },
    pointerEvents: { default: "none", ":focus": "auto" },

    // A floating ink tab, deliberately distinct from a standard button. Ink on
    // paper clears WCAG AA comfortably in both themes (the mid-tone camel accent
    // can't carry AA text, and per the One-Lamp Rule it stays off chrome — it
    // lands on the focus ring below instead).
    backgroundColor: uiColor.text2,
    color: uiColor.bg,
    boxShadow: shadow.lg,
    borderRadius: radius.md,
    cornerShape: "squircle",

    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    lineHeight: 1,
    textDecoration: "none",
    whiteSpace: "nowrap",

    paddingTop: verticalSpace.md,
    paddingBottom: verticalSpace.md,
    paddingInlineStart: horizontalSpace.xl,
    paddingInlineEnd: horizontalSpace.xl,

    // Blue focus ring — the shared, high-visibility focus color.
    outlineColor: focusColor.ring,
    outlineStyle: { default: "none", ":focus": "solid" },
    outlineWidth: 2,
    outlineOffset: 2,

    transitionProperty: "transform, opacity",
    transitionDuration: {
      default: animationDuration.slow,
      [mediaQueries.reducedMotion]: "0ms",
    },
    // ease-out-quint: decisive entrance, no overshoot.
    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
});

export interface SkipLinkProps extends StyleXComponentProps<
  React.ComponentProps<"a">
> {
  /**
   * The `id` of the landmark to move focus to, without the leading `#`
   * (e.g. `"main-content"`). The target must be focusable — give it
   * `tabIndex={-1}` so keyboard and screen-reader focus can land on it.
   */
  targetId: string;
  /**
   * The link label.
   * @default "Skip to content"
   */
  children?: React.ReactNode;
}

/**
 * A "skip to content" link: the first focusable element on a page, hidden
 * until focused, that lets keyboard and screen-reader users jump past a long
 * run of navigation straight to the main content.
 */
export const SkipLink = ({
  targetId,
  children = "Skip to content",
  style,
  onClick,
  ...props
}: SkipLinkProps) => {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    // The native `#hash` jump scrolls and focuses the target, but is a no-op
    // when the hash is already in the URL (a second activation). Move focus
    // explicitly so the skip always works.
    const target = document.querySelector(`#${CSS.escape(targetId)}`);
    if (target instanceof HTMLElement) target.focus();
  };

  return (
    <a
      {...props}
      href={`#${targetId}`}
      onClick={handleClick}
      {...stylex.props(styles.link, style)}
    >
      {children}
    </a>
  );
};
