"use client";

import { Trans } from "@lingui/react/macro";
import { Skeleton } from "@standard-reader/design-system/skeleton";
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
import { use } from "react";
import { useHover } from "react-aria";

import { publicationLinkParams } from "#/components/reader/format";
import { PublicationAvatar } from "#/components/reader/primitives";
import type { PublicationEmbedMeta } from "#/integrations/tanstack-query/api-publication.functions";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { buildMagazinePalette } from "#/lib/collections/radix-theme";
import type { CollectionTheme } from "#/lib/collections/theme";
import type { LeafletStandardSitePublicationBlock } from "#/lib/leaflet/types";
import { useTheme } from "#/lib/use-theme";
import { MagazineColorContext } from "#/magazine/context";

/**
 * Renders a `pub.leaflet.blocks.standardSitePublication` embed: a card linking
 * to the referenced Standard publication with its icon, name, description, and
 * author byline — the same information Leaflet shows.
 *
 * When the block opts into the publication's theme (the default), the card is
 * painted with that publication's `basicTheme`. Rather than reuse the raw theme
 * colors — which would break down in the reader's other color scheme — we run
 * the accent + background through the same Radix scale generator the magazine
 * uses (`buildMagazinePalette`), which produces properly contrasted light AND
 * dark palettes with a11y fallbacks, then pick the one matching the active
 * scheme.
 */
export function LeafletStandardSitePublicationBlockView({
  block,
}: {
  block: LeafletStandardSitePublicationBlock;
}) {
  const uri = block.uri?.trim();
  // Leaflet's editor defaults `showPublicationTheme` to on; only an explicit
  // `false` disables the publication's theme for this embed.
  const applyTheme = block.showPublicationTheme !== false;

  const magazine = use(MagazineColorContext);
  const { resolvedScheme } = useTheme();
  const dark = magazine ? magazine.dark : resolvedScheme === "dark";

  // react-aria's useHover drives the subtle background darken on pointer hover
  // (and correctly ignores hover from touch, unlike CSS `:hover`).
  const { hoverProps, isHovered } = useHover({});

  const { data: meta, isLoading } = useQuery({
    ...publicationApi.getPublicationEmbedMetaQueryOptions(uri ?? ""),
    enabled: Boolean(uri),
  });

  if (!uri) return null;

  if (!meta) {
    if (isLoading) return <PublicationCardSkeleton />;
    return (
      <p {...stylex.props(styles.notFound)}>
        <Trans>Publication not found.</Trans>
      </p>
    );
  }

  const themeVars = applyTheme ? publicationThemeVars(meta, dark) : null;
  const linkParams = publicationLinkParams(uri);
  const author =
    meta.ownerDisplayName ?? (meta.ownerHandle ? `@${meta.ownerHandle}` : null);

  const inner = (
    <>
      <PublicationAvatar
        pub={{
          name: meta.name,
          iconUrl: meta.iconUrl,
          ownerAvatarUrl: meta.ownerAvatarUrl,
        }}
        size="lg"
        style={styles.avatar}
      />
      <div {...stylex.props(styles.meta)}>
        <p {...stylex.props(styles.name)}>{meta.name}</p>
        {meta.description ? (
          <p {...stylex.props(styles.description)}>{meta.description}</p>
        ) : null}
        {author ? <p {...stylex.props(styles.byline)}>{author}</p> : null}
      </div>
    </>
  );

  const cardStyle = stylex.props(styles.card, isHovered && styles.cardHovered);

  if (linkParams) {
    return (
      <Link
        to="/p/$did/$rkey"
        params={linkParams}
        {...hoverProps}
        className={cardStyle.className}
        style={{ ...cardStyle.style, ...themeVars }}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div
      {...hoverProps}
      className={cardStyle.className}
      style={{ ...cardStyle.style, ...themeVars }}
    >
      {inner}
    </div>
  );
}

/**
 * Card-scoped CSS variables derived from the publication's theme. Returns null
 * when the theme carries no accent (nothing to generate a scale from), so the
 * card falls back to the reader's own design-system tokens.
 */
function publicationThemeVars(
  meta: PublicationEmbedMeta,
  dark: boolean,
): Record<string, string> | null {
  const theme: CollectionTheme = {
    background: meta.themeBackground,
    foreground: meta.themeForeground,
    accent: meta.themeAccent,
    accentForeground: meta.themeAccentForeground,
    fontTitle: null,
    fontBody: null,
  };
  const palette = buildMagazinePalette(theme);
  if (!palette) return null;
  const vars = dark ? palette.dark : palette.light;
  return {
    "--pub-card-bg": vars["--paper"],
    // Slightly darker/sunk surface for the hover state.
    "--pub-card-bg-hover": vars["--paper-sunk"],
    // Tint the border with the publication's accent, but softened toward the
    // paper so it reads as belonging to the publication without shouting —
    // Radix's exposed accent step (8) is its *hovered* border and too loud at
    // rest, so mix it back toward the background.
    "--pub-card-border": `color-mix(in oklab, ${vars["--accent"]} 40%, ${vars["--paper"]})`,
    "--pub-card-title": vars["--accent-ink"],
    "--pub-card-text": vars["--ink"],
    "--pub-card-muted": vars["--ink-soft"],
  };
}

function PublicationCardSkeleton() {
  return (
    <div {...stylex.props(styles.card)} aria-hidden>
      <Skeleton variant="circle" size="md" style={styles.avatar} />
      <div {...stylex.props(styles.meta)}>
        <Skeleton variant="rectangle" height="1.1rem" width="45%" />
        <Skeleton variant="rectangle" height="0.8rem" width="100%" />
        <Skeleton variant="rectangle" height="0.8rem" width="35%" />
      </div>
    </div>
  );
}

const styles = stylex.create({
  card: {
    alignItems: "flex-start",
    backgroundColor: `var(--pub-card-bg, ${uiColor.component1})`,
    borderColor: `var(--pub-card-border, ${uiColor.border1})`,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    columnGap: gap.md,
    cornerShape: "squircle",
    display: "flex",
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    padding: spacing["4"],
    textDecoration: "none",
    transitionDuration: animationDuration.default,
    transitionProperty: "background-color",
    transitionTimingFunction: "ease",
  },
  cardHovered: {
    backgroundColor: `var(--pub-card-bg-hover, ${uiColor.component2})`,
  },
  avatar: {
    flexShrink: 0,
  },
  meta: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
    rowGap: spacing["1"],
  },
  name: {
    color: `var(--pub-card-title, ${primaryColor.text2})`,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  description: {
    color: `var(--pub-card-text, ${uiColor.text1})`,
    display: "-webkit-box",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    overflow: "hidden",
    // eslint-disable-next-line @stylexjs/valid-styles
    WebkitBoxOrient: "vertical",
    // eslint-disable-next-line @stylexjs/valid-styles
    WebkitLineClamp: 3,
  },
  byline: {
    color: `var(--pub-card-muted, ${uiColor.text1})`,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  notFound: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
  },
});
