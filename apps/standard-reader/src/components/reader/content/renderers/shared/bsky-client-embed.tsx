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
import { use, useMemo } from "react";
import { useHover } from "react-aria";

import { initials } from "#/components/reader/format";
import { bskyApi } from "#/integrations/tanstack-query/api-bsky.functions";
import type { BskyClientRef } from "#/lib/atproto/bsky-clients";
import { bskyClientBrand } from "#/lib/atproto/bsky-clients";
import { normalizeAuthorRef } from "#/lib/author-profile";
import { buildMagazinePalette } from "#/lib/collections/radix-theme";
import { useTheme } from "#/lib/use-theme";
import { MagazineColorContext } from "#/magazine/context";
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
  const brandVars = useClientBrandVars(clientRef.host);
  const brand = bskyClientBrand(clientRef.host);

  if (clientRef.kind === "post") {
    return (
      <BskyPostView
        ident={clientRef.ident}
        rkey={clientRef.rkey}
        notFound={fallback}
        // The post card is `bsky-react-post`'s own markup and its internal
        // links all point at bsky.app, so a fork gets an attribution line
        // beneath it. bsky.app needs none — the card already reads as Bluesky.
        caption={
          brand.name === "Bluesky" ? null : (
            <ClientAttribution url={url} host={clientRef.host} />
          )
        }
      />
    );
  }
  return (
    <BskyEntityCardView
      url={url}
      host={clientRef.host}
      brandVars={brandVars}
      fallback={fallback}
    />
  );
}

function BskyEntityCardView({
  url,
  host,
  brandVars,
  fallback,
}: {
  url: string;
  host: string;
  brandVars: Record<string, string> | null;
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
          <span {...stylex.props(styles.brand)}>
            {bskyClientBrand(host).name}
          </span>
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
  const style = { ...cardStyles.style, ...brandVars };

  // A profile is somebody we have a page for; everything else opens in the
  // client the link came from.
  if (card.kind === "profile" && card.did) {
    return (
      <Link
        to="/u/$did"
        params={{ did: normalizeAuthorRef(card.did) }}
        {...hoverProps}
        className={cardStyles.className}
        style={style}
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
      className={cardStyles.className}
      style={style}
    >
      {body}
    </a>
  );
}

/**
 * Card-scoped CSS variables carrying the client's brand color. The raw brand
 * color is never painted directly — it goes through the same Radix scale
 * generator the magazine palette uses, which yields a border tint and a text
 * color that stay contrast-safe in light *and* dark. Returns null when the
 * client publishes no brand color, so the card keeps the reader's own border.
 */
function useClientBrandVars(host: string): Record<string, string> | null {
  const magazine = use(MagazineColorContext);
  const { resolvedScheme } = useTheme();
  const dark = magazine ? magazine.dark : resolvedScheme === "dark";

  const { accent } = bskyClientBrand(host);
  return useMemo(() => {
    if (!accent) return null;
    const palette = buildMagazinePalette({
      accent,
      accentForeground: null,
      background: null,
      fontBody: null,
      fontTitle: null,
      foreground: null,
    });
    if (!palette) return null;
    const vars = dark ? palette.dark : palette.light;
    return {
      // Radix step 8 is the *hovered* border and too loud at rest, so mix it
      // back toward the surface — matching how publication cards are tinted.
      "--client-border": `color-mix(in oklab, ${vars["--accent"]} 55%, ${vars["--paper"]})`,
      // Step 10 is the contrast-safe text step for the accent.
      "--client-ink": vars["--accent-ink"] ?? "",
    };
  }, [accent, dark]);
}

/** "View on Witchsky" — brand attribution for an embed we didn't draw. */
function ClientAttribution({ url, host }: { url: string; host: string }) {
  const brandVars = useClientBrandVars(host);
  const { name } = bskyClientBrand(host);
  const props = stylex.props(styles.attribution);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={props.className}
      style={{ ...props.style, ...brandVars }}
    >
      <Trans>View on {name}</Trans>
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
    borderColor: `var(--client-border, ${uiColor.border1})`,
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
    columnGap: gap.xs,
    alignItems: "baseline",
    color: uiColor.text1,
    display: "flex",
    flexWrap: "wrap",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  /** Client name beside the kind, painted in that client's brand color. */
  brand: {
    color: `var(--client-ink, ${uiColor.text1})`,
    // Separator drawn in CSS so it stays out of the translation catalog.
    // oxlint-disable-next-line @stylexjs/no-legacy-contextual-styles
    "::before": { content: "'· '" },
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
  /**
   * Sits directly under a post embed, which carries its own bottom margin —
   * so pull up into it rather than adding more space below the post.
   */
  attribution: {
    color: `var(--client-ink, ${uiColor.text1})`,
    display: "block",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: "0.06em",
    textDecoration: "none",
    textTransform: "uppercase",
    marginBottom: spacing["6"],
    marginTop: `calc(-1 * ${spacing["4"]})`,
  },
});
