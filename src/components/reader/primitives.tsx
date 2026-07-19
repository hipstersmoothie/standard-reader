import * as stylex from "@stylexjs/stylex";
import { Heart, MessageCircle } from "lucide-react";

import { Text } from "#/design-system/typography/text.tsx";

import { Avatar } from "../../design-system/avatar";
import { Flex } from "../../design-system/flex";
import { primaryColor, uiColor } from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import { ui } from "../../design-system/theme/semantic-color.stylex";
import { gap } from "../../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import type { StyleXComponentProps } from "../../design-system/theme/types";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../../design-system/theme/typography.stylex";
import type { PublicationCard } from "../../integrations/tanstack-query/api-shapes";
import { formatReaders, initials } from "./format";

/* ── styles ─────────────────────────────────────────────────────────────── */

const styles = stylex.create({
  kicker: {
    color: primaryColor.text1,
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
    display: "inline-flex",
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    letterSpacing: tracking.tight,
    // Handles/stat runs are Latin+digits sitting inside RTL UI lines; isolate
    // them so the bidi algorithm can't reorder them with neighbouring text.
    unicodeBidi: "isolate",
  },
  meta: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
  metaDot: {
    color: uiColor.text1,
  },
  likeCount: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
  likeCountSm: {
    fontSize: fontSize.sm,
  },
  commentCount: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
  commentCountSm: {
    fontSize: fontSize.sm,
  },
  sectionTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
  },
  // Compact step for heads nested under a page that already has its own title
  // (e.g. a group inside a profile tab), where the full size would rival it.
  sectionTitleCompact: {
    fontSize: fontSize["2xl"],
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
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    maxWidth: "1320px",
    paddingBottom: spacing["20"],
    paddingInlineStart: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    paddingInlineEnd: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    width: "100%",
  },
  masthead: {
    alignItems: "end",
    columnGap: gap["5xl"],
    display: "flex",
    justifyContent: "space-between",
    rowGap: gap["5xl"],
    borderBottomColor: uiColor.border3,
    borderBottomStyle: "solid",
    borderBottomWidth: 2,
    marginBottom: spacing["8"],
    paddingBottom: spacing["6"],
    paddingTop: {
      default: spacing["6"],
      "@media (min-width: 40rem)": spacing["10"],
    },
  },
  mastheadTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: { default: "2.2rem", "@media (min-width: 48rem)": "3rem" },
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
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    maxWidth: "60ch",
  },
  mastheadMeta: {
    display: { default: "none", "@media (min-width: 48rem)": "flex" },
    flexShrink: 0,
    textAlign: "end",
  },
  mastheadMetaWithAccessory: {
    display: "flex",
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
    alignItems: {
      default: "stretch",
      "@media (min-width: 40rem)": "flex-end",
    },
    columnGap: gap["2xl"],
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 40rem)": "row",
    },
    justifyContent: "space-between",
    rowGap: gap["2xl"],
    marginBottom: spacing["5"],
    marginTop: spacing["2"],
  },
  sectionHeadRow: {
    alignItems: "flex-end",
    flexDirection: "row",
  },
  sectionHeadTitle: {
    minWidth: 0,
  },
  sectionHeadAction: {
    flexShrink: 0,
    minWidth: 0,
    width: {
      default: "100%",
      "@media (min-width: 40rem)": "auto",
    },
  },
  sectionHeadActionAuto: {
    width: "auto",
  },
  metaGroup: {
    alignItems: "center",
    columnGap: gap.md,
    display: "inline-flex",
    flexShrink: 0,
    rowGap: gap.md,
    whiteSpace: "nowrap",
  },
  divider: {
    borderBottomWidth: 0,
    borderInlineStartWidth: 0,
    borderInlineEndWidth: 0,
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
    <Text
      style={[
        styles.kicker,
        muted && styles.kickerMuted,
        icon != null && styles.kickerRow,
      ]}
    >
      {icon == null ? null : (
        <span {...stylex.props(styles.kickerIcon)}>{icon}</span>
      )}
      {children}
    </Text>
  );
}

/**
 * Same visual treatment as {@link Handle}, but for TRANSLATED UI text (counts,
 * stat labels) rather than user content — so it inherits the UI direction
 * instead of forcing `dir="auto"`. Using `Handle` here would resolve an Arabic
 * label's direction from its own characters, which is right by accident but
 * wrong in intent, and breaks for locales whose script matches the content.
 */
export function MetaText({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: stylex.StyleXStyles;
}) {
  return <span {...stylex.props(styles.handle, style)}>{children}</span>;
}

export function Handle({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: stylex.StyleXStyles;
}) {
  // `dir="auto"` — handles and stat runs are user content with no language
  // metadata; let the browser resolve direction from the first strong char
  // instead of inheriting the (possibly RTL) UI direction.
  return <span {...stylex.props(styles.handle, style)}>{children}</span>;
}

export function MetaLine({ children }: { children: React.ReactNode }) {
  return (
    <Flex align="center" gap="md" wrap style={styles.meta}>
      {children}
    </Flex>
  );
}

const ENGAGEMENT_ICON_SIZE = { sm: 14, xs: 12 } as const;

/** Network recommendation count with a heart icon; renders nothing when `count` is zero. */
export function LikeCount({
  count,
  size = "xs",
}: {
  count: number;
  size?: keyof typeof ENGAGEMENT_ICON_SIZE;
}) {
  if (count <= 0) return null;
  return (
    <Flex
      align="center"
      gap="xs"
      style={[styles.likeCount, size === "sm" && styles.likeCountSm]}
    >
      <Heart size={ENGAGEMENT_ICON_SIZE[size]} aria-hidden strokeWidth={2} />
      <span>{formatReaders(count)}</span>
    </Flex>
  );
}

/** Bluesky discussion count; renders nothing when `count` is zero. */
export function CommentCount({
  count,
  size = "xs",
}: {
  count: number;
  size?: keyof typeof ENGAGEMENT_ICON_SIZE;
}) {
  if (count <= 0) return null;
  return (
    <Flex
      align="center"
      gap="xs"
      style={[styles.commentCount, size === "sm" && styles.commentCountSm]}
    >
      <MessageCircle
        size={ENGAGEMENT_ICON_SIZE[size]}
        aria-hidden
        strokeWidth={2}
      />
      <span>{formatReaders(count)}</span>
    </Flex>
  );
}

/** Recommendation + Bluesky comment counts for article cards and bylines. */
export function ArticleEngagement({
  recommendCount,
  commentCount,
  size = "xs",
}: {
  recommendCount: number;
  commentCount: number;
  size?: keyof typeof ENGAGEMENT_ICON_SIZE;
}) {
  const hasLikes = recommendCount > 0;
  const hasComments = commentCount > 0;
  if (!hasLikes && !hasComments) return null;

  return (
    <Flex align="center" gap="md" wrap style={styles.meta}>
      {hasLikes ? <LikeCount count={recommendCount} size={size} /> : null}
      {hasLikes && hasComments ? (
        <span aria-hidden {...stylex.props(styles.metaDot)}>
          ·
        </span>
      ) : null}
      {hasComments ? <CommentCount count={commentCount} size={size} /> : null}
    </Flex>
  );
}

export { Topic } from "./topic-link";

export function SectionHead({
  kicker,
  title,
  action,
  icon,
  stackOnMobile = true,
  size = "lg",
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  /** Set false to keep the action inline with the title even on narrow screens (e.g. a compact icon button). */
  stackOnMobile?: boolean;
  /**
   * `"lg"` is the page-level head used on Discover and Search. Use `"md"` for a
   * group nested under a surface that already has its own title, so the head
   * ranks below that title instead of tying with it.
   */
  size?: "lg" | "md";
}) {
  return (
    <div
      {...stylex.props(
        styles.sectionHead,
        !stackOnMobile && styles.sectionHeadRow,
      )}
    >
      <Flex direction="column" gap="md" style={styles.sectionHeadTitle}>
        {kicker != null && <Kicker icon={icon}>{kicker}</Kicker>}
        <span
          {...stylex.props(
            styles.sectionTitle,
            size === "md" && styles.sectionTitleCompact,
          )}
        >
          {title}
        </span>
      </Flex>
      {action == null ? null : (
        <div
          {...stylex.props(
            styles.sectionHeadAction,
            !stackOnMobile && styles.sectionHeadActionAuto,
          )}
        >
          {action}
        </div>
      )}
    </div>
  );
}

/** Keeps related meta fragments on one line (e.g. reader + post counts). */
export function MetaGroup({ children }: { children: React.ReactNode }) {
  return <span {...stylex.props(styles.metaGroup)}>{children}</span>;
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
  metaAccessory,
  style,
}: {
  kicker?: React.ReactNode;
  kickerIcon?: React.ReactNode;
  title: React.ReactNode;
  dek?: React.ReactNode;
  metaLabel?: React.ReactNode;
  metaValue?: React.ReactNode;
  metaAccessory?: React.ReactNode;
  style?: StyleXComponentProps<React.ComponentProps<"div">>["style"];
}) {
  return (
    <div {...stylex.props(styles.masthead, style)}>
      <Flex direction="column" gap="3xl">
        <Flex direction="column" gap="4xl">
          {metaAccessory}
          {kicker != null && <Kicker icon={kickerIcon}>{kicker}</Kicker>}
          <h1 {...stylex.props(styles.mastheadTitle)}>{title}</h1>
        </Flex>
        {dek != null && <p {...stylex.props(styles.mastheadDek)}>{dek}</p>}
      </Flex>
      {metaValue != null || metaAccessory != null ? (
        <Flex
          direction="column"
          gap="lg"
          style={[
            styles.mastheadMeta,
            metaAccessory != null && styles.mastheadMetaWithAccessory,
          ]}
        >
          {metaLabel == null ? null : (
            <span {...stylex.props(styles.metaDate)}>{metaLabel}</span>
          )}
          {metaValue == null ? null : (
            <span {...stylex.props(styles.metaBig)}>{metaValue}</span>
          )}
        </Flex>
      ) : null}
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
