import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  size as boxSize,
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import type { CSSProperties } from "react";

import type { EmbedCardLayout } from "#/lib/embed-snippet";
import type { QuoteOgColors } from "#/lib/publication-theme";

import { subscribeCardLayout } from "./subscribe-card.stylex";

/**
 * Layout + palette plumbing for the embed cards (publication subscribe, author
 * follow). Lives apart from `embed-card.tsx` so that file exports components
 * only, which is what fast refresh needs.
 */

/** Wide containers use the horizontal embed layout (iframe-style). */
const LANDSCAPE = "@container subscribe-card (min-width: 18rem)";

/** `auto` picks landscape/portrait from container width; embed routes pass an explicit value. */
export type EmbedCardLayoutInput = EmbedCardLayout | "auto";

/** What the layout resolved to once the shell and the caller's choice are in. */
export type EmbedCardLayoutMode = EmbedCardLayout | "responsive";

export function resolveEmbedCardLayoutMode(
  shell: "inline" | "page",
  layout: EmbedCardLayoutInput,
): EmbedCardLayoutMode {
  if (shell === "page" || layout === "portrait") {
    return "portrait";
  }
  if (layout === "landscape") {
    return "landscape";
  }
  return "responsive";
}

export const embedCardStyles = stylex.create({
  shellPage: {
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    justifyContent: "center",
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    minHeight: "100vh",
    paddingBottom: verticalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
    width: "100%",
  },
  container: {
    backgroundColor: "transparent",
    containerName: "subscribe-card",
    containerType: "inline-size",
    display: "block",
    maxWidth: subscribeCardLayout.maxWidth,
    width: "100%",
  },
  cardFrame: {
    borderColor: "var(--sub-line)",
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    overflow: "hidden",
    boxSizing: "border-box",
    maxWidth: "100%",
    width: "100%",
  },
  /** Embed: no border — iframe background already matches the card fill. */
  cardFrameEmbed: {
    borderRadius: radius.lg,
    cornerShape: "squircle",
    overflow: "hidden",
    boxSizing: "border-box",
    maxWidth: "100%",
    width: "100%",
  },
  card: {
    borderRadius: radius.lg,
    cornerShape: "squircle",
    backgroundColor: "var(--sub-bg)",
    boxSizing: "border-box",
    color: "var(--sub-fg)",
    display: "flex",
    paddingInlineEnd: horizontalSpace["2xl"],
    paddingInlineStart: horizontalSpace["2xl"],
    width: "100%",
  },
  cardResponsive: {
    [LANDSCAPE]: {
      gap: gap.xl,
      alignItems: "center",
      flexDirection: "row",
      textAlign: "start",
      paddingBottom: verticalSpace["2xl"],
      paddingTop: verticalSpace["2xl"],
    },
    gap: gap["2xl"],
    alignItems: "center",
    flexDirection: "column",
    textAlign: "center",
    paddingBottom: verticalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  cardStacked: {
    gap: gap["2xl"],
    alignItems: "center",
    flexDirection: "column",
    textAlign: "center",
    paddingBottom: verticalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  cardLandscape: {
    gap: gap.xl,
    alignItems: "center",
    flexDirection: "row",
    textAlign: "start",
    paddingBottom: verticalSpace["2xl"],
    paddingTop: verticalSpace["2xl"],
  },
  info: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
  },
  infoResponsive: {
    [LANDSCAPE]: {
      gap: gap.xs,
      alignItems: "flex-start",
      width: "auto",
    },
    gap: gap.sm,
    alignItems: "center",
    width: "100%",
  },
  infoStacked: {
    gap: gap.sm,
    alignItems: "center",
    width: "100%",
  },
  infoLandscape: {
    gap: gap.xs,
    alignItems: "flex-start",
    width: "auto",
  },
  kicker: {
    color: "var(--sub-accent)",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
  },
  name: {
    margin: 0,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
  },
  nameStacked: {
    fontSize: fontSize.xl,
  },
  /**
   * Base for any link an embed card shows. Matches `PublicationNameLink` /
   * `AuthorProfileLink`'s own resting look so swapping to a plain anchor inside
   * an embed changes nothing visually.
   */
  externalLink: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    textDecorationColor: "currentColor",
    textUnderlineOffset: "2px",
    unicodeBidi: "isolate",
  },
  /** Unlinkable user content still needs bidi isolation. */
  isolate: {
    unicodeBidi: "isolate",
  },
  nameLink: {
    color: "inherit",
    textDecorationColor: "currentColor",
  },
  byline: {
    margin: 0,
    color: "var(--sub-muted)",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
  },
  // Display names and handles are user content; isolate each so the bidi
  // algorithm can't reorder them across the `·` separator under an RTL UI.
  bylineNameLink: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    textDecorationColor: "currentColor",
    unicodeBidi: "isolate",
  },
  bylineHandle: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    fontFamily: fontFamily.mono,
    letterSpacing: tracking.tight,
    textDecorationColor: "currentColor",
    unicodeBidi: "isolate",
  },
  dek: {
    margin: 0,
    color: "var(--sub-muted)",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    lineHeight: lineHeight.sm,
    maxWidth: "36ch",
  },
  dekResponsive: {
    [LANDSCAPE]: {
      display: "none",
    },
  },
  dekLandscape: {
    display: "none",
  },
  actions: {
    textDecoration: "none",
    display: "flex",
    flexShrink: 0,
  },
  actionsResponsive: {
    [LANDSCAPE]: {
      width: "auto",
    },
    width: "100%",
  },
  actionsStacked: {
    width: "100%",
  },
  actionsLandscape: {
    width: "auto",
  },
  actionButton: {
    width: "100%",
  },
  avatarProminent: {
    borderColor: "var(--sub-accent)",
    borderWidth: 2,
    flexShrink: 0,
    height: boxSize["5xl"],
    width: boxSize["5xl"],
  },
  avatarStacked: {
    height: boxSize["6xl"],
    width: boxSize["6xl"],
  },
  accentButton: {
    borderColor: "var(--sub-accent)",
    backgroundColor: "var(--sub-accent)",
    color: "var(--sub-accent-fg)",
  },
  successIcon: {
    borderRadius: radius.full,
    alignItems: "center",
    backgroundColor: "var(--sub-accent)",
    color: "var(--sub-accent-fg)",
    display: "flex",
    justifyContent: "center",
    height: "3rem",
    width: "3rem",
  },
  successTitle: {
    margin: 0,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
  },
  successBody: {
    margin: 0,
    color: "var(--sub-muted)",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontStyle: "italic",
    lineHeight: lineHeight.base,
    maxWidth: "34ch",
  },
  poweredBy: {
    textDecoration: "none",
    color: {
      default: uiColor.text1,
      ":hover": uiColor.text2,
    },
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    insetInlineEnd: horizontalSpace.lg,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    position: "fixed",
    zIndex: 1,
    bottom: verticalSpace.lg,
  },
});

/** Theme tokens for embed card CSS variables. */
export function embedCardThemeVars(colors: QuoteOgColors): CSSProperties {
  return {
    "--sub-bg": colors.background,
    "--sub-fg": colors.foreground,
    "--sub-muted": colors.muted,
    "--sub-accent": colors.accent,
    "--sub-accent-fg": colors.accentForeground,
    "--sub-line": colors.line,
  } as CSSProperties;
}

export function embedCardLayoutStyle(layoutMode: EmbedCardLayoutMode) {
  if (layoutMode === "portrait") {
    return embedCardStyles.cardStacked;
  }
  if (layoutMode === "landscape") {
    return embedCardStyles.cardLandscape;
  }
  return embedCardStyles.cardResponsive;
}

export function embedCardInfoStyle(layoutMode: EmbedCardLayoutMode) {
  if (layoutMode === "portrait") {
    return embedCardStyles.infoStacked;
  }
  if (layoutMode === "landscape") {
    return embedCardStyles.infoLandscape;
  }
  return embedCardStyles.infoResponsive;
}

export function embedCardDekStyle(layoutMode: EmbedCardLayoutMode) {
  if (layoutMode === "portrait") {
    return null;
  }
  if (layoutMode === "landscape") {
    return embedCardStyles.dekLandscape;
  }
  return embedCardStyles.dekResponsive;
}

export function embedCardActionsStyle(layoutMode: EmbedCardLayoutMode) {
  if (layoutMode === "portrait") {
    return embedCardStyles.actionsStacked;
  }
  if (layoutMode === "landscape") {
    return embedCardStyles.actionsLandscape;
  }
  return embedCardStyles.actionsResponsive;
}
