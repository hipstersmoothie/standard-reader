"use client";

import { useLingui } from "@lingui/react/macro";

import type { UnfinishedReadingItem } from "#/integrations/tanstack-query/api-reader.functions";

import { ArticleRow } from "./cards";
import { SectionHead } from "./primitives";

/**
 * The shelf of articles this reader is in the middle of.
 *
 * It sits above the history list rather than inside it because the two answer
 * different questions — history is "what have I read", this is "what am I still
 * reading" — and only one of them is actionable.
 *
 * The rows are deliberately the same rows as the list below. What separates the
 * sections is the heading plus the one fact these rows carry and those don't
 * (how far in the reader got, leading each meta line). Giving the shelf its own
 * surface or bracketing rules would add chrome to a page that has none, and the
 * page already uses rules to separate rows.
 */
export function ContinueReading({
  items,
}: {
  items: Array<UnfinishedReadingItem>;
}) {
  const { t } = useLingui();

  // An article can drop out of the read-model (deleted, or never mirrored);
  // there is nothing to continue in that case, so it just isn't on the shelf.
  // `flatMap` rather than `filter` so the narrowed `article` survives.
  const readable = items.flatMap((item) =>
    item.article ? [{ ...item, article: item.article }] : [],
  );
  if (readable.length === 0) return null;

  return (
    <>
      <SectionHead title={t`Continue reading`} size="md" />
      {readable.map((item, index) => (
        <ArticleRow
          key={item.documentUri}
          article={item.article}
          isFirstInSection={index === 0}
          showSaveButton={false}
          progress={item.progress}
        />
      ))}
    </>
  );
}
