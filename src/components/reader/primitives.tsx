import * as stylex from "@stylexjs/stylex";
import { Heart } from "lucide-react";

import type { PublicationCard } from "../../integrations/tanstack-query/api-shapes";

import { Avatar } from "../../design-system/avatar";
import { Flex } from "../../design-system/flex";
import { primaryColor, uiColor } from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import { ui } from "../../design-system/theme/semantic-color.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../../design-system/theme/typography.stylex";
import { formatReaders, initials } from "./format";

/* ── styles ─────────────────────────────────────────────────────────────── */

const styles = stylex.create({
  kicker: {
    color: primaryColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: "0.72rem",
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
  },
  kickerMuted: {
    color: uiColor.text1,
  },
  handle: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    letterSpacing: tracking.tight,
  },
  meta: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
  likeCount: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
  likeCountSm: {
    fontSize: fontSize.sm,
  },
  topic: {
    color: primaryColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.wide,
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["3xl"],
    fontStyle: "italic",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
  },
  placeholder: {
    borderColor: uiColor.border1,
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.component1,
    backgroundImage: `repeating-linear-gradient(135deg, ${uiColor.border1} 0 1px, transparent 1px 9px)`,
    display: "block",
    flexShrink: 0,
  },
  avatarPattern: {
    overflow: "hidden",
  },
  content: {
    boxSizing: "border-box",
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "1320px",
    paddingBottom: "5rem",
    paddingLeft: { default: "1.25rem", "@media (min-width: 40rem)": "2.5rem" },
    paddingRight: { default: "1.25rem", "@media (min-width: 40rem)": "2.5rem" },
    width: "100%",
  },
  masthead: {
    alignItems: "end",
    columnGap: "1.5rem",
    display: "flex",
    justifyContent: "space-between",
    rowGap: "1.5rem",
    borderBottomColor: uiColor.border3,
    borderBottomStyle: "solid",
    borderBottomWidth: 2,
    marginBottom: "1.9rem",
    paddingBottom: "1.6rem",
    paddingTop: { default: "1.5rem", "@media (min-width: 40rem)": "2.4rem" },
  },
  mastheadTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: { default: "2.2rem", "@media (min-width: 48rem)": "3rem" },
    fontStyle: "italic",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.xs,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  mastheadDek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    maxWidth: "60ch",
  },
  mastheadMeta: {
    display: { default: "none", "@media (min-width: 48rem)": "flex" },
    flexShrink: 0,
    textAlign: "right",
  },
  metaDate: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    letterSpacing: tracking.wide,
    textTransform: "uppercase",
  },
  metaBig: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: "1.85rem",
  },
  kickerRow: {
    alignItems: "center",
    columnGap: spacing["1.5"],
    display: "inline-flex",
    rowGap: spacing["1.5"],
  },
  kickerIcon: {
    color: primaryColor.text2,
    flexShrink: 0,
  },
  sectionHead: {
    marginBottom: spacing["5"],
    marginTop: spacing["2"],
  },
  divider: {
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    height: 0,
    marginBottom: spacing["11"],
    marginTop: spacing["11"],
  },
});

/* ── components ─────────────────────────────────────────────────────────── */

export function Kicker({
  children,
  muted = false,
  icon,
}: {
  children: React.ReactNode;
  muted?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <span
      {...stylex.props(
        styles.kicker,
        muted && styles.kickerMuted,
        icon != null && styles.kickerRow,
      )}
    >
      {icon != null ? (
        <span {...stylex.props(styles.kickerIcon)}>{icon}</span>
      ) : null}
      {children}
    </span>
  );
}

export function Handle({ children }: { children: React.ReactNode }) {
  return <span {...stylex.props(styles.handle)}>{children}</span>;
}

export function MetaLine({ children }: { children: React.ReactNode }) {
  return (
    <Flex align="center" gap="md" wrap style={styles.meta}>
      {children}
    </Flex>
  );
}

const LIKE_ICON_SIZE = { sm: 14, xs: 12 } as const;

/** Network like count with a heart icon; renders nothing when `count` is zero. */
export function LikeCount({
  count,
  size = "xs",
}: {
  count: number;
  size?: keyof typeof LIKE_ICON_SIZE;
}) {
  if (count <= 0) return null;
  return (
    <Flex
      align="center"
      gap="xs"
      style={[styles.likeCount, size === "sm" && styles.likeCountSm]}
    >
      <Heart size={LIKE_ICON_SIZE[size]} aria-hidden strokeWidth={2} />
      <span>{formatReaders(count)}</span>
    </Flex>
  );
}

export function Topic({ name }: { name: string | null }) {
  if (!name) return null;
  return <span {...stylex.props(styles.topic)}>{name}</span>;
}

export function SectionHead({
  kicker,
  title,
  action,
  icon,
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Flex align="end" justify="between" gap="2xl" style={styles.sectionHead}>
      <Flex direction="column" gap="md">
        {kicker != null && <Kicker icon={icon}>{kicker}</Kicker>}
        <span {...stylex.props(styles.sectionTitle)}>{title}</span>
      </Flex>
      {action}
    </Flex>
  );
}

export function SectionDivider() {
  return <hr {...stylex.props(ui.borderDim, styles.divider)} />;
}

export function PlaceholderImg({ style }: { style?: stylex.StyleXStyles }) {
  return <span aria-hidden {...stylex.props(styles.placeholder, style)} />;
}

export function ReaderContent({ children }: { children: React.ReactNode }) {
  return <div {...stylex.props(styles.content)}>{children}</div>;
}

export function Masthead({
  kicker,
  kickerIcon,
  title,
  dek,
  metaLabel,
  metaValue,
}: {
  kicker?: React.ReactNode;
  kickerIcon?: React.ReactNode;
  title: React.ReactNode;
  dek?: React.ReactNode;
  metaLabel?: React.ReactNode;
  metaValue?: React.ReactNode;
}) {
  return (
    <div {...stylex.props(styles.masthead)}>
      <Flex direction="column" gap="3xl">
        <Flex direction="column" gap="4xl">
          {kicker != null && <Kicker icon={kickerIcon}>{kicker}</Kicker>}
          <h1 {...stylex.props(styles.mastheadTitle)}>{title}</h1>
        </Flex>
        {dek != null && <p {...stylex.props(styles.mastheadDek)}>{dek}</p>}
      </Flex>
      {metaValue != null && (
        <Flex direction="column" gap="lg" style={styles.mastheadMeta}>
          {metaLabel != null && (
            <span {...stylex.props(styles.metaDate)}>{metaLabel}</span>
          )}
          <span {...stylex.props(styles.metaBig)}>{metaValue}</span>
        </Flex>
      )}
    </div>
  );
}

/** A publication avatar: its icon if indexed, else colored initials. */
export function PublicationAvatar({
  pub,
  size = "md",
  style,
}: {
  pub: Pick<PublicationCard, "name" | "iconUrl"> &
    Partial<Pick<PublicationCard, "ownerAvatarUrl">>;
  size?: "sm" | "md" | "lg" | "xl";
  /** Extra wrapper styles (e.g. an override size for the profile hero). */
  style?: stylex.StyleXStyles;
}) {
  return (
    <Avatar
      size={size}
      src={pub.iconUrl ?? pub.ownerAvatarUrl ?? undefined}
      fallback={initials(pub.name)}
      alt={pub.name}
      style={[styles.avatarPattern, style]}
    />
  );
}
