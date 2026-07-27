"use client";

import { useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { Flex } from "@standard-reader/design-system/flex";
import { verticalSpace } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import * as stylex from "@stylexjs/stylex";

import { useFeedPagination } from "#/lib/use-feed-preferences";

import { useInfiniteScrollSentinel } from "./use-infinite-scroll-sentinel";

const styles = stylex.create({
  /** Zero-height probe the IntersectionObserver watches, below the last row. */
  sentinel: {
    height: 1,
    marginTop: spacing["6"],
    width: "100%",
  },
  buttonRow: {
    marginTop: verticalSpace["3xl"],
  },
});

/**
 * The "there is more below" control for every paginated list in the app.
 *
 * Which one it is depends on the reader's pagination preference
 * (`#/lib/feed-preferences`): `infinite` (the default) renders the
 * IntersectionObserver sentinel that pulls the next page as it nears the
 * viewport; `button` renders an explicit "Load more" button and never observes,
 * so the list only grows when the reader asks.
 *
 * Call sites keep their own loading and end-of-list markup — this is a drop-in
 * replacement for the bare sentinel `div` they used to render, nothing more.
 */
export function FeedLoadMore({
  hasMore,
  isLoading = false,
  onLoadMore,
  itemCount,
  label,
}: {
  /** More pages exist. When false nothing renders — no dead button, no probe. */
  hasMore: boolean;
  /** A page is in flight; drives the button's spinner. */
  isLoading?: boolean;
  onLoadMore: () => void;
  /** Re-arms the observer after each page lands. */
  itemCount: number;
  /** Overrides the default "Load more" button copy. */
  label?: string;
}) {
  const { t } = useLingui();
  const { mode } = useFeedPagination();
  const sentinelRef = useInfiniteScrollSentinel(
    onLoadMore,
    hasMore && mode === "infinite",
    itemCount,
  );

  if (!hasMore) return null;

  if (mode === "button") {
    return (
      <Flex justify="center" style={styles.buttonRow}>
        <Button variant="secondary" isPending={isLoading} onPress={onLoadMore}>
          {label ?? t`Load more`}
        </Button>
      </Flex>
    );
  }

  return (
    <div ref={sentinelRef} aria-hidden {...stylex.props(styles.sentinel)} />
  );
}
