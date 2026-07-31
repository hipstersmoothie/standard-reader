"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { IconButton } from "@standard-reader/design-system/icon-button";
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
import { ChevronLeft, ChevronRight, FileText, X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef } from "react";

import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";

import { documentLinkParams, publicationLinkParams } from "../reader/format";
import { applyMarkReadOptimisticUpdate } from "../reader/read-optimistic";
import { ButtonLink, IconButtonLink } from "../router-links";
import { issueAtPage, pageOfIssue, useComicPages } from "./use-comic-pages";

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
  pagePlaceholder: {
    alignItems: "center",
    color: THEATER_CHROME,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    justifyContent: "center",
    height: "100%",
    width: "100%",
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

/** The current issue's own reading view — a comic's author notes live there. */
function NotesAction({ issueUri }: { issueUri: string | null }) {
  const params = issueUri ? documentLinkParams(issueUri) : null;
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
 * The back cover. Reached past the last page of the last issue — there is no
 * per-issue end card, because issues run into each other here the way pages of
 * one book do.
 */
function ComicEndCard({
  publicationUri,
  lastIssueUri,
}: {
  publicationUri: string | null;
  lastIssueUri: string | null;
}) {
  return (
    <div {...stylex.props(styles.endCard)}>
      <Flex direction="column" gap="6xl">
        <Flex direction="column" gap="4xl">
          <span {...stylex.props(styles.endKicker)}>
            <Trans>The end, for now</Trans>
          </span>
          <span {...stylex.props(styles.endTitle)}>
            <Trans>You’re caught up</Trans>
          </span>
          <span {...stylex.props(styles.endDek)}>
            <Trans>
              You’ve read every page published so far. Subscribe to hear when
              the next one lands.
            </Trans>
          </span>
        </Flex>

        <div {...stylex.props(styles.endActions)}>
          <NotesAction issueUri={lastIssueUri} />
          {publicationUri ? (
            <AllIssuesAction publicationUri={publicationUri} />
          ) : null}
        </div>
      </Flex>
    </div>
  );
}

export interface ComicReaderProps {
  publicationUri: string | null;
  publicationName: string | null;
  /** The issue the reader arrived through — where an unpositioned open starts. */
  anchorIssueUri: string;
  /** 1-based page across the whole publication; `totalPages + 1` is the end card. */
  page: number | undefined;
  onPageChange: (page: number) => void;
  signedIn: boolean;
}

/**
 * A page-flip reader for a whole comic publication.
 *
 * The unit here is the publication, not the issue: every issue's images, in
 * publication order, as one continuous run of pages. Opening the cover and
 * holding down the next key walks the entire comic — issues run into each other
 * the way pages of one book do, rather than stopping at an end-of-issue card.
 *
 * Only the pages near the reader are fetched (`useComicPages`); the spine gives
 * the total page count up front, so the counter is honest from the first frame
 * even though almost nothing has been loaded. The current page lives in the URL,
 * and page turns replace the history entry so Back leaves the reader rather than
 * walking every page in reverse.
 */
export function ComicReader({
  publicationUri,
  publicationName,
  anchorIssueUri,
  page,
  onPageChange,
  signedIn,
}: ComicReaderProps) {
  const { t } = useLingui();

  // Before the spine resolves there is no absolute numbering, so an open with no
  // `?page=` sits on the first page until it can be placed at the anchor issue.
  const requestedIndex = page == null ? 0 : page - 1;
  const { issues, totalPages, pages, isSpinePending, isPagePending } =
    useComicPages(publicationUri, requestedIndex);

  const lastIndex = totalPages;
  const index = Math.min(Math.max(requestedIndex, 0), Math.max(lastIndex, 0));
  const atEnd = totalPages > 0 && index === lastIndex;
  const current = pages.get(index) ?? null;

  // An open with no page lands on the issue the reader clicked, which is only
  // knowable once the spine gives that issue its offset.
  const placedRef = useRef(false);
  useEffect(() => {
    if (placedRef.current || page != null || issues.length === 0) return;
    placedRef.current = true;
    const start = pageOfIssue(issues, anchorIssueUri);
    if (start > 0) onPageChange(start + 1);
  }, [anchorIssueUri, issues, onPageChange, page]);

  const currentIssue = issueAtPage(issues, index);
  const issueUri = currentIssue?.uri ?? null;
  const lastIssueUri = issues.at(-1)?.uri ?? null;

  // Reading state follows the pages: an issue counts as read once the reader is
  // inside it, so walking the comic marks the archive off behind you.
  const queryClient = useQueryClient();
  const { enabled: trackReading } = useTrackReadingHistory();
  const { mutate: markRead } = useMutation(readerApi.markReadMutationOptions());
  const markedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!signedIn || !trackReading || !issueUri) return;
    if (markedRef.current.has(issueUri)) return;
    markedRef.current.add(issueUri);
    applyMarkReadOptimisticUpdate(queryClient, issueUri, publicationUri);
    markRead(issueUri);
  }, [issueUri, markRead, publicationUri, queryClient, signedIn, trackReading]);

  const goTo = useCallback(
    (nextIndex: number) => {
      const clamped = Math.min(Math.max(nextIndex, 0), Math.max(lastIndex, 0));
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

  const publicationParams = publicationUri
    ? publicationLinkParams(publicationUri)
    : null;
  const notesParams = issueUri ? documentLinkParams(issueUri) : null;

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
            <div {...stylex.props(styles.kicker)}>{publicationName}</div>
          ) : null}
          <div {...stylex.props(styles.title)}>
            {currentIssue?.title ?? publicationName ?? ""}
          </div>
        </div>

        {notesParams ? (
          <IconButtonLink
            variant="tertiary"
            to="/a/$did/$rkey"
            params={notesParams}
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
        {isSpinePending ? (
          <div {...stylex.props(styles.pagePlaceholder)} aria-busy="true">
            <Trans>Opening the comic…</Trans>
          </div>
        ) : totalPages === 0 ? (
          <div {...stylex.props(styles.emptyNote)}>
            <Trans>This comic has no pages to show.</Trans>
          </div>
        ) : atEnd ? (
          <ComicEndCard
            publicationUri={publicationUri}
            lastIssueUri={lastIssueUri}
          />
        ) : (
          <>
            {current ? (
              <img
                key={current.url}
                src={current.url}
                alt={current.alt || t`Page ${index + 1}`}
                // The page in hand is the reason the route exists; the chunk
                // loader keeps its neighbours warm, so nothing else is eager.
                loading="eager"
                decoding="async"
                {...stylex.props(styles.page)}
              />
            ) : (
              <div
                {...stylex.props(styles.pagePlaceholder)}
                aria-busy={isPagePending ? "true" : undefined}
              >
                <Trans>Loading page…</Trans>
              </div>
            )}
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

      {totalPages > 0 ? (
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
              <Trans>The end</Trans>
            ) : (
              <Trans>
                Page {index + 1} of {totalPages}
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
