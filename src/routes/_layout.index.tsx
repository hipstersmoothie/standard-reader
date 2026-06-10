import * as stylex from "@stylexjs/stylex";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";
import { ArrowRight, Flame, Sparkles } from "lucide-react";

import {
  ArticleRow,
  CompactRow,
  FeatureArticle,
  MiniPubRow,
} from "../components/reader/cards";
import {
  Masthead,
  ReaderContent,
  SectionHead,
} from "../components/reader/primitives";
import { Button } from "../design-system/button";
import { Flex } from "../design-system/flex";
import { primaryColor, uiColor } from "../design-system/theme/color.stylex";
import { radius } from "../design-system/theme/radius.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../design-system/theme/typography.stylex";
import { feedApi } from "../integrations/tanstack-query/api-feed.functions";
import { user } from "../integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "../lib/public-url";
import { pageSocialMeta } from "../lib/site-metadata";

export const Route = createFileRoute("/_layout/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      feedApi.getHomeFeedQueryOptions(),
    );
  },
  head: () => ({
    meta: pageSocialMeta("today", getPublicUrlClient()),
  }),
  component: Home,
});

const styles = stylex.create({
  twoCol: {
    alignItems: "start",
    columnGap: spacing["12"],
    display: "grid",
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 64rem)": "minmax(0, 1fr) 320px",
    },
    rowGap: spacing["12"],
    marginTop: spacing["9"],
  },
  railCard: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.bgSubtle,
    boxSizing: "border-box",
    paddingBottom: spacing["2"],
    paddingLeft: spacing["5"],
    paddingRight: spacing["5"],
    paddingTop: spacing["5"],
  },
  railHead: {
    alignItems: "center",
    color: uiColor.text2,
    columnGap: spacing["2"],
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: "0.7rem",
    fontWeight: fontWeight.bold,
    letterSpacing: tracking.widest,
    rowGap: spacing["2"],
    textTransform: "uppercase",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["3"],
  },
  railIcon: { color: primaryColor.text2 },
  directoryLink: {
    display: "inline-block",
    marginTop: spacing["2"],
  },
  viewAll: {
    width: "100%",
  },
  emptyCard: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    marginTop: spacing["6"],
    paddingBottom: spacing["10"],
    paddingLeft: spacing["8"],
    paddingRight: spacing["8"],
    paddingTop: spacing["10"],
  },
  emptyTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
  },
  emptyDek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    maxWidth: "52ch",
  },
});

const TODAY_FMT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});
const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", { weekday: "long" });

function Home() {
  const { data: feed } = useSuspenseQuery(feedApi.getHomeFeedQueryOptions());
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const { enabled: trackReading } = useTrackReadingHistory();

  const now = new Date();
  const weekday = WEEKDAY_FMT.format(now);
  const today = TODAY_FMT.format(now);

  if (!feed.personalized && feed.latestUnread.length === 0 && !feed.featured) {
    return (
      <ReaderContent>
        <Masthead
          kicker="Your reading room"
          title="A quiet place to begin"
          dek="Follow a few publications and their latest writing will collect here."
        />
        <Flex direction="column" gap="2xl" style={styles.emptyCard}>
          <span {...stylex.props(styles.emptyTitle)}>Wander the directory</span>
          <span {...stylex.props(styles.emptyDek)}>
            Standard Reader knows about every publication on the network. Find a
            few worth your mornings.
          </span>
          <Flex>
            <Link to="/discover">
              <Button>Explore the directory</Button>
            </Link>
          </Flex>
        </Flex>
      </ReaderContent>
    );
  }

  const unreadLabel =
    !trackReading || feed.unreadCount == null
      ? "Fresh"
      : `${feed.unreadCount} new`;
  const dek = feed.personalized
    ? trackReading
      ? `${feed.unreadCount ?? feed.latestUnread.length} unread across the publications you follow.`
      : "The latest writing from the publications you follow."
    : "The latest long-form writing from across the network.";

  return (
    <ReaderContent>
      <Masthead
        kicker={`${weekday} · ${feed.personalized ? "Your feed" : "Across the network"}`}
        title="Today"
        dek={dek}
        metaLabel={today}
        metaValue={unreadLabel}
      />

      {feed.featured ? <FeatureArticle article={feed.featured} /> : null}

      <div {...stylex.props(styles.twoCol)}>
        <Flex direction="column">
          <SectionHead
            kicker={
              feed.personalized ? "From your follows" : "Fresh off the network"
            }
            title={trackReading ? "Latest unread" : "Latest"}
          />
          <div>
            {feed.latestUnread.map((article) => (
              <ArticleRow
                key={article.uri}
                article={article}
                showSaveButton={false}
              />
            ))}
          </div>
          {session?.user ? (
            <Link to="/latest" {...stylex.props(styles.viewAll)}>
              <Button variant="secondary" size="lg" style={styles.viewAll}>
                View all latest <ArrowRight size={15} />
              </Button>
            </Link>
          ) : null}
        </Flex>

        <Flex direction="column" gap="2xl">
          {feed.trending.length > 0 ? (
            <div {...stylex.props(styles.railCard)}>
              <div {...stylex.props(styles.railHead)}>
                <Flame size={14} {...stylex.props(styles.railIcon)} /> Trending
                articles
              </div>
              <div>
                {feed.trending.map((article, i) => (
                  <CompactRow
                    key={article.uri}
                    article={article}
                    rank={i + 1}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {feed.youMightFollow.length > 0 ? (
            <div {...stylex.props(styles.railCard)}>
              <div {...stylex.props(styles.railHead)}>
                <Sparkles size={14} {...stylex.props(styles.railIcon)} /> You
                might follow
              </div>
              <div>
                {feed.youMightFollow.slice(0, 3).map((pub, i, pubs) => (
                  <MiniPubRow
                    key={pub.uri}
                    pub={pub}
                    isLast={i === pubs.length - 1}
                  />
                ))}
              </div>
              <Link to="/discover" {...stylex.props(styles.directoryLink)}>
                <Button variant="tertiary" size="sm">
                  Open the directory <ArrowRight size={14} />
                </Button>
              </Link>
            </div>
          ) : null}
        </Flex>
      </div>
    </ReaderContent>
  );
}
