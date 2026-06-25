"use client";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { labelerApi } from "#/integrations/tanstack-query/api-labelers.functions";

import { Alert } from "../../design-system/alert";
import { Badge } from "../../design-system/badge";
import {
  gap,
  verticalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";

/**
 * Surfaces labels from the reader's subscribed labelers on a document: a badge
 * for every label, plus a warning when the reader set the label to blur/hide.
 * (Feed-level hiding is handled separately; on the article page the body is
 * still shown beneath the notice — you navigated here intentionally.)
 */
export function DocumentLabelNotice({ uri }: { uri: string }) {
  const { data } = useQuery(labelerApi.getDocumentLabelsQueryOptions(uri));
  const labels = data?.labels ?? [];
  if (labels.length === 0) return null;

  const flagged = labels.filter((l) => l.visibility !== "ignore");
  const anyHide = flagged.some((l) => l.visibility === "hide");
  const vals = [...new Set(labels.map((l) => l.val))];

  return (
    <div {...stylex.props(styles.wrap)}>
      {flagged.length > 0 ? (
        <Alert
          variant={anyHide ? "critical" : "warning"}
          title={
            anyHide
              ? "Hidden by a labeler you subscribe to"
              : "Labeled by a labeler you subscribe to"
          }
        >
          {[...new Set(flagged.map((l) => l.val))].join(", ")}
        </Alert>
      ) : null}
      <div {...stylex.props(styles.badges)}>
        {vals.map((val) => (
          <Badge key={val} variant="warning">
            {val}
          </Badge>
        ))}
      </div>
    </div>
  );
}

const styles = stylex.create({
  wrap: {
    gap: gap.sm,
    display: "flex",
    flexDirection: "column",
    marginBlockEnd: verticalSpace.lg,
  },
  badges: {
    gap: gap.sm,
    display: "flex",
    flexWrap: "wrap",
  },
});
