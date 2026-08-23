"use client";

import { Trans } from "@lingui/react/macro";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
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

import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";
import { useFormatters } from "#/lib/use-formatters";

import type { SiteViewProps } from "./site-entry";
import { siteArticleImage, siteArticleKicker } from "./site-entry";
import {
  SiteArticleLink,
  SiteColophon,
  SiteEmpty,
  SiteLinks,
  SiteLoadMore,
} from "./site-shared";

const WIDE = "@media (min-width: 60rem)";
const MEDIUM = "@media (min-width: 44rem)";

/**
 * Broadsheet — the site as a newspaper front page.
 *
 * A centred masthead between rules, one lead story set large, and everything
 * else in a column index beneath it. The index is a real CSS multi-column flow
 * rather than a grid: entries are different lengths, and a newspaper's columns
 * balance them rather than leaving a grid full of ragged cells.
 */
export function SiteBroadsheet({
  page,
  articles,
  hasMore,
  loadingMore,
  onLoadMore,
}: SiteViewProps) {
  const formatters = useFormatters();
  const { masthead, config } = page;
  const [lead, ...rest] = articles;
  const tagline = config.tagline ?? masthead.description;

  return (
    <div {...stylex.props(styles.shell)}>
      <header {...stylex.props(styles.masthead)}>
        <div {...stylex.props(styles.dateline)}>
          <span>{masthead.handle ? `@${masthead.handle}` : null}</span>
          <span>
            {masthead.lastPublishedAt
              ? formatters.longDate(masthead.lastPublishedAt)
              : null}
          </span>
        </div>
        <h1 {...stylex.props(styles.title)}>{masthead.name}</h1>
        {tagline ? (
          <p dir="auto" {...stylex.props(styles.tagline)}>
            {tagline}
          </p>
        ) : null}
        <div {...stylex.props(styles.mastheadFoot)}>
          <span {...stylex.props(styles.mastheadMeta)}>
            <Trans>{masthead.documentCount} posts</Trans>
          </span>
          <SiteLinks links={config.links} />
        </div>
      </header>

      {articles.length === 0 ? (
        <SiteEmpty />
      ) : (
        <>
          {lead ? <BroadsheetLead page={page} article={lead} /> : null}
          {rest.length > 0 ? (
            <div {...stylex.props(styles.index)}>
              {rest.map((article) => (
                <BroadsheetEntry
                  key={article.uri}
                  page={page}
                  article={article}
                />
              ))}
            </div>
          ) : null}
        </>
      )}

      <SiteLoadMore
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={onLoadMore}
      />
      <SiteColophon page={page} />
    </div>
  );
}

function BroadsheetLead({
  page,
  article,
}: {
  page: SiteViewProps["page"];
  article: ArticleCard;
}) {
  const formatters = useFormatters();
  const image = siteArticleImage(article);
  const kicker = siteArticleKicker(page, article);

  return (
    <section {...stylex.props(styles.lead, !image && styles.leadNoMedia)}>
      {image ? (
        <SiteArticleLink article={article} style={styles.leadMedia}>
          <img
            src={image}
            alt=""
            loading="eager"
            {...stylex.props(styles.leadImage)}
          />
        </SiteArticleLink>
      ) : null}
      <div {...stylex.props(styles.leadBody)}>
        {kicker ? <span {...stylex.props(styles.kicker)}>{kicker}</span> : null}
        <SiteArticleLink article={article}>
          <h2 dir="auto" {...stylex.props(styles.leadHeadline)}>
            {article.title}
          </h2>
        </SiteArticleLink>
        {article.description ? (
          <p dir="auto" {...stylex.props(styles.leadDek)}>
            {article.description}
          </p>
        ) : null}
        <span {...stylex.props(styles.entryDate)}>
          {formatters.date(article.publishedAt)}
        </span>
      </div>
    </section>
  );
}

function BroadsheetEntry({
  page,
  article,
}: {
  page: SiteViewProps["page"];
  article: ArticleCard;
}) {
  const formatters = useFormatters();
  const kicker = siteArticleKicker(page, article);

  return (
    <article {...stylex.props(styles.entry)}>
      {kicker ? <span {...stylex.props(styles.kicker)}>{kicker}</span> : null}
      <SiteArticleLink article={article}>
        <h3 dir="auto" {...stylex.props(styles.entryHeadline)}>
          {article.title}
        </h3>
      </SiteArticleLink>
      {article.description ? (
        <p dir="auto" {...stylex.props(styles.entryDek)}>
          {article.description}
        </p>
      ) : null}
      <span {...stylex.props(styles.entryDate)}>
        {formatters.date(article.publishedAt)}
      </span>
    </article>
  );
}

const styles = stylex.create({
  shell: {
    boxSizing: "border-box",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    maxWidth: "76rem",
    paddingBottom: spacing["6"],
    paddingInlineEnd: { default: spacing["5"], [MEDIUM]: spacing["10"] },
    paddingInlineStart: { default: spacing["5"], [MEDIUM]: spacing["10"] },
    paddingTop: { default: spacing["8"], [MEDIUM]: spacing["12"] },
    width: "100%",
  },
  masthead: {
    borderBottomColor: uiColor.text2,
    borderBottomStyle: "solid",
    borderBottomWidth: 3,
    paddingBottom: spacing["4"],
    textAlign: "center",
  },
  dateline: {
    borderBottomColor: uiColor.border2,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    color: uiColor.text1,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: "0.68rem",
    justifyContent: "space-between",
    letterSpacing: tracking.wide,
    paddingBottom: spacing["2"],
    textTransform: "uppercase",
  },
  title: {
    color: uiColor.text2,
    fontFamily: fontFamily.title,
    fontSize: { default: "2.75rem", [MEDIUM]: "4rem", [WIDE]: "5.25rem" },
    fontWeight: fontWeight.bold,
    letterSpacing: tracking.tight,
    lineHeight: 0.95,
    marginBottom: spacing["0"],
    marginTop: spacing["5"],
    // A masthead is a single-line name, so it must keep the page's alignment
    // while still ordering its own characters correctly (see the profile hero).
    unicodeBidi: "isolate",
  },
  tagline: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    marginTop: spacing["3"],
    maxWidth: "48ch",
  },
  mastheadFoot: {
    alignItems: "center",
    columnGap: gap["4xl"],
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: spacing["5"],
    rowGap: gap.md,
  },
  mastheadMeta: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.68rem",
    letterSpacing: tracking.wide,
    textTransform: "uppercase",
  },
  lead: {
    alignItems: "start",
    columnGap: gap["6xl"],
    display: "grid",
    gridTemplateColumns: { default: "1fr", [MEDIUM]: "1.1fr 1fr" },
    paddingBottom: spacing["10"],
    paddingTop: spacing["8"],
    rowGap: gap["5xl"],
  },
  /**
   * No art: the lead is one column rather than a headline beside an empty half.
   * Capped well short of the page so the headline keeps a readable measure
   * instead of running the full width of the sheet.
   */
  leadNoMedia: {
    gridTemplateColumns: "1fr",
    maxWidth: "46rem",
  },
  leadMedia: {
    display: "block",
    overflow: "hidden",
  },
  leadImage: {
    aspectRatio: "4 / 3",
    display: "block",
    height: "auto",
    objectFit: "cover",
    width: "100%",
  },
  leadBody: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.lg,
  },
  leadHeadline: {
    color: uiColor.text2,
    fontFamily: fontFamily.title,
    fontSize: { default: "1.9rem", [MEDIUM]: "2.6rem" },
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: 1.05,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    textDecorationColor: "currentColor",
    textDecorationLine: { default: "none", ":hover": "underline" },
    textUnderlineOffset: "0.12em",
  },
  leadDek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    maxWidth: "62ch",
  },
  index: {
    // The rule between the lead and the index lives here rather than under the
    // lead: an art-less lead is held to a readable measure, and a rule that
    // stopped where its text did would read as a broken column, not a divider.
    borderTopColor: uiColor.border2,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    columnCount: { default: 1, [MEDIUM]: 2, [WIDE]: 3 },
    columnGap: gap["6xl"],
    columnRuleColor: uiColor.border1,
    columnRuleStyle: "solid",
    columnRuleWidth: 1,
    paddingTop: spacing["8"],
  },
  entry: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    breakInside: "avoid",
    display: "flow-root",
    marginBottom: spacing["6"],
    paddingBottom: spacing["5"],
  },
  kicker: {
    color: uiColor.text1,
    display: "block",
    fontFamily: fontFamily.sans,
    fontSize: "0.62rem",
    fontWeight: fontWeight.bold,
    letterSpacing: "0.14em",
    marginBottom: spacing["1.5"],
    textTransform: "uppercase",
  },
  entryHeadline: {
    color: uiColor.text2,
    fontFamily: fontFamily.title,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: 1.15,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    textDecorationColor: "currentColor",
    textDecorationLine: { default: "none", ":hover": "underline" },
    textUnderlineOffset: "0.12em",
  },
  entryDek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginBottom: spacing["0"],
    marginTop: spacing["2"],
  },
  entryDate: {
    color: uiColor.text1,
    display: "block",
    fontFamily: fontFamily.sans,
    fontSize: "0.66rem",
    letterSpacing: tracking.wide,
    marginTop: spacing["2.5"],
    textTransform: "uppercase",
  },
});
