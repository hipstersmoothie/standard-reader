"use client";

import { Trans } from "@lingui/react/macro";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";

import type { LeafletMembersOnlyDelimiterBlock } from "#/lib/leaflet/types";

import { ReadOnPlatformButton } from "../../read-on-platform";

const styles = stylex.create({
  notice: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "dashed",
    borderTopWidth: 1,
    gap: gap["2xl"],
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    textAlign: "center",
    marginBottom: spacing["6"],
    marginTop: spacing["8"],
    paddingTop: spacing["8"],
  },
  title: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  body: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
});

/**
 * `pub.leaflet.blocks.membersOnlyDelimiter` — where a post's members-only part
 * begins. That part is not in the public record, so there is nothing more to
 * render: say so plainly instead of letting the article just stop.
 */
export function LeafletMembersOnlyBlockView({
  block,
  articleUrl,
}: {
  block: LeafletMembersOnlyDelimiterBlock;
  /** The post on its own site, where a member can read the rest. */
  articleUrl?: string | null;
}) {
  const paid = block.audience === "paid" || block.audience === "tiers";

  return (
    <aside {...stylex.props(styles.notice)}>
      <p {...stylex.props(styles.title)}>
        {paid ? (
          <Trans>The rest of this post is for paid members</Trans>
        ) : (
          <Trans>The rest of this post is for subscribers</Trans>
        )}
      </p>
      <p {...stylex.props(styles.body)}>
        <Trans>Members can keep reading on the original site.</Trans>
      </p>
      {articleUrl ? (
        <ReadOnPlatformButton platform="leaflet" href={articleUrl} />
      ) : null}
    </aside>
  );
}
