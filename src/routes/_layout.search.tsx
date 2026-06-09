"use client";

import * as stylex from "@stylexjs/stylex";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { searchApi } from "#/integrations/tanstack-query/api-search.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { Search as SearchIcon, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import type { PublicationCard } from "../integrations/tanstack-query/api-shapes";

import {
  ArticleRow,
  PubDirectoryRow,
  PubDirectoryRowSkeleton,
} from "../components/reader/cards";
import {
  Kicker,
  ReaderContent,
  SectionHead,
} from "../components/reader/primitives";
import { Button } from "../design-system/button";
import { Flex } from "../design-system/flex";
import { IconButton } from "../design-system/icon-button";
import { Skeleton } from "../design-system/skeleton";
import { uiColor } from "../design-system/theme/color.stylex";
import { gap } from "../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  tracking,
} from "../design-system/theme/typography.stylex";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 20;
const SKELETON_ROWS = 4;

const searchSchema = z.object({
  q: z.string().optional(),
});

export const Route = createFileRoute("/_layout/search")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ q: search.q?.trim() ?? "" }),
  loader: async ({ context, deps }) => {
    if (deps.q) {
      await Promise.all([
        context.queryClient.ensureQueryData(
          searchApi.searchPublicationsQueryOptions({
            q: deps.q,
            limit: SEARCH_PAGE_SIZE,
          }),
        ),
        context.queryClient.ensureInfiniteQueryData(
          searchApi.searchArticlesInfiniteQueryOptions({
            q: deps.q,
            limit: SEARCH_PAGE_SIZE,
          }),
        ),
      ]);
    }
  },
  head: () => ({
    meta: pageSocialMeta("search", getPublicUrlClient()),
  }),
  component: Search,
});

const styles = stylex.create({
  header: {
    paddingTop: spacing["10"],
  },
  searchField: {
    alignItems: "center",
    columnGap: spacing["3.5"],
    display: "flex",
    rowGap: spacing["3.5"],
    borderBottomColor: uiColor.border3,
    borderBottomStyle: "solid",
    borderBottomWidth: 2,
    marginBottom: spacing["2"],
    paddingBottom: spacing["4"],
    paddingTop: spacing["4"],
  },
  searchIcon: {
    color: uiColor.text1,
    flexShrink: 0,
  },
  searchInput: {
    borderStyle: "none",
    backgroundColor: "transparent",
    color: uiColor.text2,
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    fontFamily: fontFamily.serif,
    fontSize: {
      default: fontSize["2xl"],
      "@media (min-width: 48rem)": fontSize["4xl"],
    },
    outlineStyle: "none",
    minWidth: 0,
    paddingBottom: spacing["0"],
    paddingLeft: spacing["0"],
    paddingRight: spacing["0"],
    paddingTop: spacing["0"],
  },
  searchInputPlaceholder: {
    "::placeholder": {
      color: uiColor.text1,
    },
  },
  hint: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    letterSpacing: tracking.wide,
  },
  results: {
    marginTop: spacing["10"],
  },
  section: {
    marginBottom: spacing["12"],
  },
  sectionFirst: {
    marginTop: spacing["0"],
  },
  loadMoreWrap: {
    display: "flex",
    justifyContent: "center",
    marginTop: spacing["6"],
  },
  loadSentinel: {
    height: 1,
    marginTop: spacing["6"],
    width: "100%",
  },
  emptyNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    textAlign: "center",
    paddingBottom: spacing["8"],
    paddingTop: spacing["8"],
  },
  articleSkeleton: {
    columnGap: gap["2xl"],
    display: "grid",
    gridTemplateColumns: "1fr auto",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["6"],
    paddingTop: spacing["6"],
  },
  articleSkeletonLast: {
    borderBottomWidth: 0,
  },
  articleSkeletonFirstInSection: {
    paddingTop: spacing["0"],
  },
});

function ArticleRowSkeleton({
  isLast = false,
  isFirstInSection = false,
}: {
  isLast?: boolean;
  isFirstInSection?: boolean;
}) {
  return (
    <div
      aria-hidden
      {...stylex.props(
        styles.articleSkeleton,
        isLast && styles.articleSkeletonLast,
        isFirstInSection && styles.articleSkeletonFirstInSection,
      )}
    >
      <Flex direction="column" gap="2xl">
        <Skeleton variant="rectangle" height={spacing["3.5"]} width="28%" />
        <Skeleton variant="rectangle" height={spacing["6"]} width="72%" />
        <Skeleton variant="rectangle" height={spacing["4"]} width="88%" />
        <Skeleton variant="rectangle" height={spacing["3.5"]} width="34%" />
      </Flex>
      <Skeleton
        variant="rectangle"
        height={spacing["20"]}
        width={spacing["28"]}
      />
    </div>
  );
}

function SearchResultsSkeleton() {
  return (
    <>
      <div {...stylex.props(styles.section, styles.sectionFirst)}>
        <SectionHead kicker="Publications" title="Searching…" />
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <PubDirectoryRowSkeleton
            key={index}
            isFirstInSection={index === 0}
            isLast={index === SKELETON_ROWS - 1}
          />
        ))}
      </div>
      <div {...stylex.props(styles.section)}>
        <SectionHead kicker="Articles" title="Searching…" />
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <ArticleRowSkeleton
            key={index}
            isFirstInSection={index === 0}
            isLast={index === SKELETON_ROWS - 1}
          />
        ))}
      </div>
    </>
  );
}

function formatMatchCount(shown: number, total: number): string {
  if (total === 0) return "No matches";
  if (shown < total) {
    return `${shown} of ${total} matches`;
  }
  return `${total} match${total === 1 ? "" : "es"}`;
}

function Search() {
  const { q: urlQ = "" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const inputRef = useRef<HTMLInputElement>(null);
  const loadMoreArticlesRef = useRef<HTMLDivElement>(null);
  const loadingMorePubsRef = useRef(false);
  const [input, setInput] = useState(urlQ);
  const [debouncedQ, setDebouncedQ] = useState(urlQ.trim());
  const [publications, setPublications] = useState<Array<PublicationCard>>([]);
  const [pubTotal, setPubTotal] = useState(0);
  const [pubNextOffset, setPubNextOffset] = useState<number | null>(null);
  const [loadingMorePubs, setLoadingMorePubs] = useState(false);

  useEffect(() => {
    setInput(urlQ);
    setDebouncedQ(urlQ.trim());
  }, [urlQ]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      const trimmed = input.trim();
      setDebouncedQ(trimmed);
      if (trimmed !== urlQ.trim()) {
        void navigate({
          replace: true,
          resetScroll: false,
          search: { q: trimmed || undefined },
        });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => globalThis.clearTimeout(timer);
  }, [input, navigate, urlQ]);

  const { data: pubPage, isFetching: pubsFetching } = useQuery({
    ...searchApi.searchPublicationsQueryOptions({
      q: debouncedQ,
      limit: SEARCH_PAGE_SIZE,
    }),
  });

  const {
    data: articlePages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching: articlesFetching,
  } = useInfiniteQuery({
    ...searchApi.searchArticlesInfiniteQueryOptions({
      q: debouncedQ,
      limit: SEARCH_PAGE_SIZE,
    }),
  });

  useEffect(() => {
    if (pubPage) {
      setPublications(pubPage.items);
      setPubTotal(pubPage.total);
      setPubNextOffset(pubPage.nextOffset);
    }
  }, [pubPage]);

  const articles = articlePages?.pages.flatMap((page) => page.items) ?? [];
  const articleTotal = articlePages?.pages[0]?.total ?? 0;

  const loadMorePublications = useCallback(async () => {
    if (pubNextOffset == null || loadingMorePubsRef.current) return;
    loadingMorePubsRef.current = true;
    setLoadingMorePubs(true);
    try {
      const page = await searchApi.searchPublications({
        data: {
          q: debouncedQ,
          limit: SEARCH_PAGE_SIZE,
          offset: pubNextOffset,
        },
      });
      setPublications((prev) => [...prev, ...page.items]);
      setPubNextOffset(page.nextOffset);
    } finally {
      loadingMorePubsRef.current = false;
      setLoadingMorePubs(false);
    }
  }, [debouncedQ, pubNextOffset]);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;

    const sentinel = loadMoreArticlesRef.current;
    if (!sentinel) return;

    const root = sentinel.closest("[data-app-scroller]");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void fetchNextPage();
        }
      },
      { root, rootMargin: "1200px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, articles.length]);

  const trimmedInput = input.trim();
  const hasQuery = debouncedQ.length > 0;
  const hasResults = pubPage != null || articlePages != null;
  const isSearching =
    hasQuery &&
    (trimmedInput !== debouncedQ ||
      ((pubsFetching || articlesFetching) && !hasResults));

  const hint = hasQuery
    ? isSearching
      ? "Searching…"
      : `${pubTotal} publication${pubTotal === 1 ? "" : "s"} · ${articleTotal} article${articleTotal === 1 ? "" : "s"}`
    : 'Try "climate", "typography", or a handle like stdout.dev';

  const showEmpty =
    !isSearching &&
    publications.length === 0 &&
    articles.length === 0 &&
    hasResults;

  return (
    <ReaderContent>
      <div {...stylex.props(styles.header)}>
        <Kicker>Search the network</Kicker>
        <div {...stylex.props(styles.searchField)}>
          <SearchIcon
            aria-hidden
            size={28}
            {...stylex.props(styles.searchIcon)}
          />
          <input
            ref={inputRef}
            type="text"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Publications, handles, topics, headlines…"
            aria-label="Search publications and articles"
            {...stylex.props(styles.searchInput, styles.searchInputPlaceholder)}
          />
          {input ? (
            <IconButton
              label="Clear search"
              size="sm"
              variant="secondary"
              onPress={() => {
                setInput("");
                inputRef.current?.focus();
              }}
            >
              <X size={18} />
            </IconButton>
          ) : null}
        </div>
        <p {...stylex.props(styles.hint)}>{hint}</p>
      </div>

      {hasQuery ? (
        <div {...stylex.props(styles.results)}>
          {isSearching ? (
            <SearchResultsSkeleton />
          ) : (
            <>
              {publications.length > 0 || pubTotal > 0 ? (
                <section {...stylex.props(styles.section, styles.sectionFirst)}>
                  <SectionHead
                    kicker="Publications"
                    title={formatMatchCount(publications.length, pubTotal)}
                  />
                  {publications.map((pub, index) => (
                    <PubDirectoryRow
                      key={pub.uri}
                      pub={pub}
                      isFirstInSection={index === 0}
                      isLast={
                        index === publications.length - 1 &&
                        pubNextOffset == null
                      }
                    />
                  ))}
                  {pubNextOffset == null ? null : (
                    <div {...stylex.props(styles.loadMoreWrap)}>
                      <Button
                        variant="secondary"
                        size="sm"
                        isDisabled={loadingMorePubs}
                        onPress={() => void loadMorePublications()}
                      >
                        {loadingMorePubs
                          ? "Loading…"
                          : `Load more (${pubTotal - publications.length} remaining)`}
                      </Button>
                    </div>
                  )}
                </section>
              ) : null}

              {articles.length > 0 || articleTotal > 0 ? (
                <section {...stylex.props(styles.section)}>
                  <SectionHead
                    kicker="Articles"
                    title={formatMatchCount(articles.length, articleTotal)}
                  />
                  {articles.map((article, index) => (
                    <ArticleRow
                      key={article.uri}
                      article={article}
                      isFirstInSection={index === 0}
                    />
                  ))}
                  {isFetchingNextPage
                    ? Array.from({ length: 2 }, (_, index) => (
                        <ArticleRowSkeleton
                          key={`loading-${index}`}
                          isFirstInSection={false}
                          isLast={index === 1 && !hasNextPage}
                        />
                      ))
                    : null}
                  {hasNextPage ? (
                    <div
                      ref={loadMoreArticlesRef}
                      aria-hidden
                      {...stylex.props(styles.loadSentinel)}
                    />
                  ) : null}
                </section>
              ) : null}

              {showEmpty ? (
                <p {...stylex.props(styles.emptyNote)}>
                  Nothing matches &ldquo;{debouncedQ}&rdquo; — yet. The network
                  is always growing.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </ReaderContent>
  );
}
