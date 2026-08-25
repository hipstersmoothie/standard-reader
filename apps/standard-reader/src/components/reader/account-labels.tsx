"use client";

import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import { labelerApi } from "#/integrations/tanstack-query/api-labelers.functions";
import type { ArticleCardLabel } from "#/integrations/tanstack-query/api-shapes";

import { LabelerPill } from "./labeler-pill";

/**
 * Labels a subscribed labeler has applied to an **account** — shown on author
 * and publication headers.
 *
 * Distinct from the labels on an article card: those describe one document,
 * these describe the publisher. Labelers on the wider network (pub-search's
 * `bulk-generated`, Bluesky moderation services) label accounts rather than
 * documents, so without this their labels would sync into the read-model and
 * never render anywhere.
 *
 * Labels the reader set to `hide` are dropped — a hidden account's page is
 * still reachable by direct link, but the pill would be noise given the reader
 * already asked not to see this publisher. `warn` and `ignore` both render;
 * the pill itself is informational, and its hover card carries the labeler's
 * own description of what the label means.
 */
export function AccountLabels({
  labels,
}: {
  labels: Array<ArticleCardLabel> | undefined;
}) {
  const visible = labels?.filter((label) => label.visibility !== "hide") ?? [];
  if (visible.length === 0) return null;

  return (
    <div {...stylex.props(styles.row)}>
      {visible.map((label) => (
        <LabelerPill
          key={`${label.src} ${label.val}`}
          src={label.src}
          val={label.val}
        />
      ))}
    </div>
  );
}

/**
 * {@link AccountLabels} for surfaces whose payload isn't viewer-scoped and so
 * can't carry labels — notably the publication header, which is cached across
 * readers. Fetches the reader's own view in a separate, reader-keyed query.
 */
export function AccountLabelsForDid({
  did,
  readerScope,
}: {
  did: string;
  readerScope: string;
}) {
  const { data } = useQuery(
    labelerApi.getAccountLabelsQueryOptions(did, readerScope),
  );
  return <AccountLabels labels={data?.labels} />;
}

const styles = stylex.create({
  row: {
    gap: gap.sm,
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
  },
});
