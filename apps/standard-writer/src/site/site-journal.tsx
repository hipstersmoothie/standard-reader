"use client";

import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  size as boxSize,
  gap,
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

import { siteLongDate } from "#/lib/site/format";

import type { SiteViewProps } from "./site-entry";
import { siteArticleKicker } from "./site-entry";
import {
  SiteArticleLink,
  SiteColophon,
  SiteEmpty,
  SiteLinks,
  SiteOlderPosts,
} from "./site-shared";

const MEDIUM = "@media (min-width: 44rem)";

/**
 * Journal — one column, dated entries, and room to breathe.
 *
 * No images and no rules between posts: the space *is* the separator. The date
 * leads each entry rather than trailing it, so the page scans as a run of days
 * rather than a list of links.
 */
export function SiteJournal({ page, articles, olderHref }: SiteViewProps) {
  const { masthead, config } = page;
  const tagline = config.tagline ?? masthead.description;

  return (
    <div {...stylex.props(styles.shell)}>
      <header {...stylex.props(styles.masthead)}>
        {masthead.avatarUrl ? (
          <img
            src={masthead.avatarUrl}
            alt=""
            {...stylex.props(styles.avatar)}
          />
        ) : null}
        <h1 {...stylex.props(styles.title)}>{masthead.name}</h1>
        {masthead.handle ? (
          <p {...stylex.props(styles.handle)}>@{masthead.handle}</p>
        ) : null}
        {tagline ? (
          <p dir="auto" {...stylex.props(styles.tagline)}>
            {tagline}
          </p>
        ) : null}
        <SiteLinks links={config.links} style={styles.links} />
      </header>

      {articles.length === 0 ? (
        <SiteEmpty />
      ) : (
        <div {...stylex.props(styles.entries)}>
          {articles.map((article) => {
            const kicker = siteArticleKicker(page, article);
            return (
              <article key={article.uri} {...stylex.props(styles.entry)}>
                <div {...stylex.props(styles.entryMeta)}>
                  <time dateTime={article.publishedAt}>
                    {siteLongDate(article.publishedAt)}
                  </time>
                  {kicker ? <span>{kicker}</span> : null}
                </div>
                <SiteArticleLink article={article}>
                  <h2 dir="auto" {...stylex.props(styles.entryTitle)}>
                    {article.title}
                  </h2>
                </SiteArticleLink>
                {article.description ? (
                  <p dir="auto" {...stylex.props(styles.entryBody)}>
                    {article.description}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <SiteOlderPosts href={olderHref} />
      <SiteColophon page={page} />
    </div>
  );
}

const styles = stylex.create({
  shell: {
    boxSizing: "border-box",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    maxWidth: "40rem",
    paddingBottom: spacing["8"],
    paddingInlineEnd: spacing["6"],
    paddingInlineStart: spacing["6"],
    paddingTop: { default: spacing["12"], [MEDIUM]: spacing["24"] },
    width: "100%",
  },
  masthead: {
    paddingBottom: spacing["10"],
  },
  avatar: {
    borderRadius: radius.full,
    display: "block",
    height: boxSize["4xl"],
    marginBottom: spacing["5"],
    objectFit: "cover",
    width: boxSize["4xl"],
  },
  title: {
    color: uiColor.text2,
    fontFamily: fontFamily.title,
    fontSize: { default: "1.9rem", [MEDIUM]: "2.25rem" },
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: 1.1,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    unicodeBidi: "isolate",
  },
  handle: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["1.5"],
  },
  tagline: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontStyle: "italic",
    lineHeight: lineHeight.base,
    marginBottom: spacing["0"],
    marginTop: spacing["5"],
    maxWidth: "46ch",
  },
  links: {
    marginTop: spacing["6"],
  },
  entries: {
    display: "flex",
    flexDirection: "column",
    // The whole point of this style: entries are separated by space, not rules.
    rowGap: spacing["16"],
  },
  entry: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.lg,
  },
  entryMeta: {
    color: uiColor.text1,
    columnGap: gap["4xl"],
    display: "flex",
    flexWrap: "wrap",
    fontFamily: fontFamily.sans,
    fontSize: "0.68rem",
    letterSpacing: tracking.wide,
    rowGap: gap.xs,
    textTransform: "uppercase",
  },
  entryTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.title,
    fontSize: { default: fontSize.xl, [MEDIUM]: "1.6rem" },
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: 1.2,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    textDecorationColor: "currentColor",
    textDecorationLine: { default: "none", ":hover": "underline" },
    textUnderlineOffset: "0.14em",
  },
  entryBody: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    lineHeight: lineHeight.lg,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
});
