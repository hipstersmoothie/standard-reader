"use client";

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
import type { ReactNode } from "react";

import { articleUrl, profileUrl, publicationUrl } from "#/lib/site/article-url";
import type { SiteArticle, SitePage } from "#/server/site.server";

/**
 * Where a post on a site goes: the article as Standard Reader renders it.
 *
 * Deliberately not the publisher's own canonical URL — a visitor who clicked a
 * headline here wants to read the piece, not to be handed off to a third site.
 * A plain anchor rather than a router link, because the reader is a different
 * deploy: Writer serves the site, Reader renders the article.
 */
export function SiteArticleLink({
  article,
  children,
  style,
}: {
  article: SiteArticle;
  children: ReactNode;
  style?: stylex.StyleXStyles;
}) {
  if (!article.rkey) {
    return <span {...stylex.props(style)}>{children}</span>;
  }
  return (
    <a
      href={articleUrl(article.did, article.rkey)}
      {...stylex.props(styles.bareLink, style)}
    >
      {children}
    </a>
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
  const href =
    page.kind === "publication" && page.rkey
      ? publicationUrl(page.did, page.rkey)
      : profileUrl(page.did);
  return (
    <footer {...stylex.props(styles.colophon)}>
      <a href={href} {...stylex.props(styles.colophonLink)}>
        Published with Standard Reader
      </a>
    </footer>
  );
}

/**
 * "Older posts" — the only control a site has, and a link rather than a button
 * so each page of the archive keeps its own address.
 */
export function SiteOlderPosts({
  href,
  style,
}: {
  href: string | null;
  style?: stylex.StyleXStyles;
}) {
  if (!href) return null;
  return (
    <div {...stylex.props(styles.loadMoreRow, style)}>
      <a href={href} {...stylex.props(styles.loadMore)}>
        Older posts
      </a>
    </div>
  );
}

/** Shown in place of the archive when there is nothing published yet. */
export function SiteEmpty({ style }: { style?: stylex.StyleXStyles }) {
  return (
    <p {...stylex.props(styles.empty, style)}>Nothing published here yet.</p>
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
    display: "inline-block",
    textDecoration: "none",
    borderColor: uiColor.border2,
    borderRadius: 0,
    borderStyle: "solid",
    borderWidth: 1,
    color: uiColor.text2,
    cursor: "pointer",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.wide,
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
