"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { SearchField } from "@standard-reader/design-system/search-field";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useDeferredValue, useMemo, useState } from "react";

import { topicsApi } from "#/integrations/tanstack-query/api-topics.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { SITE_NAME, siteSocialMeta } from "#/lib/site-metadata";
import { useFormatters } from "#/lib/use-formatters";

import { Masthead, ReaderContent } from "../components/reader/primitives";
import { TopicGridList } from "../components/reader/topic-cards";

export const Route = createFileRoute("/_layout/topics/")({
  staleTime: 60_000,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      topicsApi.getAllTopicsQueryOptions(),
    );
  },
  head: () => {
    const baseUrl = getPublicUrlClient();
    return {
      meta: siteSocialMeta({
        title: `Topics · ${SITE_NAME}`,
        description:
          "Browse the topic topics the network's writing clusters into.",
        url: `${baseUrl.replace(/\/$/, "")}/topics`,
      }),
    };
  },
  component: TopicsIndex,
});

/**
 * Match a topic against a search term.
 *
 * Searches the sub-area tags as well as the name and description, because the
 * word a reader has in mind is usually a tag ("vinyl", "kubernetes") rather
 * than the topic's derived name.
 */
function matchesQuery(
  topic: { name: string; description: string | null; tags: Array<string> },
  query: string,
): boolean {
  if (!query) return true;
  const haystack = [topic.name, topic.description ?? "", ...topic.tags]
    .join(" ")
    .toLowerCase();
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function TopicsIndex() {
  const { t } = useLingui();
  const fmt = useFormatters();
  const [search, setSearch] = useState("");
  // The whole set is already client-side, so filtering is instant — defer only
  // so a long list re-renders without blocking keystrokes.
  const deferredSearch = useDeferredValue(search);

  const { data: topics } = useSuspenseQuery(
    topicsApi.getAllTopicsQueryOptions(),
  );

  const query = deferredSearch.trim().toLowerCase();
  const visible = useMemo(
    () => topics.filter((topic) => matchesQuery(topic, query)),
    [topics, query],
  );

  return (
    <ReaderContent>
      <Masthead
        title={<Trans>Topics</Trans>}
        dek={
          <Trans>
            Topic areas the network&apos;s writing clusters into, rebuilt as it
            grows. Each one gathers related tags, the publications writing about
            them, and everything they&apos;ve published.
          </Trans>
        }
        metaLabel={t`Topics`}
        metaValue={fmt.compactNumber(topics.length)}
      />

      {/* The search is the page's primary control — there is nothing else to
          do here — so it spans the column rather than hiding in a corner. */}
      <div {...stylex.props(styles.toolbar)}>
        <SearchField
          aria-label={t`Search topics`}
          placeholder={t`Search by name or topic — “vinyl”, “kubernetes”…`}
          value={search}
          onChange={setSearch}
          size="lg"
          style={styles.search}
        />
        <p aria-live="polite" {...stylex.props(styles.count)}>
          {query ? (
            <Plural value={visible.length} one="# topic" other="# topics" />
          ) : null}
        </p>
      </div>

      {visible.length === 0 ? (
        <p {...stylex.props(styles.empty)}>
          <Trans>No topics match your search.</Trans>
        </p>
      ) : (
        <TopicGridList topics={visible} layout="grid" aria-label={t`Topics`} />
      )}
    </ReaderContent>
  );
}

const styles = stylex.create({
  toolbar: {
    display: "flex",
    flexDirection: "column",
    marginBottom: spacing["6"],
    rowGap: spacing["2"],
  },
  search: {
    minWidth: 0,
    width: "100%",
  },
  count: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    marginBottom: spacing["0"],
    // Reserve the line so results appearing does not shift the grid.
    minHeight: spacing["5"],
    marginTop: spacing["0"],
  },
  empty: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontStyle: "italic",
    marginTop: spacing["6"],
  },
});
