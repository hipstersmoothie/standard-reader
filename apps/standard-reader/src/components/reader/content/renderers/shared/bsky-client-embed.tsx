"use client";

import { Plural, Trans } from "@lingui/react/macro";
import { Avatar } from "@standard-reader/design-system/avatar";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useHover } from "react-aria";

import { initials } from "#/components/reader/format";
import { bskyApi } from "#/integrations/tanstack-query/api-bsky.functions";
import type { BskyClientRef } from "#/lib/atproto/bsky-clients";
import { normalizeAuthorRef } from "#/lib/author-profile";
import type { BskyEntityCard } from "#/server/atproto/bsky-entities";

import { BskyPostView } from "./bsky-post-embed";

/**
 * A link block whose target is a Bluesky web client — `bsky.app` or one of its
 * forks (Witchsky, mu.social, …). Those URLs address AT Protocol records, not
 * third-party pages, so render the record itself: a post becomes a post embed,
 * and a profile / feed / list / starter pack becomes an entity card.
 *
 * While the record loads (and if it can't be resolved at all) `fallback` — the
 * ordinary link card the block would otherwise have rendered — stands in, so a
 * dead or blocked record never leaves a hole in the article.
 */
export function BskyClientEmbedView({
  url,
  clientRef,
  fallback,
}: {
  url: string;
  clientRef: BskyClientRef;
  fallback: ReactNode;
}) {
  if (clientRef.kind === "post") {
    return (
      <BskyPostView
        ident={clientRef.ident}
        rkey={clientRef.rkey}
        notFound={fallback}
      />
    );
  }
  return <BskyEntityCardView url={url} fallback={fallback} />;
}

function BskyEntityCardView({
  url,
  fallback,
}: {
  url: string;
  fallback: ReactNode;
}) {
  const { hoverProps, isHovered } = useHover({});
  const { data: card } = useQuery(bskyApi.getEntityCardQueryOptions(url));

  if (!card) return <>{fallback}</>;

  const body = (
    <>
      <Avatar
        size="lg"
        src={card.avatarUrl ?? undefined}
        fallback={initials(card.title)}
        alt=""
        style={styles.avatar}
      />
      <div {...stylex.props(styles.meta)}>
        <p {...stylex.props(styles.kind)}>
          <EntityKindLabel card={card} />
        </p>
        <p {...stylex.props(styles.title)}>{card.title}</p>
        {card.description ? (
          <p {...stylex.props(styles.description)}>{card.description}</p>
        ) : null}
        <p {...stylex.props(styles.byline)}>
          <EntityByline card={card} />
        </p>
      </div>
    </>
  );

  const cardStyles = stylex.props(styles.card, isHovered && styles.cardHovered);

  // A profile is somebody we have a page for; everything else opens in the
  // client the link came from.
  if (card.kind === "profile" && card.did) {
    return (
      <Link
        to="/u/$did"
        params={{ did: normalizeAuthorRef(card.did) }}
        {...hoverProps}
        {...cardStyles}
      >
        {body}
      </Link>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      {...hoverProps}
      {...cardStyles}
    >
      {body}
    </a>
  );
}

/** Eyebrow naming what kind of record the card is showing. */
function EntityKindLabel({ card }: { card: BskyEntityCard }) {
  switch (card.kind) {
    case "profile": {
      return <Trans>Profile</Trans>;
    }
    case "feed": {
      return <Trans>Feed</Trans>;
    }
    case "list": {
      return <Trans>List</Trans>;
    }
    case "starterPack": {
      return <Trans>Starter pack</Trans>;
    }
  }
}

/**
 * Owner plus the one count that matters for this kind — followers for a
 * profile, likes for a feed, members for a list, joins for a starter pack.
 */
function EntityByline({ card }: { card: BskyEntityCard }) {
  const owner = card.creatorDisplayName ?? card.creatorHandle;
  const stat = card.count == null ? null : <EntityStat card={card} />;

  return (
    <>
      {owner ? <span>{owner}</span> : null}
      {owner && stat ? " · " : null}
      {stat}
    </>
  );
}

function EntityStat({ card }: { card: BskyEntityCard }) {
  const value = card.count ?? 0;
  switch (card.kind) {
    case "profile": {
      return <Plural value={value} one="# follower" other="# followers" />;
    }
    case "feed": {
      return <Plural value={value} one="# like" other="# likes" />;
    }
    case "list": {
      return <Plural value={value} one="# member" other="# members" />;
    }
    case "starterPack": {
      return <Plural value={value} one="# join" other="# joins" />;
    }
  }
}

const styles = stylex.create({
  card: {
    padding: spacing["4"],
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    textDecoration: "none",
    alignItems: "flex-start",
    backgroundColor: uiColor.component1,
    columnGap: gap.md,
    display: "flex",
    transitionDuration: animationDuration.default,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease",
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
  },
  cardHovered: {
    backgroundColor: uiColor.component2,
  },
  avatar: {
    flexShrink: 0,
  },
  meta: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    rowGap: spacing["1"],
    minWidth: 0,
  },
  kind: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  title: {
    color: primaryColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  description: {
    overflow: "hidden",
    // oxlint-disable-next-line @stylexjs/valid-styles
    WebkitBoxOrient: "vertical",
    // oxlint-disable-next-line @stylexjs/valid-styles
    WebkitLineClamp: 3,
    color: uiColor.text1,
    display: "-webkit-box",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    whiteSpace: "pre-wrap",
  },
  byline: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
});
