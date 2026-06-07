"use client";

import * as stylex from "@stylexjs/stylex";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { feedApi } from "#/integrations/tanstack-query/api-feed.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import type { ArticleCard } from "../integrations/tanstack-query/api-shapes";

import { ArticleRow } from "../components/reader/cards";
import { Masthead, ReaderContent } from "../components/reader/primitives";
import { Button } from "../design-system/button";
import { Flex } from "../design-system/flex";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../design-system/segmented-control";
import { uiColor } from "../design-system/theme/color.stylex";
import { radius } from "../design-system/theme/radius.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "../design-system/theme/typography.stylex";

const PAGE_SIZE = 20;

const latestSearchSchema = z.object({
  filter: z.enum(["all", "unread"]).default("all"),
});

export const Route = createFileRoute("/_layout/latest")({
  validateSearch: latestSearchSchema,
  loaderDeps: ({ search }) => ({ filter: search.filter }),
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(
      feedApi.getLatestFeedQueryOptions({
        filter: deps.filter,
        limit: PAGE_SIZE,
        offset: 0,
      }),
    );
  },
  head: () => ({
    meta: [{ title: "Latest · Standard Reader" }],
  }),
  component: Latest,
});

const styles = stylex.create({
  controls: {
    marginBottom: spacing["6"],
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
    lineHeight: lineHeight.sm,
  },
  emptyDek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    maxWidth: "52ch",
  },
  loadSentinel: {
    height: 1,
    marginTop: spacing["6"],
    width: "100%",
  },
  endNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: spacing["6"],
  },
});

function Latest() {
  const { filter } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [items, setItems] = useState<Array<ArticleCard>>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const { data: feed } = useSuspenseQuery(
    feedApi.getLatestFeedQueryOptions({
      filter,
      limit: PAGE_SIZE,
      offset: 0,
    }),
  );

  useEffect(() => {
    setItems(feed.items);
    setNextOffset(feed.nextOffset);
  }, [feed]);

  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);

  const documentUris = items.map((item) => item.uri);
  const { data: readUris } = useQuery({
    ...readerApi.getReadDocumentsQueryOptions(documentUris),
    enabled: signedIn && documentUris.length > 0 && filter === "all",
  });
  const readSet = new Set(readUris ?? []);
  const isUnread = (uri: string) => signedIn && !readSet.has(uri);

  const onFilterChange = (keys: Set<React.Key> | "all") => {
    const next = keys === "all" ? "all" : ([...keys][0] as "all" | "unread");
    void navigate({ search: { filter: next } });
  };

  const loadMoreFeed = useCallback(async () => {
    if (nextOffset == null || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await feedApi.getLatestFeed({
        data: { filter, limit: PAGE_SIZE, offset: nextOffset },
      });
      setItems((prev) => [...prev, ...page.items]);
      setNextOffset(page.nextOffset);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [filter, nextOffset]);

  useEffect(() => {
    if (nextOffset == null) return;

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const root = sentinel.closest("[data-app-scroller]");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreFeed();
        }
      },
      { root, rootMargin: "240px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreFeed, nextOffset]);

  const allLabel = `All (${feed.counts.all})`;
  const unreadLabel = `Unread (${feed.counts.unread})`;

  if (!signedIn) {
    return (
      <ReaderContent>
        <Masthead
          kicker="From your follows"
          title="Latest"
          dek="Everything published recently across the publications you follow."
        />
        <Flex direction="column" gap="2xl" style={styles.emptyCard}>
          <span {...stylex.props(styles.emptyTitle)}>
            Sign in to see your feed
          </span>
          <span {...stylex.props(styles.emptyDek)}>
            Follow publications and their latest writing will collect here,
            newest first.
          </span>
          <Flex>
            <Link to="/login">
              <Button>Log in</Button>
            </Link>
          </Flex>
        </Flex>
      </ReaderContent>
    );
  }

  if (feed.counts.all === 0) {
    return (
      <ReaderContent>
        <Masthead
          kicker="From your follows"
          title="Latest"
          dek="Everything published recently across the publications you follow."
        />
        <Flex direction="column" gap="2xl" style={styles.emptyCard}>
          <span {...stylex.props(styles.emptyTitle)}>Nothing here yet</span>
          <span {...stylex.props(styles.emptyDek)}>
            Follow a few publications and their latest writing will show up
            here.
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

  const metaValue =
    filter === "unread"
      ? `${feed.counts.unread} unread`
      : `${feed.counts.all} articles`;

  return (
    <ReaderContent>
      <Masthead
        kicker="From your follows"
        title="Latest"
        dek="Everything published recently across the publications you follow."
        metaLabel="In your feed"
        metaValue={metaValue}
      />

      <div {...stylex.props(styles.controls)}>
        <SegmentedControl
          selectedKeys={new Set([filter])}
          onSelectionChange={onFilterChange}
          size="lg"
        >
          <SegmentedControlItem id="all">{allLabel}</SegmentedControlItem>
          <SegmentedControlItem id="unread">{unreadLabel}</SegmentedControlItem>
        </SegmentedControl>
      </div>

      {items.length === 0 ? (
        <Flex direction="column" gap="2xl" style={styles.emptyCard}>
          <span {...stylex.props(styles.emptyTitle)}>All caught up</span>
          <span {...stylex.props(styles.emptyDek)}>
            No unread articles from your follows right now.
          </span>
          <Flex>
            <Button
              variant="secondary"
              onPress={() => onFilterChange(new Set(["all"]))}
            >
              Show all articles
            </Button>
          </Flex>
        </Flex>
      ) : (
        <>
          <div>
            {items.map((article) => (
              <ArticleRow
                key={article.uri}
                article={article}
                unread={filter === "unread" || isUnread(article.uri)}
              />
            ))}
          </div>

          {nextOffset != null ? (
            <>
              <div
                ref={loadMoreSentinelRef}
                aria-hidden
                {...stylex.props(styles.loadSentinel)}
              />
              {loadingMore ? (
                <p {...stylex.props(styles.endNote)}>Loading…</p>
              ) : null}
            </>
          ) : (
            <p {...stylex.props(styles.endNote)}>
              You&apos;ve reached the end.
            </p>
          )}
        </>
      )}
    </ReaderContent>
  );
}
