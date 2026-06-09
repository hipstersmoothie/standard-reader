"use client";

import type {
  ArticleDetail,
  ArticleExtras,
} from "#/integrations/tanstack-query/api-publication.functions";
import type { PublicationCard } from "#/integrations/tanstack-query/api-shapes";

import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { Flex } from "#/design-system/flex";
import { uiColor } from "#/design-system/theme/color.stylex";
import { gap } from "#/design-system/theme/semantic-spacing.stylex";
import { spacing } from "#/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "#/design-system/theme/typography.stylex";
import { parseInternalRoute } from "#/lib/internal-route";

import { MiniPubRow } from "./cards";
import { CommentsSection } from "./comments/comments-section";
import { articleCardReadingText } from "./content/extract-text";
import { documentLinkParams, readingMinutes } from "./format";
import { SectionHead } from "./primitives";
import { useArticleExtras } from "./use-article-extras";

const MEASURE = "80ch";

const styles = stylex.create({
  moreFrom: {
    boxSizing: "border-box",
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: MEASURE,
    paddingBottom: spacing["20"],
    paddingLeft: spacing["6"],
    paddingRight: spacing["6"],
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
  footGrow: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
});

function MoreFromRow({
  article,
  publicationName,
}: {
  article: ArticleExtras["moreFrom"][number];
  publicationName: string;
}) {
  const params = documentLinkParams(article.uri);
  const minutes = readingMinutes(articleCardReadingText(article));
  const body = (
    <Flex direction="column" gap="sm" style={styles.footGrow}>
      <span {...stylex.props(styles.moreTitle)}>{article.title}</span>
      <span {...stylex.props(styles.bylineMeta)}>
        {minutes == null
          ? publicationName
          : `${publicationName} · ${minutes} min`}
      </span>
    </Flex>
  );

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
  if (moreFrom.length === 0) return null;

  return (
    <div {...stylex.props(styles.moreFrom)}>
      <Flex direction="column">
        <SectionHead kicker={`More from ${pub.name}`} title="Keep reading" />
        <div>
          {moreFrom.map((doc) => (
            <MoreFromRow
              key={doc.uri}
              article={doc}
              publicationName={pub.name}
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
  if (readersAlsoFollow.length === 0) return null;

  return (
    <div {...stylex.props(styles.moreFrom)}>
      <Flex direction="column">
        <SectionHead kicker="Discover" title="You might follow" />
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

      {extras ? (
        <ReadersAlsoFollowSection
          readersAlsoFollow={extras.readersAlsoFollow}
        />
      ) : null}
    </>
  );
}
