"use client";

import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { Flex } from "@standard-reader/design-system/flex";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { Skeleton } from "@standard-reader/design-system/skeleton";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search as SearchIcon, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

import { searchApi } from "#/integrations/tanstack-query/api-search.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";

import {
  ArticleRow,
  PubDirectoryRow,
  PubDirectoryRowSkeleton,
} from "../components/reader/cards";
import { FeedLoadMore } from "../components/reader/feed-load-more";
import {
  Kicker,
  ReaderContent,
  SectionHead,
} from "../components/reader/primitives";
import type { PublicationCard } from "../integrations/tanstack-query/api-shapes";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 20;
const SKELETON_ROWS = 4;

const searchSchema = z.object({
  q: z.string().optional(),
});

export const Route = createFileRoute("/_layout/search")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ q: search.q?.trim() ?? "" }),
  loader: ({ context, deps }) => {
    if (!deps.q) return;

    const publicationsOptions = searchApi.searchPublicationsQueryOptions({
      q: deps.q,
      limit: SEARCH_PAGE_SIZE,
    });
    const articlesOptions = searchApi.searchArticlesInfiniteQueryOptions({
      q: deps.q,
      limit: SEARCH_PAGE_SIZE,
    });

    void context.queryClient.prefetchQuery(publicationsOptions);
    void context.queryClient.prefetchInfiniteQuery(articlesOptions);
  },
  head: () => ({
    meta: pageSocialMeta("search", getPublicUrlClient()),
  }),
  pendingComponent: SearchPending,
  component: Search,
});

const styles = stylex.create({
  header: {
    display: "flex",
    flexDirection: "column",
    gap: gap.md,
    paddingTop: {
      default: spacing["6"],
      "@media (min-width: 40rem)": spacing["10"],
    },
  },
  searchField: {
    alignItems: "center",
    columnGap: spacing["3.5"],
    display: "flex",
    rowGap: spacing["3.5"],
    borderBottomColor: uiColor.border3,
    borderBottomStyle: "solid",
    borderBottomWidth: 2,
    marginBottom: spacing["8"],
    paddingBottom: spacing["6"],
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
    paddingInlineStart: spacing["0"],
    paddingInlineEnd: spacing["0"],
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

function SectionTitleSkeleton() {
  return <Skeleton variant="rectangle" height={spacing["8"]} width="36%" />;
}

function PublicationResultsSkeleton({
  isFirstSection = true,
}: {
  isFirstSection?: boolean;
}) {
  const { t } = useLingui();
  return (
    <div
      aria-busy="true"
      aria-label={t`Loading publication matches`}
      {...stylex.props(styles.section, isFirstSection && styles.sectionFirst)}
    >
      <SectionHead
        kicker={<Trans>Publications</Trans>}
        title={<SectionTitleSkeleton />}
      />
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <PubDirectoryRowSkeleton
          key={index}
          isFirstInSection={index === 0}
          isLast={index === SKELETON_ROWS - 1}
        />
      ))}
    </div>
  );
}

function ArticleResultsSkeleton({
  isFirstSection = false,
}: {
  isFirstSection?: boolean;
}) {
  const { t } = useLingui();
  return (
    <div
      aria-busy="true"
      aria-label={t`Loading article matches`}
      {...stylex.props(styles.section, isFirstSection && styles.sectionFirst)}
    >
      <SectionHead
        kicker={<Trans>Articles</Trans>}
        title={<SectionTitleSkeleton />}
      />
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <ArticleRowSkeleton
          key={index}
          isFirstInSection={index === 0}
          isLast={index === SKELETON_ROWS - 1}
        />
      ))}
    </div>
  );
}

function SearchChrome({
  input,
  hint,
  inputRef,
  onInputChange,
  onClear,
  readOnly = false,
}: {
  input: string;
  hint: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onInputChange?: (value: string) => void;
  onClear?: () => void;
  readOnly?: boolean;
}) {
  const { t } = useLingui();
  return (
    <div {...stylex.props(styles.header)}>
      <Kicker>
        <Trans>Search the network</Trans>
      </Kicker>
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
          readOnly={readOnly}
          onChange={
            readOnly || !onInputChange
              ? undefined
              : (event) => onInputChange(event.target.value)
          }
          placeholder={t`Publications, handles, #tags, headlines…`}
          aria-label={t`Search publications and articles`}
          {...stylex.props(styles.searchInput, styles.searchInputPlaceholder)}
        />
        {input && onClear ? (
          <IconButton
            label={t`Clear search`}
            size="sm"
            variant="secondary"
            onPress={onClear}
          >
            <X size={18} />
          </IconButton>
        ) : null}
      </div>
      <p {...stylex.props(styles.hint)}>{hint}</p>
    </div>
  );
}

function SearchPending() {
  const { t } = useLingui();
  const { q: urlQ = "" } = Route.useSearch();
  const trimmedQ = urlQ.trim();

  return (
    <ReaderContent>
      <SearchChrome
        input={urlQ}
        hint={
          trimmedQ
            ? t`Searching…`
            : t`Try "climate", a #tag like #essay, or a handle like stdout.dev`
        }
        readOnly
      />
      {trimmedQ ? (
        <div {...stylex.props(styles.results)}>
          <PublicationResultsSkeleton />
          <ArticleResultsSkeleton />
        </div>
      ) : null}
    </ReaderContent>
  );
}

function formatMatchCount(i18n: I18n, shown: number, total: number): string {
  if (total === 0) return i18n._(msg`No matches`);
  if (shown < total) {
    return i18n._(msg`${shown} of ${total} matches`);
  }
  return i18n._(msg`${plural(total, { one: "# match", other: "# matches" })}`);
}

/**
 * Article results are paged without an exact total (the count(*) over the whole
 * match set was too costly), so show the number loaded plus a "+" when more
 * pages remain.
 */
function formatShownCount(i18n: I18n, shown: number, hasMore: boolean): string {
  if (shown === 0) return i18n._(msg`No matches`);
  if (hasMore) return i18n._(msg`${shown}+ matches`);
  return i18n._(msg`${plural(shown, { one: "# match", other: "# matches" })}`);
}

function Search() {
  const { t, i18n } = useLingui();
  const { q: urlQ = "" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const inputRef = useRef<HTMLInputElement>(null);
  const loadingMorePubsRef = useRef(false);
  const committedQRef = useRef(urlQ.trim());
  const [input, setInput] = useState(urlQ);
  const [debouncedQ, setDebouncedQ] = useState(urlQ.trim());
  const [publications, setPublications] = useState<Array<PublicationCard>>([]);
  const [pubTotal, setPubTotal] = useState(0);
  const [pubNextOffset, setPubNextOffset] = useState<number | null>(null);
  const [loadingMorePubs, setLoadingMorePubs] = useState(false);

  useEffect(() => {
    const trimmedUrl = urlQ.trim();
    if (trimmedUrl === committedQRef.current) return;

    committedQRef.current = trimmedUrl;
    setInput(urlQ);
    setDebouncedQ(trimmedUrl);
  }, [urlQ]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      const trimmed = input.trim();
      setDebouncedQ(trimmed);
      if (trimmed !== urlQ.trim()) {
        committedQRef.current = trimmed;
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
    setPublications([]);
    setPubTotal(0);
    setPubNextOffset(null);
  }, [debouncedQ]);

  useEffect(() => {
    if (pubPage?.query === debouncedQ) {
      setPublications(pubPage.items);
      setPubTotal(pubPage.total);
      setPubNextOffset(pubPage.nextOffset);
    }
  }, [debouncedQ, pubPage]);

  const articles = articlePages?.pages.flatMap((page) => page.items) ?? [];

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

  const loadMoreArticles = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const trimmedInput = input.trim();
  const hasQuery = debouncedQ.length > 0;
  const inputPending = trimmedInput !== debouncedQ;
  const pubsReady = pubPage?.query === debouncedQ;
  const articlesReady = articlePages?.pages[0]?.query === debouncedQ;
  const pubsPending = hasQuery && !pubsReady && (inputPending || pubsFetching);
  const articlesPending =
    hasQuery && !articlesReady && (inputPending || articlesFetching);
  const resultsReady = hasQuery && pubsReady && articlesReady;

  const publicationCountText = i18n._(
    msg`${plural(pubTotal, { one: "# publication", other: "# publications" })}`,
  );
  const articleCountText = hasNextPage
    ? i18n._(msg`${articles.length}+ articles`)
    : i18n._(
        msg`${plural(articles.length, { one: "# article", other: "# articles" })}`,
      );

  const hint = hasQuery
    ? pubsPending || articlesPending
      ? t`Searching…`
      : t`${publicationCountText} · ${articleCountText}`
    : t`Try "climate", "typography", or a handle like stdout.dev`;

  const remainingPublications = pubTotal - publications.length;
  const showEmpty =
    resultsReady && publications.length === 0 && articles.length === 0;
  const showPublicationSection =
    pubsPending || publications.length > 0 || pubTotal > 0;
  const showArticleSection = articlesPending || articles.length > 0;
  const publicationSectionFirst = showPublicationSection;
  const articleSectionFirst = !showPublicationSection && showArticleSection;

  return (
    <ReaderContent>
      <SearchChrome
        input={input}
        hint={hint}
        inputRef={inputRef}
        onInputChange={setInput}
        onClear={() => {
          setInput("");
          inputRef.current?.focus();
        }}
      />

      {hasQuery ? (
        <div {...stylex.props(styles.results)}>
          {showPublicationSection ? (
            pubsPending ? (
              <PublicationResultsSkeleton
                isFirstSection={publicationSectionFirst}
              />
            ) : (
              <section
                {...stylex.props(
                  styles.section,
                  publicationSectionFirst && styles.sectionFirst,
                )}
              >
                <SectionHead
                  kicker={<Trans>Publications</Trans>}
                  title={formatMatchCount(i18n, publications.length, pubTotal)}
                />
                {publications.map((pub, index) => (
                  <PubDirectoryRow
                    key={pub.uri}
                    pub={pub}
                    isFirstInSection={index === 0}
                    isLast={
                      index === publications.length - 1 && pubNextOffset == null
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
                      {loadingMorePubs ? (
                        <Trans>Loading…</Trans>
                      ) : (
                        <Trans>
                          Load more ({remainingPublications} remaining)
                        </Trans>
                      )}
                    </Button>
                  </div>
                )}
              </section>
            )
          ) : null}

          {showArticleSection ? (
            articlesPending ? (
              <ArticleResultsSkeleton isFirstSection={articleSectionFirst} />
            ) : (
              <section
                {...stylex.props(
                  styles.section,
                  articleSectionFirst && styles.sectionFirst,
                )}
              >
                <SectionHead
                  kicker={<Trans>Articles</Trans>}
                  title={formatShownCount(i18n, articles.length, hasNextPage)}
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
                <FeedLoadMore
                  hasMore={hasNextPage}
                  isLoading={isFetchingNextPage}
                  onLoadMore={loadMoreArticles}
                  itemCount={articles.length}
                />
              </section>
            )
          ) : null}

          {showEmpty ? (
            <p {...stylex.props(styles.emptyNote)}>
              <Trans>
                Nothing matches &ldquo;{debouncedQ}&rdquo; — yet. The network is
                always growing.
              </Trans>
            </p>
          ) : null}
        </div>
      ) : null}
    </ReaderContent>
  );
}
