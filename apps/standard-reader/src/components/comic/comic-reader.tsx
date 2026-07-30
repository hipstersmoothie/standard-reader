"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { IconButton } from "@standard-reader/design-system/icon-button";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, FileText, X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import type { DocumentImage } from "#/lib/document/images";
import { documentImages } from "#/lib/document/images";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";
import type { SeriesContext } from "#/server/reader/series";

import { documentLinkParams, publicationLinkParams } from "../reader/format";
import { applyMarkReadOptimisticUpdate } from "../reader/read-optimistic";
import { ButtonLink, IconButtonLink } from "../router-links";

/**
 * The theater is one fixed look in both colour schemes: art is the whole point,
 * and a page of comic reads against near-black whatever the rest of the app is
 * doing. Same reasoning (and the same shape of literal) as the design system's
 * lightbox, which is the other surface that exists to show one image.
 */
const THEATER_BACKDROP = "light-dark(rgb(9, 8, 10), rgb(4, 4, 6))";
const THEATER_CHROME = "rgba(255, 255, 255, 0.62)";
const THEATER_CHROME_STRONG = "rgba(255, 255, 255, 0.92)";
const THEATER_RULE = "rgba(255, 255, 255, 0.14)";
const THEATER_SURFACE = "rgba(255, 255, 255, 0.08)";

/** Pages kept warm ahead of the current one so a flip never waits on a fetch. */
const PRELOAD_AHEAD = 2;

/** Horizontal travel (px) that counts as a swipe rather than a tap. */
const SWIPE_THRESHOLD_PX = 44;

const ICON_SIZE = 18;
const ICON_STROKE = 1.75;

const styles = stylex.create({
  theater: {
    inset: 0,
    backgroundColor: THEATER_BACKDROP,
    display: "flex",
    flexDirection: "column",
    // `dvh`, so collapsing mobile browser chrome doesn't crop the page.
    height: "100dvh",
    position: "fixed",
    width: "100%",
  },
  bar: {
    alignItems: "center",
    columnGap: gap["2xl"],
    display: "flex",
    flexShrink: 0,
    paddingInlineEnd: spacing["3"],
    paddingInlineStart: spacing["3"],
    paddingBottom: spacing["2"],
    paddingTop: spacing["2"],
  },
  topBar: {
    borderBottomColor: THEATER_RULE,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
  },
  bottomBar: {
    borderTopColor: THEATER_RULE,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    justifyContent: "center",
  },
  // The theater's palette is fixed, so the design-system buttons in its chrome
  // take these colours instead of the app's UI scale.
  chromeControl: {
    backgroundColor: {
      default: "transparent",
      ":hover": THEATER_SURFACE,
      ":is([data-disabled])": "transparent",
    },
    color: THEATER_CHROME_STRONG,
    flexShrink: 0,
    opacity: { default: 1, ":is([data-disabled])": 0.35 },
    borderColor: THEATER_RULE,
    boxShadow: "none",
  },
  titles: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  kicker: {
    color: THEATER_CHROME,
    fontFamily: fontFamily.sans,
    fontSize: "0.65rem",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.wide,
    overflow: "hidden",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    // Single-line label in fixed chrome: order its own characters, but keep the
    // bar's alignment.
    unicodeBidi: "isolate",
    whiteSpace: "nowrap",
  },
  title: {
    color: THEATER_CHROME_STRONG,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.xs,
    overflow: "hidden",
    textOverflow: "ellipsis",
    unicodeBidi: "isolate",
    whiteSpace: "nowrap",
  },
  stage: {
    alignItems: "center",
    display: "flex",
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    justifyContent: "center",
    minHeight: 0,
    overflow: "hidden",
    position: "relative",
    touchAction: "pan-y",
  },
  page: {
    objectFit: "contain",
    display: "block",
    maxHeight: "100%",
    maxWidth: "100%",
  },
  // Half-width invisible hit areas: the natural way to page through art on a
  // phone, and harmless on desktop, where the footer carries real controls.
  zone: {
    borderWidth: 0,
    cursor: "pointer",
    backgroundColor: "transparent",
    insetBlock: 0,
    padding: spacing["0"],
    position: "absolute",
    width: "50%",
  },
  zonePrev: {
    insetInlineStart: 0,
  },
  zoneNext: {
    insetInlineEnd: 0,
  },
  counter: {
    color: THEATER_CHROME,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: tracking.wide,
    minWidth: spacing["28"],
    textAlign: "center",
    unicodeBidi: "isolate",
  },
  endCard: {
    boxSizing: "border-box",
    maxWidth: "34rem",
    overflowY: "auto",
    paddingInlineEnd: spacing["5"],
    paddingInlineStart: spacing["5"],
    paddingBottom: spacing["8"],
    paddingTop: spacing["8"],
    textAlign: "center",
    width: "100%",
  },
  endKicker: {
    color: THEATER_CHROME,
    fontFamily: fontFamily.sans,
    fontSize: "0.68rem",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.wide,
    textTransform: "uppercase",
  },
  endTitle: {
    color: THEATER_CHROME_STRONG,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.xs,
    unicodeBidi: "isolate",
  },
  endCover: {
    objectFit: "cover",
    cornerShape: "squircle",
    borderColor: THEATER_RULE,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    height: "auto",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    maxWidth: spacing["40"],
    width: "100%",
  },
  endDek: {
    color: THEATER_CHROME,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    lineHeight: lineHeight.sm,
  },
  endActions: {
    alignItems: "center",
    columnGap: gap["2xl"],
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    rowGap: gap["2xl"],
  },
  nextLink: {
    textDecoration: "none",
    color: "inherit",
    display: "block",
  },
  emptyNote: {
    color: THEATER_CHROME,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    textAlign: "center",
    paddingInlineEnd: spacing["6"],
    paddingInlineStart: spacing["6"],
  },
});

/** The document's own reading view — a comic's author notes live there. */
function NotesAction({ article }: { article: ArticleDetail }) {
  const params = documentLinkParams(article.uri);
  if (!params) return null;
  return (
    <ButtonLink
      variant="tertiary"
      to="/a/$did/$rkey"
      params={params}
      search={{ view: "reader" }}
      style={styles.chromeControl}
    >
      <FileText aria-hidden size={ICON_SIZE} strokeWidth={ICON_STROKE} />
      <Trans>Read the notes</Trans>
    </ButtonLink>
  );
}

function AllIssuesAction({ publicationUri }: { publicationUri: string }) {
  const params = publicationLinkParams(publicationUri);
  if (!params) return null;
  return (
    <ButtonLink
      variant="tertiary"
      to="/p/$did/$rkey"
      params={params}
      style={styles.chromeControl}
    >
      <Trans>All issues</Trans>
    </ButtonLink>
  );
}

/**
 * What the reader sees after the last page: the next issue, or the end of the
 * series so far. The issue's own prose (a comic's author notes) is one link
 * away — the comic reader shows the art, the reading view shows the writing.
 */
function ComicEndCard({
  article,
  series,
}: {
  article: ArticleDetail;
  series: SeriesContext | null | undefined;
}) {
  const { t } = useLingui();
  const next = series?.next ?? null;

  return (
    <div {...stylex.props(styles.endCard)}>
      <Flex direction="column" gap="6xl">
        {next ? (
          <Link
            to={next.pageCount > 0 ? "/comic/$did/$rkey" : "/a/$did/$rkey"}
            params={{ did: next.did, rkey: next.rkey }}
            aria-label={t`Read the next issue: ${next.title}`}
            {...stylex.props(styles.nextLink)}
          >
            <Flex direction="column" gap="4xl">
              <span {...stylex.props(styles.endKicker)}>
                <Trans>Next issue</Trans>
              </span>
              {next.imageUrl ? (
                <img
                  src={next.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  {...stylex.props(styles.endCover)}
                />
              ) : null}
              <span {...stylex.props(styles.endTitle)}>{next.title}</span>
              {next.description?.trim() ? (
                <span dir="auto" {...stylex.props(styles.endDek)}>
                  {next.description}
                </span>
              ) : null}
            </Flex>
          </Link>
        ) : (
          <Flex direction="column" gap="4xl">
            <span {...stylex.props(styles.endKicker)}>
              <Trans>The end, for now</Trans>
            </span>
            <span {...stylex.props(styles.endTitle)}>
              <Trans>You’re caught up</Trans>
            </span>
            <span {...stylex.props(styles.endDek)}>
              <Trans>
                This is the latest issue. Subscribe to hear when the next one
                lands.
              </Trans>
            </span>
          </Flex>
        )}

        <div {...stylex.props(styles.endActions)}>
          <NotesAction article={article} />
          {article.publicationUri ? (
            <AllIssuesAction publicationUri={article.publicationUri} />
          ) : null}
        </div>
      </Flex>
    </div>
  );
}

export interface ComicReaderProps {
  article: ArticleDetail;
  series: SeriesContext | null | undefined;
  /** 1-based page number; `pages.length + 1` is the end card. */
  page: number;
  onPageChange: (page: number) => void;
  signedIn: boolean;
}

/**
 * A page-flip reader for one issue of a comic.
 *
 * The issue's pages are the images its body renders, in reading order
 * (`documentImages`) — the same list the article view would have drawn, shown
 * one page at a time instead of stacked in a column. Serial publications read
 * forwards (see `#/lib/publication/serial`), so "next" is always the following
 * page and, past the last one, the following issue.
 *
 * The current page lives in the URL, so a reload or a shared link lands on the
 * same page. Page turns replace the history entry rather than stacking one, so
 * Back leaves the reader instead of walking every page in reverse.
 */
export function ComicReader({
  article,
  series,
  page,
  onPageChange,
  signedIn,
}: ComicReaderProps) {
  const { t } = useLingui();
  const pages = useMemo<Array<DocumentImage>>(
    () => documentImages(article),
    [article],
  );
  // One past the last page is the end card, so `pages.length + 1` is in range.
  const lastIndex = pages.length;
  const index = Math.min(Math.max(page - 1, 0), lastIndex);
  const atEnd = index === lastIndex;
  const current = pages[index];

  const queryClient = useQueryClient();
  const { enabled: trackReading } = useTrackReadingHistory();
  const { mutate: markRead } = useMutation(readerApi.markReadMutationOptions());
  const markedUriRef = useRef<string | null>(null);

  useEffect(() => {
    if (!signedIn || !trackReading || markedUriRef.current === article.uri) {
      return;
    }
    markedUriRef.current = article.uri;
    applyMarkReadOptimisticUpdate(
      queryClient,
      article.uri,
      article.publicationUri,
    );
    markRead(article.uri);
  }, [
    article.publicationUri,
    article.uri,
    markRead,
    queryClient,
    signedIn,
    trackReading,
  ]);

  const goTo = useCallback(
    (nextIndex: number) => {
      const clamped = Math.min(Math.max(nextIndex, 0), lastIndex);
      if (clamped === index) return;
      onPageChange(clamped + 1);
    },
    [index, lastIndex, onPageChange],
  );

  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const goPrevious = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key) {
        case " ":
        case "ArrowRight":
        case "PageDown": {
          event.preventDefault();
          goNext();
          break;
        }
        case "ArrowLeft":
        case "PageUp": {
          event.preventDefault();
          goPrevious();
          break;
        }
        case "End": {
          event.preventDefault();
          goTo(lastIndex);
          break;
        }
        case "Home": {
          event.preventDefault();
          goTo(0);
          break;
        }
        default: {
          break;
        }
      }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrevious, goTo, lastIndex]);

  // Swipe is tracked on the stage rather than the whole theater, so a drag that
  // starts on the chrome doesn't flip the page.
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    if (event.pointerType === "mouse") return;
    swipeStartRef.current = { x: event.clientX, y: event.clientY };
  }, []);
  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dy) > Math.abs(dx)) {
        return;
      }
      if (dx < 0) goNext();
      else goPrevious();
    },
    [goNext, goPrevious],
  );

  const publicationParams = article.publicationUri
    ? publicationLinkParams(article.publicationUri)
    : null;
  const articleParams = documentLinkParams(article.uri);
  const publicationName = article.publication?.name ?? null;

  return (
    <div {...stylex.props(styles.theater)}>
      <div {...stylex.props(styles.bar, styles.topBar)}>
        {publicationParams ? (
          <IconButtonLink
            variant="tertiary"
            to="/p/$did/$rkey"
            params={publicationParams}
            aria-label={t`Close the comic reader`}
            style={styles.chromeControl}
          >
            <X aria-hidden size={ICON_SIZE} strokeWidth={ICON_STROKE} />
          </IconButtonLink>
        ) : null}

        <div {...stylex.props(styles.titles)}>
          {publicationName ? (
            <div {...stylex.props(styles.kicker)}>
              {series && series.total > 0 ? (
                <Trans>
                  {publicationName} · {series.position} of {series.total}
                </Trans>
              ) : (
                publicationName
              )}
            </div>
          ) : null}
          <div {...stylex.props(styles.title)}>{article.title}</div>
        </div>

        {articleParams ? (
          <IconButtonLink
            variant="tertiary"
            to="/a/$did/$rkey"
            params={articleParams}
            search={{ view: "reader" }}
            aria-label={t`Read this issue as an article`}
            style={styles.chromeControl}
          >
            <FileText aria-hidden size={ICON_SIZE} strokeWidth={ICON_STROKE} />
          </IconButtonLink>
        ) : null}
      </div>

      <div
        {...stylex.props(styles.stage)}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {pages.length === 0 ? (
          <div {...stylex.props(styles.emptyNote)}>
            <Trans>This issue has no pages to show.</Trans>
          </div>
        ) : atEnd || !current ? (
          <ComicEndCard article={article} series={series} />
        ) : (
          <>
            <img
              key={current.url}
              src={current.url}
              alt={current.alt || t`Page ${index + 1}`}
              // The first page is the largest thing on screen and the reason the
              // route exists; later pages arrive warm from the preloads below.
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
              {...stylex.props(styles.page)}
            />
            <button
              type="button"
              aria-label={t`Previous page`}
              onClick={goPrevious}
              {...stylex.props(styles.zone, styles.zonePrev)}
            />
            <button
              type="button"
              aria-label={t`Next page`}
              onClick={goNext}
              {...stylex.props(styles.zone, styles.zoneNext)}
            />
          </>
        )}
      </div>

      {/* Pages just ahead — fetched but never laid out, so a flip is instant. */}
      <div hidden>
        {pages.slice(index + 1, index + 1 + PRELOAD_AHEAD).map((image) => (
          <img
            key={image.url}
            src={image.url}
            alt=""
            loading="eager"
            decoding="async"
          />
        ))}
      </div>

      {pages.length > 0 ? (
        <div {...stylex.props(styles.bar, styles.bottomBar)}>
          <IconButton
            variant="tertiary"
            aria-label={t`Previous page`}
            isDisabled={index === 0}
            onPress={goPrevious}
            style={styles.chromeControl}
          >
            <ChevronLeft
              aria-hidden
              size={ICON_SIZE}
              strokeWidth={ICON_STROKE}
            />
          </IconButton>
          <span {...stylex.props(styles.counter)} aria-live="polite">
            {atEnd ? (
              <Trans>End of issue</Trans>
            ) : (
              <Trans>
                Page {index + 1} of {pages.length}
              </Trans>
            )}
          </span>
          <IconButton
            variant="tertiary"
            aria-label={t`Next page`}
            isDisabled={atEnd}
            onPress={goNext}
            style={styles.chromeControl}
          >
            <ChevronRight
              aria-hidden
              size={ICON_SIZE}
              strokeWidth={ICON_STROKE}
            />
          </IconButton>
        </div>
      ) : null}
    </div>
  );
}
