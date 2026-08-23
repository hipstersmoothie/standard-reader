"use client";

import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
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
const WIDE = "@media (min-width: 64rem)";

/** How many posts lead the page before the rest becomes an index. */
const SELECTED_COUNT = 3;

/**
 * Marquee — an opening title, then selected work, then the index.
 *
 * The most site-like of the four: the first screen is the name and nothing
 * else, the way a portfolio or a studio page opens. What follows is a short
 * run of large rows, then everything else compressed into a list — so a long
 * archive stays browsable without diluting the opening.
 */
export function SiteMarquee({ page, articles, olderHref }: SiteViewProps) {
  const { masthead, config } = page;
  const tagline = config.tagline ?? masthead.description;
  const selected = articles.slice(0, SELECTED_COUNT);
  const archive = articles.slice(SELECTED_COUNT);

  return (
    <div {...stylex.props(styles.shell)}>
      <header {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.heroInner)}>
          {masthead.handle ? (
            <span {...stylex.props(styles.heroKicker)}>@{masthead.handle}</span>
          ) : null}
          <h1 {...stylex.props(styles.heroTitle)}>{masthead.name}</h1>
          {tagline ? (
            <p dir="auto" {...stylex.props(styles.heroTagline)}>
              {tagline}
            </p>
          ) : null}
          <SiteLinks links={config.links} style={styles.heroLinks} />
        </div>
      </header>

      <main {...stylex.props(styles.body)}>
        {articles.length === 0 ? (
          <SiteEmpty />
        ) : (
          <>
            <section>
              <h2 {...stylex.props(styles.sectionHead)}>Selected work</h2>
              <div {...stylex.props(styles.selected)}>
                {selected.map((article) => (
                  <MarqueeRow key={article.uri} page={page} article={article} />
                ))}
              </div>
            </section>

            {archive.length > 0 ? (
              <section {...stylex.props(styles.archiveSection)}>
                <h2 {...stylex.props(styles.sectionHead)}>Everything else</h2>
                <ul {...stylex.props(styles.archive)}>
                  {archive.map((article) => (
                    <MarqueeIndexRow key={article.uri} article={article} />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}

        <SiteOlderPosts href={olderHref} />
        <SiteColophon page={page} />
      </main>
    </div>
  );
}

function MarqueeRow({
  page,
  article,
}: {
  page: SiteViewProps["page"];
  article: SiteArticle;
}) {
  const image = siteArticleImage(article);
  const kicker = siteArticleKicker(page, article);

  return (
    <SiteArticleLink
      article={article}
      style={[styles.row, !image && styles.rowNoMedia]}
    >
      {image ? (
        <div {...stylex.props(styles.rowMedia)}>
          <img
            src={image}
            alt=""
            loading="lazy"
            {...stylex.props(styles.rowImage)}
          />
        </div>
      ) : null}
      <div {...stylex.props(styles.rowBody)}>
        <span {...stylex.props(styles.rowMeta)}>
          {kicker ? `${kicker} · ` : ""}
          {siteDate(article.publishedAt)}
        </span>
        <h3 dir="auto" {...stylex.props(styles.rowTitle)}>
          {article.title}
        </h3>
        {article.description ? (
          <p dir="auto" {...stylex.props(styles.rowDek)}>
            {article.description}
          </p>
        ) : null}
      </div>
    </SiteArticleLink>
  );
}

function MarqueeIndexRow({ article }: { article: SiteArticle }) {
  return (
    <li {...stylex.props(styles.archiveItem)}>
      <SiteArticleLink article={article} style={styles.archiveLink}>
        <span dir="auto" {...stylex.props(styles.archiveTitle)}>
          {article.title}
        </span>
        <span {...stylex.props(styles.archiveDate)}>
          {siteDate(article.publishedAt)}
        </span>
      </SiteArticleLink>
    </li>
  );
}

const styles = stylex.create({
  shell: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
  },
  hero: {
    alignItems: "center",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    boxSizing: "border-box",
    display: "flex",
    // Tall enough that the name is the whole first screen on a phone, without
    // pinning to `100dvh` — a hero the exact height of the viewport hides the
    // fact that there is anything below it.
    minHeight: { default: "62dvh", [MEDIUM]: "78dvh" },
    paddingBottom: spacing["16"],
    paddingInlineEnd: { default: spacing["6"], [MEDIUM]: spacing["12"] },
    paddingInlineStart: { default: spacing["6"], [MEDIUM]: spacing["12"] },
    paddingTop: spacing["16"],
  },
  heroInner: {
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    maxWidth: "68rem",
    width: "100%",
  },
  heroKicker: {
    color: uiColor.text1,
    display: "block",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    letterSpacing: "0.22em",
    marginBottom: spacing["6"],
    textTransform: "uppercase",
  },
  heroTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.title,
    fontSize: { default: "3rem", [MEDIUM]: "5rem", [WIDE]: "7rem" },
    fontWeight: fontWeight.bold,
    letterSpacing: "-0.03em",
    lineHeight: 0.92,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    unicodeBidi: "isolate",
  },
  heroTagline: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: { default: fontSize.lg, [MEDIUM]: "1.5rem" },
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["8"],
    maxWidth: "44ch",
  },
  heroLinks: {
    marginTop: spacing["10"],
  },
  body: {
    boxSizing: "border-box",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    maxWidth: "68rem",
    paddingBottom: spacing["8"],
    paddingInlineEnd: { default: spacing["6"], [MEDIUM]: spacing["12"] },
    paddingInlineStart: { default: spacing["6"], [MEDIUM]: spacing["12"] },
    paddingTop: spacing["16"],
    width: "100%",
  },
  sectionHead: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: "0.18em",
    marginBottom: spacing["8"],
    marginTop: spacing["0"],
    textTransform: "uppercase",
  },
  selected: {
    display: "flex",
    flexDirection: "column",
    rowGap: spacing["14"],
  },
  row: {
    alignItems: "center",
    columnGap: gap["6xl"],
    display: "grid",
    gridTemplateColumns: { default: "1fr", [MEDIUM]: "1fr 1fr" },
    rowGap: gap["5xl"],
  },
  /** Same as the broadsheet lead: one column, held to a readable measure. */
  rowNoMedia: {
    gridTemplateColumns: "1fr",
    maxWidth: "44rem",
  },
  rowMedia: {
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  rowImage: {
    aspectRatio: "16 / 10",
    display: "block",
    height: "auto",
    objectFit: "cover",
    width: "100%",
  },
  rowBody: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.lg,
  },
  rowMeta: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.68rem",
    letterSpacing: tracking.wide,
    textTransform: "uppercase",
  },
  rowTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.title,
    fontSize: { default: "1.7rem", [MEDIUM]: "2.2rem" },
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: 1.08,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    textDecorationColor: "currentColor",
    textDecorationLine: { default: "none", ":hover": "underline" },
    textUnderlineOffset: "0.12em",
  },
  rowDek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    maxWidth: "56ch",
  },
  archiveSection: {
    marginTop: spacing["20"],
  },
  archive: {
    listStyle: "none",
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    paddingInlineStart: spacing["0"],
  },
  archiveItem: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
  },
  archiveLink: {
    alignItems: "baseline",
    columnGap: gap["4xl"],
    display: "flex",
    justifyContent: "space-between",
    paddingBottom: spacing["4"],
    paddingTop: spacing["4"],
  },
  archiveTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.title,
    fontSize: fontSize.lg,
    lineHeight: 1.25,
    textDecorationColor: "currentColor",
    textDecorationLine: { default: "none", ":hover": "underline" },
    textUnderlineOffset: "0.12em",
  },
  archiveDate: {
    color: uiColor.text1,
    flexShrink: 0,
    fontFamily: fontFamily.sans,
    fontSize: "0.66rem",
    letterSpacing: tracking.wide,
    textTransform: "uppercase",
  },
});
