"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { IconButton } from "@standard-reader/design-system/icon-button";
import {
  animationDuration,
  animationTimingFunction,
} from "@standard-reader/design-system/theme/animations.stylex";
import { mediaQueries } from "@standard-reader/design-system/theme/media-queries.stylex";
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
import { useCallback, useEffect, useRef, useState } from "react";

import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";

import { documentLinkParams, publicationLinkParams } from "../reader/format";
import { applyMarkReadOptimisticUpdate } from "../reader/read-optimistic";
import { ButtonLink, IconButtonLink } from "../router-links";
import { issueAtPage, pageOfIssue, useComicPages } from "./use-comic-pages";
import { usePagePreload } from "./use-page-preload";

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

/**
 * The bars float over the art now, so they carry their own legibility: a scrim
 * that fades out over the bar's own height rather than a rule dividing the
 * screen into three boxes.
 *
 * The top one holds two lines of type over whatever the page happens to be —
 * often a bright panel — so it sits on a near-solid band and does its fading
 * lower down, past the text. A single linear ramp left the title swimming.
 */
const THEATER_SCRIM_TOP = `linear-gradient(
  to bottom,
  rgba(0, 0, 0, 0.94) 0%,
  rgba(0, 0, 0, 0.88) 40%,
  rgba(0, 0, 0, 0.55) 70%,
  rgba(0, 0, 0, 0) 100%
)`;
const THEATER_SCRIM_BOTTOM =
  "linear-gradient(to top, rgba(0, 0, 0, 0.82), rgba(0, 0, 0, 0))";

/** A pointer that can actually hover — not a finger the browser pretends can. */
const HOVER_CAPABLE = "@media (hover: hover)";

/** Horizontal travel (px) that counts as a swipe rather than a tap. */
const SWIPE_THRESHOLD_PX = 44;

/** How long the chrome sits untouched before it gets out of the art's way. */
const CHROME_IDLE_MS = 2600;

/**
 * Visual-viewport scale past which the reader counts as zoomed in. Not `> 1`:
 * iOS reports a scale a hair off 1 at rest often enough that an exact
 * comparison flickers.
 */
const ZOOMED_SCALE = 1.01;

const ICON_SIZE = 18;
const ICON_STROKE = 1.75;

const styles = stylex.create({
  theater: {
    inset: 0,
    backgroundColor: THEATER_BACKDROP,
    // `dvh`, so collapsing mobile browser chrome doesn't crop the page.
    height: "100dvh",
    position: "fixed",
    width: "100%",
  },
  /**
   * The chrome floats over the art instead of boxing it in, so a page gets the
   * whole screen — on a phone the two bars were eating the height the art
   * needed most. The layer itself is inert; only the bars take pointer events,
   * so a tap between them still lands on the paging zones underneath.
   */
  chromeLayer: {
    inset: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    pointerEvents: "none",
    position: "absolute",
    zIndex: 2,
  },
  bar: {
    alignItems: "center",
    columnGap: gap["2xl"],
    display: "flex",
    flexShrink: 0,
    pointerEvents: "auto",
    transitionDuration: animationDuration.slow,
    // `visibility` is deliberately NOT transitioned. A transitioned visibility
    // change is deferred to the end of the run, while `pointer-events` flips
    // the instant the class lands — so any transition that stalls (a throttled
    // or backgrounded tab will do it) strands the bar fully painted and
    // completely dead, taking the taps meant for the art underneath with it.
    // Keeping them on the same instant path makes painted-but-dead impossible.
    transitionProperty: "opacity, transform",
    transitionTimingFunction: animationTimingFunction.easeOut,
    paddingInlineEnd: spacing["3"],
    paddingInlineStart: spacing["3"],
  },
  topBar: {
    backgroundImage: THEATER_SCRIM_TOP,
    // The scrim needs room to fall off well below the type, and the top edge
    // has to clear the notch/status bar in a standalone window.
    paddingBottom: spacing["12"],
    paddingTop: `calc(env(safe-area-inset-top, 0px) + ${spacing["3"]})`,
  },
  bottomBar: {
    backgroundImage: THEATER_SCRIM_BOTTOM,
    justifyContent: "center",
    paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${spacing["3"]})`,
    paddingTop: spacing["8"],
  },
  // Hidden chrome leaves the tab order as well as the screen, and drifts the
  // short distance a bar would travel rather than sliding fully off — it is
  // getting out of the way, not exiting.
  barHidden: {
    opacity: 0,
    pointerEvents: "none",
    visibility: "hidden",
  },
  barHiddenTop: {
    transform: {
      default: `translateY(calc(${spacing["2"]} * -1))`,
      [mediaQueries.reducedMotion]: "none",
    },
  },
  barHiddenBottom: {
    transform: {
      default: `translateY(${spacing["2"]})`,
      [mediaQueries.reducedMotion]: "none",
    },
  },
  // The theater's palette is fixed, so the design-system buttons in its chrome
  // take these colours instead of the app's UI scale. The lit state is for real
  // hover only: on a touch screen `:hover` latches onto whatever was tapped
  // last and leaves a grey box sitting on the bar until something else is.
  chromeControl: {
    backgroundColor: {
      default: "transparent",
      [HOVER_CAPABLE]: { default: "transparent", ":hover": THEATER_SURFACE },
      ":is([data-disabled])": "transparent",
    },
    color: THEATER_CHROME_STRONG,
    flexShrink: 0,
    opacity: { default: 1, ":is([data-disabled])": 0.35 },
    borderColor: THEATER_RULE,
    boxShadow: "none",
  },
  titles: {
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    // The publication name and the issue title are two separate lines of type,
    // not one block — without this they collide.
    rowGap: gap.xs,
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
    // `lineHeight.xs` is 0.8 — tighter than the type itself, so `overflow:
    // hidden` (which the ellipsis needs) sliced the descenders off a title like
    // "Fray In The Veil". `sm` gives the line box room to hold them.
    lineHeight: lineHeight.sm,
    overflow: "hidden",
    textOverflow: "ellipsis",
    unicodeBidi: "isolate",
    whiteSpace: "nowrap",
  },
  stage: {
    inset: 0,
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    overflow: "hidden",
    position: "absolute",
    // `pan-y` alone excludes pinch, which on a phone means a dense page of art
    // can only ever be read at whatever size fits the screen. Horizontal drags
    // are still ours — that is what leaves swipe to us rather than the browser.
    touchAction: "pan-y pinch-zoom",
  },
  /**
   * Zoomed in, the browser gets both axes back. Reserving horizontal drags for
   * the swipe is what makes paging work at rest, but it also pins a reader who
   * has pinched into a panel to a single vertical track — they can go up and
   * down the page and never across it. Swipe already stands down at this scale,
   * so the reservation is buying nothing. `manipulation` rather than `auto`:
   * pan and pinch freely, but no double-tap zoom, which on a screen where a tap
   * turns the page would fire a page turn on the way to magnifying a panel.
   */
  stageZoomed: {
    touchAction: "manipulation",
  },
  page: {
    objectFit: "contain",
    display: "block",
    maxHeight: "100%",
    maxWidth: "100%",
  },
  // Invisible hit areas: the natural way to page through art on a phone. The
  // outer edges turn pages and the wide middle calls the chrome back — the only
  // way back to the controls once they have stepped aside, so it gets the bulk
  // of the screen and the flippers get the margins a thumb already reaches for.
  // They are pointer affordances only: the footer buttons are the accessible,
  // focusable controls, so these stay out of the tab order and take no focus
  // ring (clicking one otherwise left a ring hanging over the art for the rest
  // of the session, since arrow keys keep the focus there). They take no tap
  // highlight either — a grey rectangle flashing across a page of art on every
  // turn is the browser drawing a button the reader isn't supposed to see.
  zone: {
    outline: "none",
    borderWidth: 0,
    cursor: "pointer",
    backgroundColor: "transparent",
    insetBlock: 0,
    padding: spacing["0"],
    position: "absolute",
    // The zones cover the stage, so they are what a swipe — or a pinch —
    // actually lands on. Without this they inherit nothing and default to
    // `auto`, and the browser claims any horizontal drag for itself
    // (back-navigation, overscroll): it fires `pointercancel` and the page
    // never turns. `touch-action` does not inherit, so the stage's copy of this
    // does not cover them.
    touchAction: "pan-y pinch-zoom",
    WebkitTapHighlightColor: "transparent",
    width: "18%",
  },
  zonePrev: {
    insetInlineStart: 0,
  },
  zoneNext: {
    insetInlineEnd: 0,
  },
  zoneChrome: {
    insetInlineEnd: "18%",
    insetInlineStart: "18%",
    width: "auto",
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
    // The chrome sits on top of the stage here rather than beside it, so a card
    // long enough to scroll has to keep its ends clear of both bars.
    paddingBottom: spacing["20"],
    paddingTop: spacing["20"],
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

  // Decode the neighbouring pages now, so a turn shows art rather than a blank
  // frame — the whole point of a comic is the image being there.
  usePagePreload(pages, index);

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

  // The chrome shows itself, then steps aside. A comic is read by looking at
  // it, and on a phone two permanent bars are the loudest thing on screen — so
  // they introduce the reader's controls once and then leave, and the middle of
  // the screen calls them back. `visibleRef` mirrors the state so a mouse
  // moving over an already-visible bar doesn't re-render on every frame.
  const [chromeVisible, setChromeVisible] = useState(true);
  const [chromeHeld, setChromeHeld] = useState(false);
  const visibleRef = useRef(true);
  const activityRef = useRef(0);

  const setChrome = useCallback((next: boolean) => {
    visibleRef.current = next;
    setChromeVisible(next);
  }, []);

  /** Any sign of life restarts the idle window; only some of it un-hides. */
  const noteActivity = useCallback(() => {
    activityRef.current = Date.now();
  }, []);

  const revealChrome = useCallback(() => {
    noteActivity();
    if (!visibleRef.current) setChrome(true);
  }, [noteActivity, setChrome]);

  const toggleChrome = useCallback(() => {
    noteActivity();
    setChrome(!visibleRef.current);
  }, [noteActivity, setChrome]);

  // Nothing to get out of the way of until there is a page to read: the loading
  // state, the empty note and the back cover are all things the reader is meant
  // to act on, so the chrome stays put for them.
  const chromeCanRest = totalPages > 0 && !isSpinePending && !atEnd;

  useEffect(() => {
    if (!chromeVisible || chromeHeld || !chromeCanRest) return;
    let timer: ReturnType<typeof setTimeout>;
    // Re-arms against the last interaction rather than counting down from the
    // render, so paging or moving the mouse extends the window without the
    // effect having to re-run on every event.
    const arm = () => {
      const remaining = CHROME_IDLE_MS - (Date.now() - activityRef.current);
      if (remaining <= 0) {
        setChrome(false);
        return;
      }
      timer = setTimeout(arm, remaining);
    };
    arm();
    return () => clearTimeout(timer);
  }, [chromeCanRest, chromeHeld, chromeVisible, setChrome]);

  // Pointer and focus inside the chrome pin it open — a bar must not fade out
  // from under the cursor resting on it, or from under a keyboard focus ring.
  // The layer is `pointer-events: none`, so only the bars raise these.
  const holdChrome = useCallback(() => setChromeHeld(true), []);
  const releaseChrome = useCallback(() => {
    noteActivity();
    setChromeHeld(false);
  }, [noteActivity]);

  const goTo = useCallback(
    (nextIndex: number) => {
      const clamped = Math.min(Math.max(nextIndex, 0), Math.max(lastIndex, 0));
      if (clamped === index) return;
      // A page turn is not a request for the chrome back — but if it is already
      // out, tapping through pages shouldn't make it vanish mid-tap.
      noteActivity();
      onPageChange(clamped + 1);
    },
    [index, lastIndex, noteActivity, onPageChange],
  );

  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const goPrevious = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key) {
        // Hidden chrome is out of the tab order, so reaching for it has to put
        // it back. Not prevented: this Tab still moves focus, and the next one
        // lands on the close button.
        case "Tab": {
          revealChrome();
          break;
        }
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
  }, [goNext, goPrevious, goTo, lastIndex, revealChrome]);

  // A mouse has no equivalent of the middle-third tap, so moving it is what
  // brings the chrome back — the same bargain a video player makes. Touch moves
  // are left alone: a swipe through a page is reading, not reaching for a menu.
  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerType !== "mouse") return;
      revealChrome();
    },
    [revealChrome],
  );

  // Whether the reader has pinched in decides who owns a horizontal drag, and
  // that has to be settled in CSS before the gesture starts — `touch-action` is
  // read at touch-down, so it cannot be worked out from the drag itself.
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    const viewport = globalThis.visualViewport;
    if (!viewport) return;
    const sync = () => setZoomed(viewport.scale > ZOOMED_SCALE);
    sync();
    viewport.addEventListener("resize", sync);
    return () => viewport.removeEventListener("resize", sync);
  }, []);

  // Swipe is tracked on the stage rather than the whole theater, so a drag that
  // starts on the chrome doesn't flip the page. The tap zones sit on top of the
  // stage and are the real event target, but pointer events bubble, so the
  // gesture is read here for all three of them at once.
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const tapConsumedRef = useRef(false);
  const activePointersRef = useRef(0);

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    // `isPrimary` is the first contact of a fresh gesture, so it doubles as the
    // resync point: a `pointerup` lost off the edge of the screen would
    // otherwise leave the count stuck above zero and swipe dead for the session.
    activePointersRef.current = event.isPrimary
      ? 1
      : activePointersRef.current + 1;
    tapConsumedRef.current = false;
    if (event.pointerType === "mouse") return;
    // A second finger means a pinch, not a swipe — its two contacts travel in
    // opposite directions, and either one on its own reads as a page turn.
    if (activePointersRef.current > 1) {
      swipeStartRef.current = null;
      tapConsumedRef.current = true;
      return;
    }
    swipeStartRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const endPointer = useCallback(() => {
    activePointersRef.current = Math.max(activePointersRef.current - 1, 0);
  }, []);

  const onPointerCancel = useCallback(() => {
    endPointer();
    swipeStartRef.current = null;
  }, [endPointer]);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      const multiTouch = activePointersRef.current > 1;
      endPointer();
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start || multiTouch) return;
      // Once the reader has pinched in, a one-finger drag is how they get to
      // the rest of the page. Paging on it would snatch the panel away mid-look;
      // the tap zones and the footer buttons still turn pages while zoomed.
      if ((globalThis.visualViewport?.scale ?? 1) > ZOOMED_SCALE) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dy) > Math.abs(dx)) {
        return;
      }
      // A drag that begins and ends on the same zone still resolves to a click,
      // which would fire that zone's action on top of the swipe's — turning two
      // pages, or turning one back. The click is told to stand down.
      tapConsumedRef.current = true;
      if (dx < 0) goNext();
      else goPrevious();
    },
    [endPointer, goNext, goPrevious],
  );

  /** Zone taps, minus the phantom click trailing a swipe or a pinch across one. */
  const onZoneTap = useCallback((action: () => void) => {
    if (tapConsumedRef.current) {
      tapConsumedRef.current = false;
      return;
    }
    action();
  }, []);

  const publicationParams = publicationUri
    ? publicationLinkParams(publicationUri)
    : null;
  const notesParams = issueUri ? documentLinkParams(issueUri) : null;

  const chromeHidden = !chromeVisible;

  return (
    <div {...stylex.props(styles.theater)} onPointerMove={onPointerMove}>
      <div
        {...stylex.props(styles.stage, zoomed && styles.stageZoomed)}
        onPointerCancel={onPointerCancel}
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
              // The footer control of the same name is the accessible one; this
              // is a pointer target, so it is hidden from assistive tech and the
              // tab order rather than duplicating that button.
              aria-hidden
              tabIndex={-1}
              onClick={() => onZoneTap(goPrevious)}
              {...stylex.props(
                styles.zone,
                styles.zonePrev,
                zoomed && styles.stageZoomed,
              )}
            />
            <button
              type="button"
              // The chrome's own controls are the accessible way to reach every
              // action behind this; it exists so a thumb in the middle of the
              // screen can call the bars back without turning a page.
              aria-hidden
              tabIndex={-1}
              onClick={() => onZoneTap(toggleChrome)}
              {...stylex.props(
                styles.zone,
                styles.zoneChrome,
                zoomed && styles.stageZoomed,
              )}
            />
            <button
              type="button"
              // The footer control of the same name is the accessible one; this
              // is a pointer target, so it is hidden from assistive tech and the
              // tab order rather than duplicating that button.
              aria-hidden
              tabIndex={-1}
              onClick={() => onZoneTap(goNext)}
              {...stylex.props(
                styles.zone,
                styles.zoneNext,
                zoomed && styles.stageZoomed,
              )}
            />
          </>
        )}
      </div>

      <div
        {...stylex.props(styles.chromeLayer)}
        onBlur={releaseChrome}
        onFocus={holdChrome}
        onPointerOut={releaseChrome}
        onPointerOver={holdChrome}
      >
        <div
          {...stylex.props(
            styles.bar,
            styles.topBar,
            chromeHidden && styles.barHidden,
            chromeHidden && styles.barHiddenTop,
          )}
        >
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
              <FileText
                aria-hidden
                size={ICON_SIZE}
                strokeWidth={ICON_STROKE}
              />
            </IconButtonLink>
          ) : null}
        </div>

        {totalPages > 0 ? (
          <div
            {...stylex.props(
              styles.bar,
              styles.bottomBar,
              chromeHidden && styles.barHidden,
              chromeHidden && styles.barHiddenBottom,
            )}
          >
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
    </div>
  );
}
