"use client";

import { Plural } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { Skeleton } from "@standard-reader/design-system/skeleton";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { shadow } from "@standard-reader/design-system/theme/shadow.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useRouter } from "@tanstack/react-router";

import type { TopicCard as TopicCardData } from "#/server/reader/topics";

import { MetaGroup, MetaLine, MetaText, PublicationAvatar } from "./primitives";
import { EntityGridList } from "./pub-grid-list";
import type { GridListLayout } from "./pub-grid-list";

/**
 * Cards for auto-derived topics.
 *
 * Visually the publication card's sibling (same border, hover lift, serif
 * title) so Discover reads as one system. The difference is the anchor: a
 * publication leads with its own icon, and a topic — which has no image of
 * its own — leads with a stack of its members'. That is the card's focal point
 * and its most useful fact at a glance; without it the card was a wall of text
 * sitting next to rails that all had one.
 *
 * Tags are a *sample*, not the set. The index carries 24 per topic so that
 * search can match them, but rendering 24 pills buried the name and the
 * description under a grid of chips; {@link CARD_TAGS} shows the few that
 * characterize it and the topic page shows the rest.
 */

/** Sub-area tags shown on a card, whatever the caller loaded. */
const CARD_TAGS = 4;

function TopicAvatars({ topic }: { topic: TopicCardData }) {
  if (topic.avatars.length === 0) return null;

  return (
    // Overlapped so it reads as a group rather than a row of unrelated icons —
    // the same treatment the "people you follow" prompt uses on Discover.
    <div {...stylex.props(styles.avatars)} aria-hidden>
      {topic.avatars.map((member, index) => (
        <PublicationAvatar
          key={`${member.name}-${index}`}
          pub={{
            name: member.name,
            iconUrl: member.iconUrl,
            ownerAvatarUrl: member.ownerAvatarUrl,
          }}
          size="md"
          style={styles.avatar}
        />
      ))}
    </div>
  );
}

export function TopicCard({
  topic,
  rail = false,
}: {
  topic: TopicCardData;
  rail?: boolean;
}) {
  const tags = topic.tags.slice(0, CARD_TAGS);

  return (
    <div {...stylex.props(styles.card, rail && styles.cardRail)}>
      <TopicAvatars topic={topic} />
      <span {...stylex.props(styles.name)}>{topic.name}</span>
      {topic.description ? (
        <p dir="auto" {...stylex.props(styles.description)}>
          {topic.description}
        </p>
      ) : (
        <div aria-hidden {...stylex.props(styles.grow)} />
      )}

      {tags.length > 0 ? (
        <Flex gap="xs" wrap style={styles.tags}>
          {tags.map((tag) => (
            // Plain text, not links: the whole card is already one press
            // target, and the topic page is where sub-areas become
            // navigable. `dir="auto"` because tags are author-supplied.
            <span key={tag} dir="auto" {...stylex.props(styles.tag)}>
              {tag}
            </span>
          ))}
        </Flex>
      ) : null}

      <div {...stylex.props(styles.footWrap)}>
        <div {...stylex.props(styles.foot)}>
          <MetaLine>
            <MetaGroup>
              <MetaText>
                <Plural
                  value={topic.publicationCount}
                  one="# publication"
                  other="# publications"
                />
              </MetaText>
            </MetaGroup>
            <MetaGroup>
              <MetaText>
                <Plural
                  value={topic.authorCount}
                  one="# writer"
                  other="# writers"
                />
              </MetaText>
            </MetaGroup>
          </MetaLine>
        </div>
      </div>
    </div>
  );
}

export function TopicCardSkeleton({ rail = false }: { rail?: boolean }) {
  return (
    <div
      aria-hidden
      {...stylex.props(styles.card, rail && styles.cardRail, styles.skeleton)}
    >
      <div {...stylex.props(styles.avatars)}>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton
            key={index}
            variant="circle"
            size="sm"
            style={styles.avatar}
          />
        ))}
      </div>
      <Skeleton variant="rectangle" height={spacing["6"]} width="70%" />
      <Skeleton variant="rectangle" height={spacing["5"]} width="100%" />
      <Skeleton variant="rectangle" height={spacing["5"]} width="85%" />
      <Flex gap="xs" wrap style={styles.tags}>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton
            key={index}
            variant="rectangle"
            height={spacing["4"]}
            width={spacing["12"]}
          />
        ))}
      </Flex>
      <div {...stylex.props(styles.footWrap)}>
        <div {...stylex.props(styles.foot)}>
          <Skeleton variant="rectangle" height={spacing["4"]} width="60%" />
        </div>
      </div>
    </div>
  );
}

/** Topics as a keyboard-navigable, client-routed rail or grid. */
export function TopicGridList({
  topics,
  layout,
  "aria-label": ariaLabel,
}: {
  topics: Array<TopicCardData>;
  layout: GridListLayout;
  "aria-label": string;
}) {
  const router = useRouter();

  return (
    <EntityGridList
      items={topics}
      layout={layout}
      variant="card"
      aria-label={ariaLabel}
      describe={(topic) => ({
        key: topic.slug,
        label: topic.name,
        href: router.buildLocation({
          to: "/topics/$slug",
          params: { slug: topic.slug },
        }).href,
      })}
      renderItem={(topic) => (
        <TopicCard topic={topic} rail={layout === "rail"} />
      )}
    />
  );
}

const styles = stylex.create({
  card: {
    borderColor: {
      default: uiColor.border1,
      ":hover": uiColor.border2,
    },
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.bgSubtle,
    boxShadow: {
      default: null,
      ":hover": shadow.sm,
    },
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    paddingInlineEnd: spacing["5"],
    paddingInlineStart: spacing["5"],
    scrollSnapAlign: "start",
    transform: {
      default: null,
      ":hover": "translateY(-2px)",
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: {
      default: "border-color, box-shadow, transform",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    height: "100%",
    paddingBottom: spacing["5"],
    paddingTop: spacing["5"],
  },
  cardRail: {
    alignSelf: "stretch",
    width: {
      default: "260px",
      "@media (min-width: 40rem)": "300px",
    },
  },
  name: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    // Single-line NAME/TITLE in a UI row: isolate for ordering, but let
    // alignment follow the surrounding UI (right under RTL).
    unicodeBidi: "isolate",
    marginTop: spacing["0"],
  },
  description: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    lineHeight: lineHeight.sm,
    overflow: "hidden",
    // eslint-disable-next-line @stylexjs/valid-styles
    WebkitBoxOrient: "vertical",
    // eslint-disable-next-line @stylexjs/valid-styles
    WebkitLineClamp: 2,
    display: "-webkit-box",
    marginBottom: spacing["0"],
    marginTop: spacing["2"],
  },
  avatars: {
    display: "flex",
    flexShrink: 0,
    // First avatar on top, so the stack reads left-to-right as a group. The
    // padding cancels the first child's negative margin.
    paddingInlineStart: spacing["2"],
    marginBottom: spacing["3.5"],
  },
  avatar: {
    borderColor: uiColor.bgSubtle,
    borderStyle: "solid",
    borderWidth: 2,
    marginInlineStart: `calc(-1 * ${spacing["2"]})`,
  },
  grow: {
    flexBasis: "0%",
    flexGrow: 1,
  },
  tags: {
    marginTop: spacing["3.5"],
  },
  tag: {
    borderColor: uiColor.border1,
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 1,
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    paddingInlineEnd: spacing["2"],
    paddingInlineStart: spacing["2"],
    // Single-line tag chip: isolate so bidi text keeps its own ordering
    // without dragging the chip row's alignment around.
    unicodeBidi: "isolate",
    paddingBottom: spacing["0.5"],
    paddingTop: spacing["0.5"],
  },
  footWrap: {
    flexShrink: 0,
    marginTop: "auto",
    paddingTop: spacing["4"],
    width: "100%",
  },
  foot: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    paddingTop: spacing["3"],
    width: "100%",
  },
  skeleton: {
    rowGap: spacing["2"],
  },
});
