import * as stylex from "@stylexjs/stylex";
import { formatRelativeTime, initials } from "#/components/reader/format";
import { Avatar } from "#/design-system/avatar";
import { Flex } from "#/design-system/flex";
import { IconButton } from "#/design-system/icon-button";
import { Skeleton } from "#/design-system/skeleton";
import { Tab, TabList, TabPanel, Tabs } from "#/design-system/tabs";
import { primaryColor, uiColor } from "#/design-system/theme/color.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import { spacing } from "#/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "#/design-system/theme/typography.stylex";
import { Text } from "#/design-system/typography/text";
import { MessageCircle, X } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  ExtensionDiscussionArticle,
  ExtensionDiscussionComment,
  ExtensionDiscussionResponse,
} from "../lib/types";

import { sendMessage } from "../lib/messaging";

const tabListNoBorder = stylex.create({
  list: {
    borderBottomStyle: "none",
    borderBottomWidth: 0,
  },
});

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: "1",
    flexShrink: "1",
    minHeight: 0,
    width: "100%",
  },
  tabsFrame: {
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: "1",
    flexShrink: "1",
    minHeight: 0,
    width: "100%",
  },
  tabBar: {
    alignItems: "stretch",
    boxSizing: "border-box",
    flexShrink: 0,
    borderBottomColor: uiColor.border2,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    width: "100%",
  },
  tabList: {
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    flexWrap: "nowrap",
    minWidth: 0,
    overflowX: "auto",
    overflowY: "hidden",
    paddingLeft: horizontalSpace.lg,
  },
  tab: {
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  closeWrap: {
    paddingInline: horizontalSpace.md,
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    flexShrink: 0,
  },
  panelWrap: {
    boxSizing: "border-box",
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    minHeight: 0,
    overflowY: "auto",
    width: "100%",
  },
  panelArticles: {
    paddingTop: verticalSpace.lg,
  },
  panelDiscussions: {
    paddingBlock: verticalSpace.lg,
    paddingInline: horizontalSpace.lg,
  },
  empty: {
    paddingBlock: verticalSpace["4xl"],
    paddingInline: horizontalSpace.lg,
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontStyle: "italic",
    textAlign: "center",
  },
  skeletonWrapArticles: {
    paddingTop: verticalSpace.lg,
  },
  skeletonWrapDiscussions: {
    paddingBlock: verticalSpace.lg,
    paddingInline: horizontalSpace.lg,
  },
  skeletonLineTight: {
    marginBottom: verticalSpace.xs,
  },
  skeletonLineBody: {
    marginBottom: verticalSpace.sm,
  },
  skeletonLineFooter: {
    marginTop: verticalSpace.md,
  },
  articleRowSkeleton: {
    paddingBlock: verticalSpace.lg,
    paddingInline: horizontalSpace.lg,
    boxSizing: "border-box",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    width: "100%",
  },
  articleRow: {
    borderStyle: "none",
    paddingBlock: verticalSpace.lg,
    paddingInline: horizontalSpace.lg,
    backgroundColor: {
      default: "transparent",
      ":hover": uiColor.component1,
    },
    boxSizing: "border-box",
    color: "inherit",
    cursor: "pointer",
    display: "block",
    textAlign: "left",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    width: "100%",
  },
  articleTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.xs,
    marginTop: verticalSpace.none,
  },
  articleMeta: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
  articleSubtitle: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontStyle: "italic",
    marginTop: verticalSpace.xs,
  },
  commentCard: {
    borderColor: uiColor.border1,
    borderRadius: spacing["2"],
    borderStyle: "solid",
    borderWidth: 1,
    paddingBlock: verticalSpace.lg,
    paddingInline: horizontalSpace.lg,
    boxSizing: "border-box",
  },
  commentHeader: {
    alignItems: "center",
    marginBottom: verticalSpace.md,
    width: "100%",
  },
  commentAuthor: {
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    minWidth: 0,
  },
  commentName: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  commentHandle: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
  },
  commentTime: {
    color: uiColor.text1,
    flexShrink: 0,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
  commentLink: {
    textDecoration: "none",
    color: "inherit",
    display: "block",
  },
  blockquote: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontStyle: "italic",
    borderLeftColor: primaryColor.solid1,
    borderLeftStyle: "solid",
    borderLeftWidth: spacing["1"],
    marginBottom: verticalSpace.md,
    marginLeft: horizontalSpace.none,
    marginRight: horizontalSpace.none,
    marginTop: verticalSpace.none,
    paddingLeft: horizontalSpace.md,
  },
  commentary: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    whiteSpace: "pre-line",
    marginBottom: verticalSpace.md,
  },
  commentFooter: {
    gap: gap.sm,
    alignItems: "center",
    color: uiColor.text1,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
  error: {
    paddingBlock: verticalSpace.lg,
    paddingInline: horizontalSpace.lg,
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
});

type DiscussionTab =
  | "keep-reading"
  | "discussions"
  | "related-reading"
  | "cited-in";

function tabLabel(base: string, count: number | null): string {
  if (count == null) return base;
  return `${base} (${count})`;
}

function authorLabel(comment: ExtensionDiscussionComment): string {
  if (comment.author.displayName?.trim()) return comment.author.displayName;
  if (comment.author.handle?.trim()) return `@${comment.author.handle}`;
  return comment.author.did.slice(0, 16);
}

function DiscussionCommentCard({
  comment,
}: {
  comment: ExtensionDiscussionComment;
}) {
  const name = authorLabel(comment);
  const handle = comment.author.handle ? `@${comment.author.handle}` : null;
  const replyLabel =
    comment.replyCount === 1 ? "1 reply" : `${comment.replyCount} replies`;
  const replyContext =
    comment.source === "margin"
      ? "on Margin"
      : comment.source === "semble"
        ? "on Semble"
        : "on Bluesky";

  return (
    <article {...stylex.props(styles.commentCard)}>
      <Flex direction="row" gap="md" style={styles.commentHeader}>
        <Avatar
          size="md"
          src={comment.author.avatarUrl ?? undefined}
          fallback={initials(name)}
          alt={name}
        />
        <Flex direction="column" gap="xs" style={styles.commentAuthor}>
          <span {...stylex.props(styles.commentName)}>{name}</span>
          {handle ? (
            <span {...stylex.props(styles.commentHandle)}>{handle}</span>
          ) : null}
        </Flex>
        <time
          dateTime={comment.indexedAt}
          {...stylex.props(styles.commentTime)}
        >
          {formatRelativeTime(comment.indexedAt)}
        </time>
      </Flex>

      <a
        href={comment.postUrl}
        target="_blank"
        rel="noreferrer"
        {...stylex.props(styles.commentLink)}
      >
        {comment.kind === "quote" && comment.quote ? (
          <blockquote {...stylex.props(styles.blockquote)}>
            {comment.quote}
          </blockquote>
        ) : null}
        <p {...stylex.props(styles.commentary)}>{comment.commentary}</p>
        <div {...stylex.props(styles.commentFooter)}>
          <MessageCircle size={14} aria-hidden />
          <span>
            {replyLabel} {replyContext}
          </span>
        </div>
      </a>
    </article>
  );
}

function DiscussionArticleRow({
  article,
  onOpen,
}: {
  article: ExtensionDiscussionArticle;
  onOpen: (readerUrl: string) => void;
}) {
  const pubName = article.publicationName?.trim() || "Publication";

  return (
    <button
      type="button"
      {...stylex.props(styles.articleRow)}
      onClick={() => onOpen(article.readerUrl)}
    >
      <p {...stylex.props(styles.articleTitle)}>{article.title}</p>
      <span {...stylex.props(styles.articleMeta)}>{pubName}</span>
      {article.subtitle ? (
        <p {...stylex.props(styles.articleSubtitle)}>{article.subtitle}</p>
      ) : null}
    </button>
  );
}

function ArticleList({
  articles,
  emptyLabel,
  onOpenReader,
}: {
  articles: Array<ExtensionDiscussionArticle>;
  emptyLabel: string;
  onOpenReader: (url: string) => void;
}) {
  if (articles.length === 0) {
    return <p {...stylex.props(styles.empty)}>{emptyLabel}</p>;
  }

  return (
    <Flex direction="column">
      {articles.map((article) => (
        <DiscussionArticleRow
          key={article.uri}
          article={article}
          onOpen={onOpenReader}
        />
      ))}
    </Flex>
  );
}

function CommentCardSkeleton() {
  return (
    <article {...stylex.props(styles.commentCard)} aria-hidden>
      <Flex direction="row" gap="md" style={styles.commentHeader}>
        <Skeleton variant="circle" size="md" />
        <Flex direction="column" gap="xs" style={styles.commentAuthor}>
          <Skeleton
            variant="rectangle"
            height={spacing["3.5"]}
            width="45%"
            style={styles.skeletonLineTight}
          />
          <Skeleton variant="rectangle" height={spacing["3"]} width="32%" />
        </Flex>
        <Skeleton
          variant="rectangle"
          height={spacing["3"]}
          width={spacing["12"]}
        />
      </Flex>
      <Skeleton
        variant="rectangle"
        height={spacing["3.5"]}
        style={styles.skeletonLineBody}
      />
      <Skeleton
        variant="rectangle"
        height={spacing["3.5"]}
        width="88%"
        style={styles.skeletonLineBody}
      />
      <Skeleton
        variant="rectangle"
        height={spacing["3"]}
        width="36%"
        style={styles.skeletonLineFooter}
      />
    </article>
  );
}

function ArticleRowSkeleton() {
  return (
    <div {...stylex.props(styles.articleRowSkeleton)} aria-hidden>
      <Skeleton
        variant="rectangle"
        height={spacing["4"]}
        width="78%"
        style={styles.skeletonLineTight}
      />
      <Skeleton variant="rectangle" height={spacing["3"]} width="34%" />
    </div>
  );
}

function DiscussionSkeleton({ tab }: { tab: DiscussionTab }) {
  if (tab === "discussions") {
    return (
      <Flex direction="column" gap="md" style={styles.skeletonWrapDiscussions}>
        <CommentCardSkeleton />
        <CommentCardSkeleton />
      </Flex>
    );
  }

  return (
    <Flex direction="column" style={styles.skeletonWrapArticles}>
      <ArticleRowSkeleton />
      <ArticleRowSkeleton />
      <ArticleRowSkeleton />
    </Flex>
  );
}

type PopupArticleDiscussionProps = {
  documentUri: string;
  onClose: () => void;
  onOpenReader: (url: string) => void;
};

export function PopupArticleDiscussion({
  documentUri,
  onClose,
  onOpenReader,
}: PopupArticleDiscussionProps) {
  const [selectedTab, setSelectedTab] = useState<DiscussionTab>("discussions");
  const [data, setData] = useState<ExtensionDiscussionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    void sendMessage({ type: "getDiscussion", documentUri })
      .then((response) => {
        if (cancelled) return;
        setData(response);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Couldn’t load discussion.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [documentUri]);

  const counts = data
    ? {
        keepReading: data.keepReading.length,
        discussions: data.discussions.length,
        relatedReading: data.relatedReading.length,
        citedIn: data.citedIn.length,
      }
    : null;

  return (
    <div {...stylex.props(styles.root)}>
      <Tabs
        selectedKey={selectedTab}
        onSelectionChange={(key) => setSelectedTab(key as DiscussionTab)}
        size="sm"
        style={styles.tabsFrame}
      >
        <Flex direction="row" gap="none" style={styles.tabBar}>
          <TabList style={[styles.tabList, tabListNoBorder.list]}>
            <Tab id="discussions" style={styles.tab}>
              {tabLabel("Discussions", counts?.discussions ?? null)}
            </Tab>
            <Tab id="keep-reading" style={styles.tab}>
              {tabLabel("Keep Reading", counts?.keepReading ?? null)}
            </Tab>
            <Tab id="related-reading" style={styles.tab}>
              {tabLabel("Related Reading", counts?.relatedReading ?? null)}
            </Tab>
            <Tab id="cited-in" style={styles.tab}>
              {tabLabel("Cited In", counts?.citedIn ?? null)}
            </Tab>
          </TabList>
          <div {...stylex.props(styles.closeWrap)}>
            <IconButton
              aria-label="Close discussion"
              variant="tertiary"
              size="md"
              onPress={onClose}
            >
              <X size={18} />
            </IconButton>
          </div>
        </Flex>

        <div {...stylex.props(styles.panelWrap)}>
          {error ? (
            <Text variant="secondary" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <TabPanel id="discussions" style={styles.panelDiscussions}>
            {loading ? (
              <DiscussionSkeleton tab="discussions" />
            ) : data && data.discussions.length === 0 ? (
              <p {...stylex.props(styles.empty)}>No discussion yet.</p>
            ) : data ? (
              <Flex direction="column" gap="md">
                {data.discussions.map((comment) => (
                  <DiscussionCommentCard
                    key={comment.postUri}
                    comment={comment}
                  />
                ))}
              </Flex>
            ) : null}
          </TabPanel>

          <TabPanel id="keep-reading" style={styles.panelArticles}>
            {loading ? (
              <DiscussionSkeleton tab="keep-reading" />
            ) : data ? (
              <ArticleList
                articles={data.keepReading}
                emptyLabel="Nothing else from this publication yet."
                onOpenReader={onOpenReader}
              />
            ) : null}
          </TabPanel>

          <TabPanel id="related-reading" style={styles.panelArticles}>
            {loading ? (
              <DiscussionSkeleton tab="related-reading" />
            ) : data ? (
              <ArticleList
                articles={data.relatedReading}
                emptyLabel="No related reading yet."
                onOpenReader={onOpenReader}
              />
            ) : null}
          </TabPanel>

          <TabPanel id="cited-in" style={styles.panelArticles}>
            {loading ? (
              <DiscussionSkeleton tab="cited-in" />
            ) : data ? (
              <ArticleList
                articles={data.citedIn}
                emptyLabel="Not cited anywhere yet."
                onOpenReader={onOpenReader}
              />
            ) : null}
          </TabPanel>
        </div>
      </Tabs>
    </div>
  );
}
