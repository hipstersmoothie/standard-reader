"use client";

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { PublicationNameLink } from "#/components/reader/publication-name-link";
import type {
  ArticleDetail,
  ArticleExtras,
} from "#/integrations/tanstack-query/api-publication.functions";
import type { PublicationCard } from "#/integrations/tanstack-query/api-shapes";
import { parseInternalRoute } from "#/lib/internal-route";
import { useOpenLinks } from "#/lib/use-open-links";
import { useReadingTypography } from "#/lib/use-reading-typography";

import { MiniPubRow } from "./cards";
import { CommentsSection } from "./comments/comments-section";
import { articleMeasureStyle } from "./content/body-styles";
import { articleCardReadingText } from "./content/extract-text";
import { documentLinkParams, readingMinutes } from "./format";
import { SectionHead } from "./primitives";
import { useArticleExtras } from "./use-article-extras";

const styles = stylex.create({
  moreFrom: {
    boxSizing: "border-box",
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    // Trimmed inside a publication page card, which supplies its own margin.
    paddingBottom: `var(--pub-page-content-bottom, ${spacing["20"]})`,
    paddingInlineStart: spacing["6"],
    paddingInlineEnd: spacing["6"],
    width: "100%",
  },
  moreRow: {
    textDecoration: "none",
    alignItems: "baseline",
    color: "inherit",
    columnGap: gap.lg,
    display: "flex",
    rowGap: gap.lg,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["3"],
    paddingTop: spacing["3"],
  },
  moreTitle: {
    // Single-line NAME/TITLE in a UI row: isolate for correct character
    // ordering, but let alignment follow the surrounding UI (right under
    // RTL). `dir="auto"` here would left-align it and break the column.
    unicodeBidi: "isolate",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
  },
  bylineMeta: {
    color: uiColor.text2,
    fontSize: fontSize.sm,
  },
  bidiIsolate: {
    unicodeBidi: "isolate",
  },
  connectionLabel: {
    color: uiColor.text2,
    fontSize: fontSize.sm,
    fontStyle: "italic",
  },
  footGrow: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
});

function mergeRelatedReading(
  i18n: I18n,
  marginConnections: ArticleExtras["marginConnections"],
  relatedArticles: ArticleExtras["relatedArticles"],
): Array<{
  article: ArticleExtras["relatedArticles"][number];
  subtitle?: string;
}> {
  const seen = new Set<string>();
  const merged: Array<{
    article: ArticleExtras["relatedArticles"][number];
    subtitle?: string;
  }> = [];

  for (const item of marginConnections) {
    if (seen.has(item.article.uri)) continue;
    seen.add(item.article.uri);
    const connectionLabel = item.connectionLabel;
    merged.push({
      article: item.article,
      subtitle: i18n._(msg`${connectionLabel} via Semble`),
    });
  }

  for (const article of relatedArticles) {
    if (seen.has(article.uri)) continue;
    seen.add(article.uri);
    merged.push({ article });
  }

  return merged;
}

function MoreFromRow({
  article,
  publicationName,
  publicationUri,
  subtitle,
}: {
  article: ArticleExtras["moreFrom"][number];
  publicationName: string;
  publicationUri?: string | null;
  subtitle?: string;
}) {
  const { openExternally } = useOpenLinks();
  const params = documentLinkParams(article.uri);
  const minutes = readingMinutes(articleCardReadingText(article));
  const body = (
    <Flex direction="column" gap="sm" style={styles.footGrow}>
      <span {...stylex.props(styles.moreTitle)}>{article.title}</span>
      <span {...stylex.props(styles.bylineMeta)}>
        <PublicationNameLink publicationUri={publicationUri} nested>
          {publicationName}
        </PublicationNameLink>
        {minutes == null ? null : (
          <>
            <span aria-hidden> · </span>
            {/* Digits + a localized unit: isolate so the bidi algorithm can't
                interleave it with the publication name under an RTL UI. */}
            <span {...stylex.props(styles.bidiIsolate)}>
              <Trans>{minutes} min</Trans>
            </span>
          </>
        )}
      </span>
      {subtitle ? (
        <span {...stylex.props(styles.connectionLabel)}>{subtitle}</span>
      ) : null}
    </Flex>
  );

  // "Open on original site" preference: skip the in-app reader entirely.
  if (openExternally && article.canonicalUrl) {
    return (
      <a
        href={article.canonicalUrl}
        target="_blank"
        rel="noreferrer"
        {...stylex.props(styles.moreRow)}
      >
        {body}
      </a>
    );
  }

  if (params && article.hasRenderableBody) {
    return (
      <Link
        to="/a/$did/$rkey"
        params={params}
        {...stylex.props(styles.moreRow)}
      >
        {body}
      </Link>
    );
  }

  const href = article.canonicalUrl;
  if (!href) {
    if (params) {
      return (
        <Link
          to="/a/$did/$rkey"
          params={params}
          {...stylex.props(styles.moreRow)}
        >
          {body}
        </Link>
      );
    }
    return null;
  }
  const internal = parseInternalRoute(href);
  if (internal?.params) {
    return (
      <Link
        to={internal.to}
        params={internal.params}
        {...stylex.props(styles.moreRow)}
      >
        {body}
      </Link>
    );
  }
  if (internal) {
    return (
      <Link to={internal.to} {...stylex.props(styles.moreRow)}>
        {body}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      {...stylex.props(styles.moreRow)}
    >
      {body}
    </a>
  );
}

function MoreFromSection({
  pub,
  moreFrom,
}: {
  pub: PublicationCard;
  moreFrom: ArticleExtras["moreFrom"];
}) {
  const { t } = useLingui();
  const { preference } = useReadingTypography();
  if (moreFrom.length === 0) return null;

  return (
    <div {...stylex.props(styles.moreFrom, articleMeasureStyle(preference))}>
      <Flex direction="column">
        <SectionHead
          kicker={
            <Trans>
              More from{" "}
              <PublicationNameLink publicationUri={pub.uri}>
                {pub.name}
              </PublicationNameLink>
            </Trans>
          }
          title={t`Keep reading`}
        />
        <div>
          {moreFrom.map((doc) => (
            <MoreFromRow
              key={doc.uri}
              article={doc}
              publicationName={pub.name}
              publicationUri={pub.uri}
            />
          ))}
        </div>
      </Flex>
    </div>
  );
}

function RelatedArticlesSection({
  relatedArticles,
  marginConnections,
}: {
  relatedArticles: ArticleExtras["relatedArticles"];
  marginConnections: ArticleExtras["marginConnections"];
}) {
  const { t, i18n } = useLingui();
  const { preference } = useReadingTypography();
  const items = mergeRelatedReading(i18n, marginConnections, relatedArticles);
  if (items.length === 0) return null;

  return (
    <div {...stylex.props(styles.moreFrom, articleMeasureStyle(preference))}>
      <Flex direction="column">
        <SectionHead
          kicker={t`Across the network`}
          title={t`Related reading`}
        />
        <div>
          {items.map((item) => (
            <MoreFromRow
              key={item.article.uri}
              article={item.article}
              publicationName={
                item.article.publicationName?.trim() || t`Publication`
              }
              publicationUri={item.article.publicationUri}
              subtitle={item.subtitle}
            />
          ))}
        </div>
      </Flex>
    </div>
  );
}

function CitedInSection({ citedIn }: { citedIn: ArticleExtras["citedIn"] }) {
  const { t } = useLingui();
  const { preference } = useReadingTypography();
  if (citedIn.length === 0) return null;

  return (
    <div {...stylex.props(styles.moreFrom, articleMeasureStyle(preference))}>
      <Flex direction="column">
        <SectionHead kicker={t`Across the network`} title={t`Cited in`} />
        <div>
          {citedIn.map((doc) => (
            <MoreFromRow
              key={doc.uri}
              article={doc}
              publicationName={doc.publicationName?.trim() || t`Publication`}
              publicationUri={doc.publicationUri}
            />
          ))}
        </div>
      </Flex>
    </div>
  );
}

function ReadersAlsoFollowSection({
  readersAlsoFollow,
}: {
  readersAlsoFollow: ArticleExtras["readersAlsoFollow"];
}) {
  const { t } = useLingui();
  const { preference } = useReadingTypography();
  if (readersAlsoFollow.length === 0) return null;

  return (
    <div {...stylex.props(styles.moreFrom, articleMeasureStyle(preference))}>
      <Flex direction="column">
        <SectionHead kicker={t`Discover`} title={t`Worth subscribing to`} />
        <div>
          {readersAlsoFollow.map((suggestedPub, i, pubs) => (
            <MiniPubRow
              key={suggestedPub.uri}
              pub={suggestedPub}
              isLast={i === pubs.length - 1}
            />
          ))}
        </div>
      </Flex>
    </div>
  );
}

export function ArticleBelowFold({
  article,
  showComments,
}: {
  article: ArticleDetail;
  showComments: boolean;
}) {
  const { data: extras } = useArticleExtras(article.uri);
  const pub = article.publication;

  return (
    <>
      {pub && extras ? (
        <MoreFromSection pub={pub} moreFrom={extras.moreFrom} />
      ) : null}

      {showComments ? <CommentsSection documentUri={article.uri} /> : null}

      {extras ? <CitedInSection citedIn={extras.citedIn} /> : null}

      {extras ? (
        <RelatedArticlesSection
          relatedArticles={extras.relatedArticles}
          marginConnections={extras.marginConnections}
        />
      ) : null}

      {extras ? (
        <ReadersAlsoFollowSection
          readersAlsoFollow={extras.readersAlsoFollow}
        />
      ) : null}
    </>
  );
}
