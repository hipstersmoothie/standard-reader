"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { ArrowUpRight } from "lucide-react";

import {
  animationDuration,
  animationTimingFunction,
} from "#/design-system/theme/animations.stylex";
import { focusColor, uiColor } from "#/design-system/theme/color.stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import { gap } from "#/design-system/theme/semantic-spacing.stylex";
import { spacing } from "#/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "#/design-system/theme/typography.stylex";
import type { PublishingPlatform } from "#/lib/publishing-platform";
import { PLATFORM_NAME } from "#/lib/publishing-platform";

import { PlatformMark } from "./platform-logo";

/**
 * "Read on <platform>" — attribution back to the AT Protocol platform an
 * article was actually published on (Leaflet, pckt, Offprint).
 *
 * Leaflet and Offprint are filled with their own primary surface, so each reads
 * as *that platform's* object rather than as our chrome wearing a small logo.
 * pckt has no single usable primary and instead takes the app's secondary
 * surface (see below). What holds the three together is not a shared fill but a
 * shared shape, height, and lockup rhythm: "Read on" → logo → arrow.
 *
 * Text/fill pairs all clear WCAG AA for normal text:
 *   Leaflet  white on #57822B                → 4.53:1 (their accent / accent-contrast)
 *   Offprint #e4e4e7 on #09090b              → 15.68:1 (their app-mark lockup)
 *   pckt     uiColor.text2 on component1     → the app's own secondary button pair
 *
 * Logo art itself is exempt from contrast minimums (WCAG SC 1.4.11), but each
 * mark was still checked against the fill it sits on.
 */

/**
 * Per-platform fills. Only Offprint flips with the reader's theme, because its
 * brand genuinely *is* a monochrome pair (#09090b / #e4e4e7) and a fixed one
 * would vanish into one of the two reading surfaces. Leaflet's green accent
 * holds against both; pckt rides the app's own themed surface tokens.
 */
const brand = stylex.create({
  leaflet: {
    "--fill": "#57822B",
    "--ink": "#FFFFFF",
    "--fill-hover": "#4A7025",
    "--edge": "transparent",
  },
  /**
   * pckt is the one platform without a single usable primary: its identity is
   * four colors at once, and none of its own surfaces work here — the cream
   * washes out against our warm paper, the dark chip sinks into the dark
   * reading surface, and a near-white one stops reading as a button at all.
   *
   * So it takes the app's own secondary-button surface, matching the icon
   * buttons it sits beside, and lets pckt's wordmark carry the brand alone —
   * their published `pckt-color-outline` variant, whose black keyline gives the
   * four colors definition against the warm chip. It's served byte-for-byte as
   * pckt publishes it; don't recolor it.
   */
  pckt: {
    "--fill": uiColor.component1,
    "--ink": uiColor.text2,
    "--fill-hover": uiColor.component2,
    "--edge": uiColor.border1,
  },
  offprint: {
    "--fill": "light-dark(#09090b, #e4e4e7)",
    "--ink": "light-dark(#e4e4e7, #09090b)",
    "--fill-hover": "light-dark(#1c1c20, #d1d1d6)",
    "--edge": "transparent",
  },
});

const styles = stylex.create({
  base: {
    alignItems: "center",
    backgroundColor: { default: "var(--fill)", ":hover": "var(--fill-hover)" },
    // Same corner treatment as every other button in the app
    // (`useButtonStyles`), so the branded fill is the only thing that sets
    // these apart from the native controls beside them.
    borderRadius: radius.md,
    cornerShape: "squircle",
    borderStyle: "none",
    // An inset ring rather than a real border: platforms whose fill already
    // separates from the page use `transparent` here, and an inset shadow keeps
    // every variant exactly the same height regardless.
    boxShadow: "inset 0 0 0 1px var(--edge)",
    boxSizing: "border-box",
    color: "var(--ink)",
    display: "inline-flex",
    flexShrink: 0,
    textDecoration: "none",
    transitionDuration: animationDuration.default,
    transitionProperty: "background-color",
    transitionTimingFunction: animationTimingFunction.easeOut,
    outlineColor: focusColor.ring,
    outlineOffset: 2,
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
  },
  /** End-of-article: room to breathe, matches the app's `lg` control height. */
  md: {
    gap: gap.lg,
    height: spacing["11"],
    paddingInline: spacing["4"],
  },
  /**
   * Header: sits in a row of 2rem icon buttons, so it matches their height
   * exactly and trades the "Read on" lede for the logo alone — the tooltip and
   * accessible name still carry the full sentence.
   */
  sm: {
    gap: gap.md,
    height: spacing["8"],
    paddingInline: spacing["2.5"],
  },
  /**
   * Logo art has no leading; text does. Centering an untrimmed text box against
   * an SVG lands the type visibly low, so both text runs here are trimmed to
   * their cap/baseline edges — the same treatment `Button` uses — and then the
   * flex row centers ink against ink.
   */
  trimmed: {
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxEdge: "cap alphabetic",
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxTrim: "trim-both",
  },
  lede: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.none,
    opacity: 0.85,
  },
  /** Leaflet publishes no wordmark, so its name is set in the app's own sans. */
  leafletLockup: {
    alignItems: "center",
    display: "inline-flex",
    gap: gap.sm,
  },
  leafletName: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.none,
  },
  leafletNameSm: {
    fontSize: fontSize.base,
  },
  /**
   * pckt's wordmark is four-color art with its own black keyline, so it needs
   * no theming and loads as a plain image. Explicit width/height reserve the
   * box — no layout shift when it arrives.
   */
  wordmarkImg: {
    display: "block",
  },
  /**
   * Offprint's wordmark is a single monochrome path, so it's painted as a mask
   * filled with the button's ink — that way it follows the theme flip instead
   * of needing a second, inverted asset.
   */
  offprintWordmark: {
    backgroundColor: "var(--ink)",
    display: "block",
    maskImage: "url(/brand/offprint-wordmark.svg)",
    maskPosition: "center",
    maskRepeat: "no-repeat",
    maskSize: "contain",
  },
  /**
   * The lockup wrapper must be a flex box, not an inline one. As `display:
   * inline` it sits on the parent's text baseline and lands ~2.5px above the
   * button's true center, which is exactly the kind of drift that reads as
   * "slightly off" without being obviously wrong.
   */
  lockup: {
    alignItems: "center",
    display: "flex",
  },
  /** Icon-only: square, so the mark sits dead center at the same 2rem height. */
  icon: {
    aspectRatio: "1",
    height: spacing["8"],
    justifyContent: "center",
    paddingInline: 0,
  },
  arrow: {
    flexShrink: 0,
    opacity: 0.8,
    transitionDuration: animationDuration.default,
    transitionProperty: {
      default: "transform",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    transitionTimingFunction: animationTimingFunction.easeOut,
    // The arrow leaves toward the corner it points at. `--dir` flips the
    // horizontal component under RTL (see styles.css). The fill change still
    // lands under reduced motion — only the travel is dropped.
    transform: {
      default: "translate(0, 0)",
      ":hover": {
        default: "translate(calc(var(--dir) * 2px), -2px)",
        "@media (prefers-reduced-motion: reduce)": "translate(0, 0)",
      },
    },
  },
});

/**
 * `md` end-of-article CTA, `sm` header button, `icon` the square mark-only
 * variant the header falls back to on narrow screens — where a full lockup
 * would crowd the bar, but the action is still worth keeping visible rather
 * than burying in the overflow menu.
 */
type ButtonSize = "sm" | "md" | "icon";

/** Wordmark box sizes, tuned so all three lockups share an optical cap height. */
const LOCKUP_SIZE = {
  // pckt's outline wordmark is 268×126 (aspect 2.127).
  pckt: { md: { width: 47, height: 22 }, sm: { width: 38, height: 18 } },
  offprint: { md: { width: 57, height: 18 }, sm: { width: 47, height: 15 } },
  leaflet: { md: 22, sm: 18 },
} as const;

/** The platform's lockup: real wordmark where one exists, mark + name where it doesn't. */
function PlatformLockup({
  platform,
  size,
}: {
  platform: PublishingPlatform;
  size: ButtonSize;
}) {
  if (size === "icon") {
    // Leaflet's stock leaf loses its silhouette against its own green fill;
    // pckt's and Offprint's letterforms are `currentColor`, so they pick up the
    // button's ink on their own.
    return (
      <PlatformMark
        platform={platform}
        size={18}
        tone={platform === "leaflet" ? "onSolid" : "brand"}
      />
    );
  }

  if (platform === "pckt") {
    const box = LOCKUP_SIZE.pckt[size];
    return (
      <img
        src="/brand/pckt-wordmark-outline.svg"
        alt=""
        width={box.width}
        height={box.height}
        {...stylex.props(styles.wordmarkImg)}
      />
    );
  }

  if (platform === "offprint") {
    const box = LOCKUP_SIZE.offprint[size];
    return (
      <span
        aria-hidden
        {...stylex.props(styles.offprintWordmark)}
        style={{ width: box.width, height: box.height }}
      />
    );
  }

  return (
    <span {...stylex.props(styles.leafletLockup)}>
      <PlatformMark
        platform="leaflet"
        size={LOCKUP_SIZE.leaflet[size]}
        tone="onSolid"
      />
      {/* Leaflet ships no wordmark asset, so the name is type, not art. */}
      <span
        {...stylex.props(
          styles.leafletName,
          size === "sm" && styles.leafletNameSm,
          styles.trimmed,
        )}
      >
        Leaflet
      </span>
    </span>
  );
}

/**
 * Branded link out to the original. `size="md"` is the end-of-article call to
 * action; `size="sm"` is the header variant that sits at the end of the reader
 * toolbar.
 */
export function ReadOnPlatformButton({
  platform,
  href,
  size = "md",
  onPress,
  style,
}: {
  platform: PublishingPlatform;
  href: string;
  size?: ButtonSize;
  onPress?: () => void;
  style?: stylex.StyleXStyles;
}) {
  const { t } = useLingui();
  const name = PLATFORM_NAME[platform];

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={
        onPress
          ? (e) => {
              e.preventDefault();
              onPress();
            }
          : undefined
      }
      // The visible label is split across text and logo art, so the full
      // sentence is supplied here for assistive tech.
      aria-label={t`Read this on ${name}`}
      title={t`Read this on ${name}`}
      {...stylex.props(styles.base, styles[size], brand[platform], style)}
    >
      {size === "md" ? (
        /* Translators: precedes the platform's logo, e.g. "Read on [Leaflet]". */
        <span {...stylex.props(styles.lede, styles.trimmed)} aria-hidden>
          <Trans>Read on</Trans>
        </span>
      ) : null}
      <span aria-hidden {...stylex.props(styles.lockup)}>
        <PlatformLockup platform={platform} size={size} />
      </span>
      {/* The icon variant is the mark alone — an arrow beside it at 2rem would
          crowd the glyph it's meant to support. */}
      {size === "icon" ? null : (
        <ArrowUpRight
          size={size === "md" ? 16 : 14}
          aria-hidden
          {...stylex.props(styles.arrow)}
        />
      )}
    </a>
  );
}
