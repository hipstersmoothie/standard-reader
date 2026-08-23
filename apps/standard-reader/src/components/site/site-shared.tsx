"use client";

import { Trans } from "@lingui/react/macro";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { documentLinkParams } from "#/components/reader/format";
import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";
import type { SitePage } from "#/integrations/tanstack-query/api-site.functions";

/**
 * Where a post on a site goes: the article as Standard Reader renders it.
 *
 * Deliberately not the publisher's own canonical URL — a visitor who clicked a
 * headline on this site wants to read it, not to be handed off to a third
 * site — and deliberately a router `Link`, so the whole archive is prefetched
 * and navigated client-side like the rest of the app.
 */
export function SiteArticleLink({
  article,
  children,
  style,
}: {
  article: ArticleCard;
  children: ReactNode;
  style?: stylex.StyleXStyles;
}) {
  const params = documentLinkParams(article.uri);
  if (!params) {
    return <span {...stylex.props(style)}>{children}</span>;
  }
  return (
    <Link
      to="/a/$did/$rkey"
      params={params}
      {...stylex.props(styles.bareLink, style)}
    >
      {children}
    </Link>
  );
}

/** The owner's other homes on the web, as stated on their site record. */
export function SiteLinks({
  links,
  style,
}: {
  links: SitePage["config"]["links"];
  style?: stylex.StyleXStyles;
}) {
  if (links.length === 0) return null;
  return (
    <nav {...stylex.props(styles.links, style)}>
      {links.map((link) => (
        <a
          key={`${link.label}:${link.url}`}
          href={link.url}
          rel="noopener noreferrer me"
          {...stylex.props(styles.link)}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}

/**
 * The one piece of Standard Reader left on the page, and only when the owner
 * kept it: a line saying where the site is published from. Small on purpose —
 * a site is theirs, and this is a colophon, not a banner.
 */
export function SiteColophon({ page }: { page: SitePage }) {
  if (!page.config.showStandardReaderLink) return null;
  return (
    <footer {...stylex.props(styles.colophon)}>
      {page.kind === "publication" && page.rkey ? (
        <Link
          to="/p/$did/$rkey"
          params={{ did: page.did, rkey: page.rkey }}
          {...stylex.props(styles.colophonLink)}
        >
          <Trans>Published with Standard Reader</Trans>
        </Link>
      ) : (
        <Link
          to="/u/$did"
          params={{ did: page.did }}
          {...stylex.props(styles.colophonLink)}
        >
          <Trans>Published with Standard Reader</Trans>
        </Link>
      )}
    </footer>
  );
}

/** "Older posts" — the only control a site has. */
export function SiteLoadMore({
  hasMore,
  loading,
  onLoadMore,
  style,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  style?: stylex.StyleXStyles;
}) {
  if (!hasMore) return null;
  return (
    <div {...stylex.props(styles.loadMoreRow, style)}>
      <button
        type="button"
        disabled={loading}
        onClick={onLoadMore}
        {...stylex.props(styles.loadMore)}
      >
        {loading ? <Trans>Loading…</Trans> : <Trans>Older posts</Trans>}
      </button>
    </div>
  );
}

/** Shown in place of the archive when there is nothing published yet. */
export function SiteEmpty({ style }: { style?: stylex.StyleXStyles }) {
  return (
    <p {...stylex.props(styles.empty, style)}>
      <Trans>Nothing published here yet.</Trans>
    </p>
  );
}

const styles = stylex.create({
  bareLink: {
    textDecoration: "none",
    color: "inherit",
  },
  links: {
    alignItems: "center",
    columnGap: gap["4xl"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: gap.md,
  },
  link: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.wide,
    textDecorationColor: {
      default: uiColor.border2,
      ":hover": "currentColor",
    },
    textDecorationLine: "underline",
    textTransform: "uppercase",
    textUnderlineOffset: "0.3em",
  },
  colophon: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: spacing["16"],
    paddingBottom: spacing["10"],
    paddingTop: spacing["6"],
    textAlign: "center",
  },
  colophonLink: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.7rem",
    letterSpacing: tracking.wide,
    textDecorationColor: {
      default: "transparent",
      ":hover": "currentColor",
    },
    textDecorationLine: "underline",
    textTransform: "uppercase",
    textUnderlineOffset: "0.3em",
  },
  loadMoreRow: {
    display: "flex",
    justifyContent: "center",
    paddingBottom: spacing["4"],
    paddingTop: spacing["10"],
  },
  loadMore: {
    borderColor: uiColor.border2,
    borderRadius: 0,
    borderStyle: "solid",
    borderWidth: 1,
    color: uiColor.text2,
    cursor: { default: "pointer", ":disabled": "default" },
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.wide,
    opacity: { default: 1, ":disabled": 0.6 },
    backgroundColor: { default: "transparent", ":hover": uiColor.component1 },
    paddingBottom: spacing["2.5"],
    paddingInlineEnd: spacing["6"],
    paddingInlineStart: spacing["6"],
    paddingTop: spacing["2.5"],
    textTransform: "uppercase",
  },
  empty: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    paddingBottom: spacing["12"],
    paddingTop: spacing["12"],
    textAlign: "center",
  },
});
