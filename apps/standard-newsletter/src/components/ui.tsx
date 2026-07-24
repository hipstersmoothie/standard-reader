import { Avatar } from "@standard-reader/design-system/avatar";
import {
  criticalColor,
  primaryColor,
  successColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { common } from "../common-styles";
import type { Publication } from "../data/publications";
import { I, Ico } from "./icons";

const styles = stylex.create({
  delta: {
    alignItems: "center",
    columnGap: gap.xxs,
    display: "inline-flex",
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    rowGap: gap.xxs,
  },
  deltaUp: { color: successColor.text1 },
  deltaDown: { color: criticalColor.text1 },

  track: {
    backgroundColor: uiColor.component2,
    borderRadius: radius.sm,
    height: spacing["1.5"],
    overflow: "hidden",
  },
  fill: {
    borderRadius: radius.sm,
    height: "100%",
  },
  fillAccent: { backgroundColor: primaryColor.solid1 },
  fillPositive: { backgroundColor: successColor.solid1 },
  // Only the bar's length is data; its color comes from the metric's tone.
  fillWidth: (pct: number) => ({ width: `${pct}%` }),

  statCard: {
    columnGap: gap.xl,
    display: "flex",
    flexDirection: "column",
    paddingBlockEnd: verticalSpace["4xl"],
    paddingBlockStart: verticalSpace["4xl"],
    paddingInlineEnd: horizontalSpace["4xl"],
    paddingInlineStart: horizontalSpace["4xl"],
    rowGap: gap.xl,
  },
  statCardInteractive: {
    cursor: "pointer",
  },
  statHead: {
    alignItems: "center",
    columnGap: gap.lg,
    display: "flex",
    rowGap: gap.lg,
  },
  statLabel: {
    color: uiColor.text1,
    fontSize: fontSize.xs,
    letterSpacing: tracking.wider,
    textTransform: "uppercase",
  },
  statValue: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["4xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
  },
  statFoot: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.xs,
    display: "flex",
    fontSize: fontSize.xs,
    rowGap: gap.xs,
  },

  bigStat: {
    paddingBlockEnd: verticalSpace.xs,
    paddingBlockStart: verticalSpace.xs,
  },
  bigStatLabel: {
    color: uiColor.text1,
    fontSize: fontSize.xs,
    letterSpacing: tracking.wider,
    marginBottom: verticalSpace.sm,
    textTransform: "uppercase",
  },
  bigStatValue: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
  },
  bigStatAccent: { color: primaryColor.text1 },
  bigStatPositive: { color: successColor.text1 },
  bigStatCritical: { color: criticalColor.text1 },
  bigStatSub: {
    color: uiColor.text1,
    fontSize: fontSize.xs,
    marginTop: verticalSpace.xs,
  },
});

export function Delta({
  value,
  suffix = "",
  invert = false,
}: {
  value: number;
  suffix?: string;
  invert?: boolean;
}) {
  const good = invert ? value < 0 : value >= 0;
  const arrow = value >= 0 ? I.up : I.down;
  return (
    <span
      {...stylex.props(
        styles.delta,
        good ? styles.deltaUp : styles.deltaDown,
      )}
    >
      <Ico d={arrow} s={13} w={2.4} />
      {Math.abs(value)}
      {suffix}
    </span>
  );
}

const BAR_TONE = {
  accent: styles.fillAccent,
  positive: styles.fillPositive,
} as const;

/** Opens read in the accent, clicks in the positive green. */
export function StatBar({
  pct,
  tone = "accent",
}: {
  pct: number;
  tone?: keyof typeof BAR_TONE;
}) {
  return (
    <div {...stylex.props(styles.track)}>
      <div
        {...stylex.props(
          styles.fill,
          BAR_TONE[tone],
          styles.fillWidth(Math.min(100, pct)),
        )}
      />
    </div>
  );
}

export type PubAvatarSize = "sm" | "md" | "lg" | "xl";

/**
 * Readable text color for a letter sitting on `bg`.
 *
 * A publication's stored `accentForeground` can't be trusted for this — real
 * themes pair, e.g., a magenta accent with a green foreground, which is
 * illegible on the tile. So we ignore it and pick white or ink from the
 * background's own WCAG relative luminance instead. `#ffffff` / `#241d18` are
 * the two literal endpoints of that choice (this is contrast math on an
 * arbitrary runtime hex, not themeable spacing/scale values).
 */
function srgbChannel(pair: string): number {
  const c = Number.parseInt(pair, 16) / 255;
  return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function readableOn(bg: string): string {
  const hex = bg.replace("#", "");
  if (hex.length < 6) return "#ffffff";
  const luminance =
    0.2126 * srgbChannel(hex.slice(0, 2)) +
    0.7152 * srgbChannel(hex.slice(2, 4)) +
    0.0722 * srgbChannel(hex.slice(4, 6));
  return luminance > 0.42 ? "#241d18" : "#ffffff";
}

/**
 * A publication's avatar: its `icon` blob when it has one, falling back to the
 * first letter of its name on the publication's own accent — the colored tile
 * is how these screens tell publications apart at a glance, so the fallback
 * keeps it rather than dropping to the neutral default.
 *
 * Takes loose fields rather than a `Publication` so the connect flow, which
 * works with publications that aren't newsletters yet (and so have no theme),
 * can use the same avatar.
 *
 * Sizes map onto the design system's avatar scale: sm 24px, md 32px, lg 44px,
 * xl 56px.
 */
export function PubAvatar({
  name,
  icon,
  iconUrl,
  accent,
  size = "lg",
}: {
  name: string;
  icon: string;
  iconUrl: string | null;
  accent?: string;
  size?: PubAvatarSize;
}) {
  return (
    <Avatar
      size={size}
      src={iconUrl ?? undefined}
      alt={name}
      fallback={icon}
      style={
        accent
          ? glyphStyles.tint(accent, readableOn(accent))
          : glyphStyles.serif
      }
    />
  );
}

/** {@link PubAvatar} for a connected publication, themed from its own accent. */
export function PubGlyph({
  pub,
  size = "lg",
}: {
  pub: Publication;
  size?: PubAvatarSize;
}) {
  return (
    <PubAvatar
      name={pub.name}
      icon={pub.icon}
      iconUrl={pub.iconUrl}
      accent={pub.theme.accent}
      size={size}
    />
  );
}

const glyphStyles = stylex.create({
  serif: { fontFamily: fontFamily["serif"] },
  tint: (background: string, foreground: string) => ({
    backgroundColor: background,
    color: foreground,
    fontFamily: fontFamily["serif"],
  }),
});

export function StatCard({
  icon,
  label,
  value,
  foot,
  onClick,
}: {
  icon: string;
  label: string;
  value: string;
  foot: ReactNode;
  /** When set, the whole card becomes a button (e.g. Subscribers → the list). */
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      {...stylex.props(
        common.card,
        styles.statCard,
        interactive && styles.statCardInteractive,
      )}
    >
      <div {...stylex.props(styles.statHead)}>
        <div {...stylex.props(common.chip, common.chipSm)}>
          <Ico d={icon} s={16} />
        </div>
        <span {...stylex.props(styles.statLabel)}>{label}</span>
      </div>
      <div {...stylex.props(styles.statValue)}>{value}</div>
      <div {...stylex.props(styles.statFoot)}>{foot}</div>
    </div>
  );
}

const STAT_TONE = {
  accent: styles.bigStatAccent,
  positive: styles.bigStatPositive,
  critical: styles.bigStatCritical,
} as const;

/**
 * One figure in a send's delivery report. `tone` colors the number by what it
 * means — opens in the accent, clicks positive, bounces critical; a metric with
 * no verdict (delivered, unsubscribes) stays ink.
 */
export function BigStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: keyof typeof STAT_TONE;
}) {
  return (
    <div {...stylex.props(styles.bigStat)}>
      <div {...stylex.props(styles.bigStatLabel)}>{label}</div>
      <div
        {...stylex.props(styles.bigStatValue, tone && STAT_TONE[tone])}
      >
        {value}
      </div>
      <div {...stylex.props(styles.bigStatSub)}>{sub}</div>
    </div>
  );
}
