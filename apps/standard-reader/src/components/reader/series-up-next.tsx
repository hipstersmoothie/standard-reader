"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  AspectRatio,
  AspectRatioImage,
} from "@standard-reader/design-system/aspect-ratio";
import { Flex } from "@standard-reader/design-system/flex";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import type { SerialPublication } from "#/lib/publication/serial";
import { useOpenLinks } from "#/lib/use-open-links";
import { useReadingTypography } from "#/lib/use-reading-typography";
import type { SeriesNeighbor } from "#/server/reader/series";

import { articleMeasureStyle } from "./content/body-styles";
import { SectionHead } from "./primitives";

const COVER_ASPECT_RATIO = 3 / 4;

const styles = stylex.create({
  section: {
    boxSizing: "border-box",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    paddingInlineEnd: spacing["6"],
    paddingInlineStart: spacing["6"],
    paddingBottom: spacing["8"],
    width: "100%",
  },
  card: {
    textDecoration: "none",
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": uiColor.component1,
    },
    color: "inherit",
    columnGap: gap["5xl"],
    display: "flex",
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color, border-color",
    borderColor: { default: uiColor.border1, ":hover": uiColor.border2 },
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    padding: spacing["4"],
  },
  cover: {
    flexShrink: 0,
    width: spacing["24"],
  },
  body: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.xs,
    // Single-line TITLE in a UI row: isolate so its characters order correctly
    // without dragging the row's alignment under an RTL UI.
    unicodeBidi: "isolate",
  },
  meta: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.7rem",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.wide,
    textTransform: "uppercase",
  },
  dek: {
    color: uiColor.text1,
    display: "-webkit-box",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    lineHeight: lineHeight.sm,
    overflow: "hidden",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
  chevron: {
    color: uiColor.text1,
    flexShrink: 0,
  },
  caughtUp: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontStyle: "italic",
    textAlign: "center",
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    paddingBottom: spacing["6"],
    paddingTop: spacing["6"],
  },
});

/**
 * A serial's next issue, as a link. Comics open in the page-flip reader, books
 * in the ordinary reading view — and either falls back to the publication's own
 * site for readers who chose to open links there.
 */
function NextIssueCard({
  next,
  serial,
}: {
  next: SeriesNeighbor;
  serial: SerialPublication;
}) {
  const { t } = useLingui();
  const { openExternally } = useOpenLinks();

  const cover = next.imageUrl ? (
    <AspectRatio aspectRatio={COVER_ASPECT_RATIO} style={styles.cover}>
      <AspectRatioImage
        src={next.imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
      />
    </AspectRatio>
  ) : null;

  const body = (
    <>
      {cover}
      <Flex direction="column" gap="lg" style={styles.body}>
        <span {...stylex.props(styles.meta)}>
          {serial.kind === "comic" ? (
            <Trans>Next issue</Trans>
          ) : (
            <Trans>Next chapter</Trans>
          )}
          {next.pageCount > 0 && serial.kind === "comic" ? (
            <>
              <span aria-hidden> · </span>
              <Plural value={next.pageCount} one="# page" other="# pages" />
            </>
          ) : null}
        </span>
        <span {...stylex.props(styles.title)}>{next.title}</span>
        {next.description?.trim() ? (
          <span dir="auto" {...stylex.props(styles.dek)}>
            {next.description}
          </span>
        ) : null}
      </Flex>
      <ArrowRight
        aria-hidden
        size={20}
        strokeWidth={1.75}
        {...stylex.props(styles.chevron)}
      />
    </>
  );

  // "Open on original site": skip the in-app reader entirely.
  if (openExternally && next.canonicalUrl) {
    return (
      <a
        href={next.canonicalUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={t`Read the next instalment: ${next.title}`}
        {...stylex.props(styles.card)}
      >
        {body}
      </a>
    );
  }

  const params = { did: next.did, rkey: next.rkey };
  // A comic issue with no pages has nothing to flip through — send it to the
  // reading view rather than into an empty comic reader.
  const toComic = serial.kind === "comic" && next.pageCount > 0;

  return (
    <Link
      to={toComic ? "/comic/$did/$rkey" : "/a/$did/$rkey"}
      params={params}
      aria-label={t`Read the next instalment: ${next.title}`}
      {...stylex.props(styles.card)}
    >
      {body}
    </Link>
  );
}

/**
 * "Up next" for a serial publication — the following issue, or a note that the
 * reader has caught up with the series.
 *
 * Only serials get this: an ordinary blog's next post is "more from", which
 * `ArticleBelowFold` already renders as a list rather than a single
 * continuation. Loads client-side after the article paints, like the other
 * below-the-fold rails.
 */
export function SeriesUpNext({ documentUri }: { documentUri: string }) {
  const { t } = useLingui();
  const { preference } = useReadingTypography();
  const { data: series } = useQuery(
    publicationApi.getSeriesContextQueryOptions(documentUri),
  );

  const serial = series?.serial;
  if (!series || !serial) return null;

  return (
    <div {...stylex.props(styles.section, articleMeasureStyle(preference))}>
      <Flex direction="column">
        <SectionHead
          kicker={
            series.total > 0 ? (
              <Trans>
                {series.position} of {series.total}
              </Trans>
            ) : undefined
          }
          title={series.next ? t`Up next` : t`The end, for now`}
          size="md"
        />
        {series.next ? (
          <NextIssueCard next={series.next} serial={serial} />
        ) : (
          <div {...stylex.props(styles.caughtUp)}>
            {serial.kind === "comic" ? (
              <Trans>You’ve read every issue published so far.</Trans>
            ) : (
              <Trans>You’ve read every chapter published so far.</Trans>
            )}
          </div>
        )}
      </Flex>
    </div>
  );
}
