"use client";

import { Trans } from "@lingui/react/macro";
import { Avatar } from "@standard-reader/design-system/avatar";
import { Badge } from "@standard-reader/design-system/badge";
import { HoverCard } from "@standard-reader/design-system/hover-card";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
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
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { labelerApi } from "#/integrations/tanstack-query/api-labelers.functions";
import {
  labelValueDescription,
  labelValueDisplayName,
} from "#/lib/label-value";

import { Kicker } from "./primitives";

/**
 * A labeler label shown as a warning badge. Hovering (or focusing + Enter)
 * opens a card laid out like a content-label popover: a labeler avatar with
 * the label's display name, the label's description, and a footer that names
 * the source labeler and links to its page at `/labelers/$did`.
 *
 * The labeler view is fetched via `labelerApi.getLabelerQueryOptions(src)`
 * (cached, prefetched on the labeler detail route). The pill renders
 * immediately with the raw `val` and resolves the display name once the
 * labeler view is available, so it's never empty.
 */
export function LabelerPill({ src, val }: { src: string; val: string }) {
  const { data } = useQuery(labelerApi.getLabelerQueryOptions(src));
  const card = data?.labeler;
  const defs = card?.labelValueDefinitions;
  const name = labelValueDisplayName(defs, val);
  const description = labelValueDescription(defs, val);
  const labelerName = card?.displayName ?? src;

  return (
    <HoverCard
      placement="top"
      trigger={
        <Badge variant="warning" size="sm">
          {name}
        </Badge>
      }
    >
      <div {...stylex.props(styles.card)}>
        <div {...stylex.props(styles.head)}>
          <Avatar
            size="lg"
            src={card?.avatar}
            alt={labelerName}
            fallback={initials(labelerName)}
          />
          <div {...stylex.props(styles.meta)}>
            <Kicker muted>
              <Trans>Content label</Trans>
            </Kicker>
            <span {...stylex.props(styles.title)}>{name}</span>
          </div>
        </div>
        {description ? (
          <p {...stylex.props(styles.desc)}>{description}</p>
        ) : null}
        <div {...stylex.props(styles.foot)}>
          <span {...stylex.props(styles.source)}>{labelerName}</span>
          <Link
            data-labeler-action
            to="/labelers/$did"
            params={{ did: src }}
            {...stylex.props(styles.action)}
          >
            <Trans>View labeler</Trans>
            <span aria-hidden {...stylex.props(styles.arrow)}>
              →
            </span>
          </Link>
        </div>
      </div>
    </HoverCard>
  );
}

function initials(name: string): string {
  return name
    .replace(/^did:\w+:/, "")
    .slice(0, 2)
    .toUpperCase();
}

const styles = stylex.create({
  card: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.md,
    width: "20rem",
  },
  head: {
    alignItems: "center",
    columnGap: horizontalSpace.md,
    display: "flex",
  },
  meta: {
    display: "flex",
    flexDirection: "column",
    rowGap: verticalSpace.sm,
    minWidth: 0,
  },
  title: {
    overflow: "hidden",
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  desc: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginBottom: 0,
    marginTop: 0,
  },
  foot: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    marginInlineEnd: `calc(-1 * ${horizontalSpace.md})`,
    // Full-bleed footer: the popover content pads with `horizontalSpace.md`,
    // so negate it so the divider + footer span the card edge to edge.
    marginInlineStart: `calc(-1 * ${horizontalSpace.md})`,
    paddingInlineEnd: horizontalSpace.md,
    paddingInlineStart: horizontalSpace.md,
    // Top border acts as the full-width separator from the body.
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    paddingTop: verticalSpace.sm,
  },
  source: {
    overflow: "hidden",
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.wide,
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  action: {
    borderRadius: radius.sm,
    textDecoration: "none",
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.xs,
    display: "inline-flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  arrow: {
    color: uiColor.text1,
    display: "inline-block",
    transform: {
      default: "translateX(0)",
      ":is([data-labeler-action]:hover *)":
        "translateX(calc(var(--dir) * 3px))",
    },
    transitionDuration: animationDuration.default,
    transitionProperty: "transform",
  },
});
