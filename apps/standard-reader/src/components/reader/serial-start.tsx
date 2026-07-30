"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { size as boxSize } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { BookOpen } from "lucide-react";

import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";
import type { SerialPublication } from "#/lib/publication/serial";
import { useOpenLinks } from "#/lib/use-open-links";

import { ButtonLink } from "../router-links";
import { documentLinkParams } from "./format";

const styles = stylex.create({
  row: {
    alignItems: "center",
    flexWrap: "wrap",
  },
  note: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    lineHeight: lineHeight.sm,
    maxWidth: "44ch",
  },
  icon: {
    height: boxSize.md,
    width: boxSize.md,
  },
  externalStart: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    textUnderlineOffset: spacing["0.5"],
  },
});

/**
 * "Start from the beginning" for a serial publication.
 *
 * The archive above it is already listed oldest-first (the publisher asked for
 * forwards reading — see `#/lib/publication/serial`), so `first` is issue #1 on
 * the unfiltered view. A comic opens in the page-flip reader; a book as an
 * article.
 */
export function SerialStart({
  serial,
  first,
  isFullArchive,
}: {
  serial: SerialPublication;
  first: ArticleCard | undefined;
  /**
   * Whether the list below is the whole archive. Under a reader-scoped filter
   * (unread / read / recommended) the first row is the first *matching* post,
   * not issue #1, so the button would lie — the note stands on its own.
   */
  isFullArchive: boolean;
}) {
  const { t } = useLingui();
  const { openExternally } = useOpenLinks();

  const note =
    serial.kind === "comic" ? (
      <Trans>
        A serial comic — these issues read in order, from the first.
      </Trans>
    ) : (
      <Trans>A serial — these chapters read in order, from the first.</Trans>
    );

  if (!first || !isFullArchive) {
    return <span {...stylex.props(styles.note)}>{note}</span>;
  }

  const label =
    serial.kind === "comic"
      ? t`Start from issue one`
      : t`Start from chapter one`;
  const params = documentLinkParams(first.uri);

  // "Open on original site": link out rather than into the in-app reader.
  if ((openExternally || !params) && first.canonicalUrl) {
    return (
      <Flex direction="row" gap="4xl" style={styles.row}>
        <a
          href={first.canonicalUrl}
          target="_blank"
          rel="noreferrer"
          {...stylex.props(styles.externalStart)}
        >
          {label}
        </a>
        <span {...stylex.props(styles.note)}>{note}</span>
      </Flex>
    );
  }

  if (!params) {
    return <span {...stylex.props(styles.note)}>{note}</span>;
  }

  // A comic issue with no pages has nothing to flip through, and a document with
  // no in-app body has to open on the publication's own site — both fall back to
  // the reading view, which handles the bounce.
  const toComic = serial.kind === "comic" && first.hasRenderableBody;

  return (
    <Flex direction="row" gap="4xl" style={styles.row}>
      <ButtonLink
        variant="secondary"
        to={toComic ? "/comic/$did/$rkey" : "/a/$did/$rkey"}
        params={params}
      >
        <BookOpen
          aria-hidden
          size={16}
          strokeWidth={1.75}
          {...stylex.props(styles.icon)}
        />
        {label}
      </ButtonLink>
      <span {...stylex.props(styles.note)}>{note}</span>
    </Flex>
  );
}
