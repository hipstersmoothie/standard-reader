"use client";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { searchApi } from "#/integrations/tanstack-query/api-search.functions";
import { Search as SearchIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

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
const SEARCH_LIMIT = 20;
const SKELETON_ROWS = 4;

const searchSchema = z.object({
  q: z.string().optional(),
});

export const Route = createFileRoute("/_layout/search")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ q: search.q?.trim() ?? "" }),
  loader: async ({ context, deps }) => {
    if (deps.q) {
      await context.queryClient.ensureQueryData(
        searchApi.searchQueryOptions({ q: deps.q, limit: SEARCH_LIMIT }),
      );
    }
  },
  component: Search,
});

const styles = stylex.create({
  header: {
    paddingTop: spacing["10"],
  },
  searchField: {
    alignItems: "center",
    borderBottomColor: uiColor.border3,
    borderBottomStyle: "solid",
    borderBottomWidth: 2,
    columnGap: spacing["3.5"],
    display: "flex",
    marginBottom: spacing["2"],
    paddingBottom: spacing["4"],
    paddingTop: spacing["4"],
    rowGap: spacing["3.5"],
  },
  searchIcon: {
    color: uiColor.text1,
    flexShrink: 0,
  },
  searchInput: {
    backgroundColor: "transparent",
    borderStyle: "none",
    color: uiColor.text2,
    flex: 1,
    fontFamily: fontFamily.serif,
    fontSize: {
      default: fontSize["2xl"],
      "@media (min-width: 48rem)": fontSize["4xl"],
    },
    minWidth: 0,
    outlineStyle: "none",
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
  emptyNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    paddingBottom: spacing["8"],
    paddingTop: spacing["8"],
    textAlign: "center",
  },
  articleSkeleton: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    columnGap: gap["2xl"],
    display: "grid",
    gridTemplateColumns: "1fr auto",
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

function Search() {
  const { q: urlQ = "" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState(urlQ);
  const [debouncedQ, setDebouncedQ] = useState(urlQ.trim());

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

  const { data, isFetching } = useQuery({
    ...searchApi.searchQueryOptions({ q: debouncedQ, limit: SEARCH_LIMIT }),
  });

  const trimmedInput = input.trim();
  const hasQuery = debouncedQ.length > 0;
  const isSearching =
    hasQuery && (trimmedInput !== debouncedQ || (isFetching && !data));

  const publications = data?.publications ?? [];
  const articles = data?.articles ?? [];

  const hint = hasQuery
    ? isSearching
      ? "Searching…"
      : `${publications.length} publications · ${articles.length} articles`
    : 'Try "climate", "typography", or a handle like stdout.dev';

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
              {publications.length > 0 ? (
                <section {...stylex.props(styles.section, styles.sectionFirst)}>
                  <SectionHead
                    kicker="Publications"
                    title={`${publications.length} matches`}
                  />
                  {publications.map((pub, index) => (
                    <PubDirectoryRow
                      key={pub.uri}
                      pub={pub}
                      isFirstInSection={index === 0}
                      isLast={index === publications.length - 1}
                    />
                  ))}
                </section>
              ) : null}

              {articles.length > 0 ? (
                <section {...stylex.props(styles.section)}>
                  <SectionHead
                    kicker="Articles"
                    title={`${articles.length} matches`}
                  />
                  {articles.map((article, index) => (
                    <ArticleRow
                      key={article.uri}
                      article={article}
                      isFirstInSection={index === 0}
                    />
                  ))}
                </section>
              ) : null}

              {publications.length === 0 && articles.length === 0 ? (
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
