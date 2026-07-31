"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import type { ComicIssue, ComicPage } from "#/server/reader/comic";

/**
 * Issues loaded per chunk. Mirrors the server's window size so a chunk request
 * maps to exactly one cache entry.
 */
const CHUNK_ISSUES = 5;

/**
 * Chunks kept loaded on each side of the reader's position. One ahead is what
 * makes a page turn instant at a chunk boundary; one behind keeps paging back
 * from a boundary just as smooth.
 */
const CHUNK_RADIUS = 1;

export interface ComicPagesState {
  /** The publication's issues with their page offsets; empty until loaded. */
  issues: Array<ComicIssue>;
  /** Every page in the publication, known from the spine alone. */
  totalPages: number;
  /** Pages fetched so far, by absolute index. */
  pages: Map<number, ComicPage>;
  /** True until the spine resolves — before that there is no page count. */
  isSpinePending: boolean;
  /** True while the chunk covering the current page is still in flight. */
  isPagePending: boolean;
}

/** The issue containing an absolute page index, via the spine's offsets. */
export function issueAtPage(
  issues: Array<ComicIssue>,
  index: number,
): ComicIssue | null {
  for (const issue of issues) {
    if (index < issue.pageOffset + issue.pageCount) {
      return index >= issue.pageOffset ? issue : null;
    }
  }
  return null;
}

/** Absolute index of an issue's first page, or 0 when it isn't in the spine. */
export function pageOfIssue(
  issues: Array<ComicIssue>,
  issueUri: string,
): number {
  return issues.find((issue) => issue.uri === issueUri)?.pageOffset ?? 0;
}

function chunkForIssueIndex(issueIndex: number): number {
  return Math.floor(issueIndex / CHUNK_ISSUES) * CHUNK_ISSUES;
}

/**
 * The comic's pages, streamed.
 *
 * The spine (every issue's title and length) loads once and is what makes the
 * whole publication addressable by a single page number before any body has been
 * fetched — the page counter and the scrubber are correct immediately. Only the
 * chunks around the reader's position are then fetched, and they accumulate:
 * paging back through a comic re-reads pages already in the cache rather than
 * re-fetching them.
 */
export function useComicPages(
  publicationUri: string | null,
  currentIndex: number,
): ComicPagesState {
  const { data: spine, isPending: isSpinePending } = useQuery({
    ...publicationApi.getComicSpineQueryOptions(publicationUri ?? ""),
    enabled: Boolean(publicationUri),
  });

  const issues = useMemo(() => spine?.issues ?? [], [spine]);

  // Which chunks to hold open: the one containing the current page, plus its
  // neighbours. Derived from the spine, so it costs nothing before the pages
  // themselves arrive.
  const chunkOffsets = useMemo(() => {
    if (issues.length === 0) return [];
    const issueIndex = Math.max(
      0,
      issues.findIndex(
        (issue) => currentIndex < issue.pageOffset + issue.pageCount,
      ),
    );
    const center = chunkForIssueIndex(issueIndex);
    const offsets: Array<number> = [];
    for (let step = -CHUNK_RADIUS; step <= CHUNK_RADIUS; step += 1) {
      const offset = center + step * CHUNK_ISSUES;
      if (offset >= 0 && offset < issues.length) offsets.push(offset);
    }
    return offsets;
  }, [currentIndex, issues]);

  const chunks = useQueries({
    queries: chunkOffsets.map((offset) =>
      publicationApi.getComicPagesQueryOptions(
        publicationUri ?? "",
        offset,
        CHUNK_ISSUES,
      ),
    ),
  });

  const pages = useMemo(() => {
    const byIndex = new Map<number, ComicPage>();
    for (const chunk of chunks) {
      for (const page of chunk.data?.pages ?? []) {
        byIndex.set(page.index, page);
      }
    }
    return byIndex;
  }, [chunks]);

  return {
    issues,
    totalPages: spine?.totalPages ?? 0,
    pages,
    isSpinePending: Boolean(publicationUri) && isSpinePending,
    // Only the page actually being looked at counts as pending; a neighbouring
    // chunk still loading is exactly the prefetch working as intended.
    isPagePending: !pages.has(currentIndex) && chunks.some((c) => c.isPending),
  };
}
