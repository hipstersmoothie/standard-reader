"use client";

import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import { notesApi } from "#/integrations/tanstack-query/api-notes.functions";
import { useFormatters } from "#/lib/use-formatters";

// A quiet editorial block, not a card — it sits above the writing feed and is
// set off by the same 1px bottom rule the article rows use, so it recedes into
// the page's rhythm rather than standing out as boxed UI chrome.
const styles = stylex.create({
  block: {
    display: "block",
    textDecoration: "none",
    color: "inherit",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["7"],
  },
  labelRow: {
    display: "flex",
    alignItems: "baseline",
    columnGap: gap.md,
    marginBottom: spacing["3"],
  },
  label: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  time: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
  text: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    lineHeight: lineHeight.sm,
    marginTop: spacing["0"],
    marginBottom: spacing["0"],
    maxWidth: "60ch",
    textDecoration: {
      default: "none",
      ":hover": "underline",
    },
    textDecorationThickness: "1px",
    textUnderlineOffset: "3px",
    // eslint-disable-next-line @stylexjs/valid-styles
    textWrap: "pretty",
  },
});

/**
 * The publication's most recent note, shown atop its profile as a quiet
 * editorial lead-in. Links out to the note on pckt. Renders nothing when the
 * publication has no note.
 */
export function PublicationLatestNote({
  publicationUri,
}: {
  publicationUri: string;
}) {
  const fmt = useFormatters();
  const { data: note } = useQuery(
    notesApi.getPublicationLatestNoteQueryOptions(publicationUri),
  );

  if (!note) return null;

  return (
    <a
      href={note.url}
      target="_blank"
      rel="noreferrer"
      {...stylex.props(styles.block)}
    >
      <div {...stylex.props(styles.labelRow)}>
        <span {...stylex.props(styles.label)}>
          <Trans>Latest note</Trans>
        </span>
        <time dateTime={note.createdAt} {...stylex.props(styles.time)}>
          {fmt.relativeTime(note.createdAt)}
        </time>
      </div>
      <p {...stylex.props(styles.text)}>{note.text}</p>
    </a>
  );
}
