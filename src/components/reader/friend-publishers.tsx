"use client";

import { Plural, Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import { uiColor } from "../../design-system/theme/color.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  lineHeight,
} from "../../design-system/theme/typography.stylex";

const styles = stylex.create({
  note: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    overflowWrap: "anywhere",
  },
});

/** Count line above the list: "8 publications · 6 people you follow". */
export function FriendPublishersSummary({
  people,
  publicationCount,
}: {
  people: number;
  publicationCount: number;
}) {
  return (
    <p {...stylex.props(styles.note)}>
      <Plural
        value={publicationCount}
        one="# publication"
        other="# publications"
      />
      {" · "}
      <Plural
        value={people}
        one="# person you follow"
        other="# people you follow"
      />
    </p>
  );
}

/**
 * Shown when the Bluesky AppView didn't answer. Distinct from the empty state
 * on purpose — "we couldn't check" must never read as "you know nobody here".
 */
export function FriendPublishersDegradedNote() {
  return (
    <p {...stylex.props(styles.note)}>
      <Trans>
        Bluesky didn't answer in time, so this list may be incomplete. Reload to
        try again.
      </Trans>
    </p>
  );
}
