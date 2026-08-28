"use client";

import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
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

import { siteDate } from "#/lib/site/format";
import type { SiteArticle } from "#/server/site.server";

import type { SiteViewProps } from "./site-entry";
import { siteArticleImage, siteArticleKicker } from "./site-entry";
import {
  SiteArticleLink,
  SiteColophon,
  SiteEmpty,
  SiteLinks,
  SiteOlderPosts,
} from "./site-shared";

const MEDIUM = "@media (min-width: 44rem)";

/**
 * Gallery — the work first, the words after.
 *
 * A grid of covers at a fixed portrait ratio, so the wall reads evenly however
 * ragged the source images are. Posts with no cover are not dropped and not
 * left as holes: they become typographic tiles set in the site's accent, which
 * is what keeps a mixed archive looking deliberate rather than half-loaded.
 */
export function SiteGallery({ page, articles, olderHref }: SiteViewProps) {
  const { masthead, config } = page;
  const tagline = config.tagline ?? masthead.description;

  return (
    <div {...stylex.props(styles.shell)}>
      <header {...stylex.props(styles.masthead)}>
        <div {...stylex.props(styles.identity)}>
          {masthead.avatarUrl ? (
            <img
              src={masthead.avatarUrl}
              alt=""
              {...stylex.props(styles.avatar)}
            />
          ) : null}
          <div>
            <h1 {...stylex.props(styles.title)}>{masthead.name}</h1>
            <p {...stylex.props(styles.meta)}>
              {masthead.handle ? <span>@{masthead.handle}</span> : null}
              <span>{`${masthead.documentCount} posts`}</span>
            </p>
          </div>
        </div>
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
        <div {...stylex.props(styles.grid)}>
          {articles.map((article) => (
            <GalleryTile key={article.uri} page={page} article={article} />
          ))}
        </div>
      )}

      <SiteOlderPosts href={olderHref} />
      <SiteColophon page={page} />
    </div>
  );
}

function GalleryTile({
  page,
  article,
}: {
  page: SiteViewProps["page"];
  article: SiteArticle;
}) {
  const image = siteArticleImage(article);
  const kicker = siteArticleKicker(page, article);

  return (
    <SiteArticleLink article={article} style={styles.tile}>
      <div {...stylex.props(styles.cover, !image && styles.coverBlank)}>
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            {...stylex.props(styles.coverImage)}
          />
        ) : (
          <span dir="auto" {...stylex.props(styles.coverText)}>
            {article.title}
          </span>
        )}
      </div>
      <div {...stylex.props(styles.caption)}>
        {kicker ? <span {...stylex.props(styles.kicker)}>{kicker}</span> : null}
        {/* A blank tile already *is* the title, set large. Repeating it in the
            caption underneath reads as a rendering mistake. */}
        {image ? (
          <h2 dir="auto" {...stylex.props(styles.tileTitle)}>
            {article.title}
          </h2>
        ) : null}
        <span {...stylex.props(styles.tileDate)}>
          {siteDate(article.publishedAt)}
        </span>
      </div>
    </SiteArticleLink>
  );
}

const styles = stylex.create({
  shell: {
    boxSizing: "border-box",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    maxWidth: "82rem",
    paddingBottom: spacing["8"],
    paddingInlineEnd: { default: spacing["5"], [MEDIUM]: spacing["10"] },
    paddingInlineStart: { default: spacing["5"], [MEDIUM]: spacing["10"] },
    paddingTop: { default: spacing["8"], [MEDIUM]: spacing["16"] },
    width: "100%",
  },
  masthead: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["8"],
  },
  identity: {
    alignItems: "center",
    columnGap: gap["4xl"],
    display: "flex",
  },
  avatar: {
    borderRadius: radius.full,
    flexShrink: 0,
    height: boxSize["5xl"],
    objectFit: "cover",
    width: boxSize["5xl"],
  },
  title: {
    color: uiColor.text2,
    fontFamily: fontFamily.title,
    fontSize: { default: "1.75rem", [MEDIUM]: "2.5rem" },
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: 1.05,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    unicodeBidi: "isolate",
  },
  meta: {
    color: uiColor.text1,
    columnGap: gap["3xl"],
    display: "flex",
    flexWrap: "wrap",
    fontFamily: fontFamily.sans,
    fontSize: "0.7rem",
    letterSpacing: tracking.wide,
    marginBottom: spacing["0"],
    marginTop: spacing["1.5"],
    rowGap: gap.xs,
    textTransform: "uppercase",
  },
  tagline: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    marginBottom: spacing["0"],
    marginTop: spacing["5"],
    maxWidth: "56ch",
  },
  links: {
    marginTop: spacing["5"],
  },
  grid: {
    columnGap: gap["5xl"],
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(13rem, 1fr))",
    paddingTop: spacing["10"],
    rowGap: spacing["12"],
  },
  tile: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap["3xl"],
  },
  cover: {
    backgroundColor: uiColor.component1,
    // Portrait, so covers read as a shelf rather than a contact sheet.
    aspectRatio: "3 / 4",
    borderRadius: radius.sm,
    overflow: "hidden",
    position: "relative",
  },
  coverBlank: {
    alignItems: "center",
    backgroundColor: primaryColor.component1,
    display: "flex",
    justifyContent: "center",
    paddingInlineEnd: spacing["5"],
    paddingInlineStart: spacing["5"],
  },
  coverImage: {
    display: "block",
    height: "100%",
    objectFit: "cover",
    transform: { default: "scale(1)", ":hover": "scale(1.03)" },
    transitionDuration: animationDuration.default,
    transitionProperty: "transform",
    transitionTimingFunction: "ease-out",
    width: "100%",
  },
  coverText: {
    color: primaryColor.text2,
    fontFamily: fontFamily.title,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: 1.15,
    textAlign: "center",
  },
  caption: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.xs,
  },
  kicker: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.62rem",
    fontWeight: fontWeight.bold,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  tileTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.title,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    lineHeight: 1.25,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  tileDate: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.66rem",
    letterSpacing: tracking.wide,
    textTransform: "uppercase",
  },
});
