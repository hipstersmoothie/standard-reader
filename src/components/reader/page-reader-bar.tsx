"use client";

import { useExitAnimation } from "@react-aria/utils";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Button } from "#/design-system/button";
import { IconButton } from "#/design-system/icon-button";
import { Menu, MenuItem } from "#/design-system/menu";
import {
  animationDuration,
  animationTimingFunction,
} from "#/design-system/theme/animations.stylex";
import { primaryColor, uiColor } from "#/design-system/theme/color.stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import { spacing } from "#/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "#/design-system/theme/typography.stylex";
import { usePageReader } from "#/lib/page-reader/page-reader-context";
import { articleSharePath } from "#/lib/quote-share";
import { LocateFixed, Pause, Play, RotateCcw, SkipBack, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { formatTime } from "./format";
import { SeekTrack } from "./seek-track";

const SKIP_SECONDS = 15;
const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

const DESKTOP = "@media (min-width: 60rem)";

function formatRate(rate: number): string {
  return `${rate}×`;
}

const rise = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(16px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

const sink = stylex.keyframes({
  from: { opacity: 1, transform: "translateY(0)" },
  to: { opacity: 0, transform: "translateY(16px)" },
});

const fabIn = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const fabOut = stylex.keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

const styles = stylex.create({
  // Wraps the transport card + follow FAB. The FAB is absolutely positioned so
  // showing/hiding it never changes the card's size or dock layout.
  cluster: {
    pointerEvents: "none",
    position: "relative",
  },
  // The floating card. Positioning lives on the app-shell dock that hosts it;
  // here we only own the look. Layered shadow + rise are lifted from the
  // prototype's `.audiobar`.
  card: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    animationDuration: {
      default: animationDuration.verySlow,
      ":is([data-exiting])": animationDuration.slow,
    },
    animationName: {
      default: rise,
      ":is([data-exiting])": sink,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: {
      default: "cubic-bezier(0.32, 0.72, 0, 1)",
      ":is([data-exiting])": animationTimingFunction.easeIn,
    },
    backgroundColor: uiColor.bg,
    boxShadow:
      "0 1px 1px oklch(0.3 0.03 60 / 0.04), 0 8px 22px -10px oklch(0.3 0.04 60 / 0.22), 0 20px 48px -22px oklch(0.3 0.05 60 / 0.3)",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    pointerEvents: {
      default: "auto",
      ":is([data-exiting])": "none",
    },
    rowGap: gap.md,
    maxWidth: { [DESKTOP]: "min(540px, calc(100vw - 36px))", default: "480px" },
    paddingBottom: verticalSpace.lg,
    paddingLeft: horizontalSpace.xl,
    paddingRight: horizontalSpace.xl,
    paddingTop: verticalSpace.lg,
    width: { [DESKTOP]: "max-content", default: "calc(100vw - 24px)" },
  },
  row: {
    alignItems: "center",
    columnGap: gap["2xl"],
    display: "flex",
  },
  now: {
    alignItems: "center",
    display: "flex",
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  meta: {
    textDecoration: "none",
    display: "flex",
    flexDirection: "column",
    rowGap: gap.md,
    minWidth: 0,
  },
  kicker: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.md,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.wider,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  kickerSep: { opacity: 0.5 },
  kickerTime: {
    color: uiColor.text2,
    fontFamily: fontFamily.mono,
    letterSpacing: tracking.normal,
    textTransform: "none",
  },
  kickerOf: {
    color: uiColor.text1,
    letterSpacing: tracking.normal,
    textTransform: "none",
  },
  title: {
    overflow: "hidden",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: { [DESKTOP]: "250px", default: "none" },
  },
  controls: {
    alignItems: "center",
    columnGap: gap.xs,
    display: "flex",
    flexShrink: 0,
  },
  roundBtn: {
    borderRadius: radius.full,
  },
  followFabHost: {
    animationDuration: {
      default: animationDuration.default,
      ":is([data-exiting])": animationDuration.fast,
    },
    animationName: {
      default: fabIn,
      ":is([data-exiting])": fabOut,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationTimingFunction: {
      default: "cubic-bezier(0.32, 0.72, 0, 1)",
      ":is([data-exiting])": animationTimingFunction.easeIn,
    },
    pointerEvents: {
      default: "auto",
      ":is([data-exiting])": "none",
    },
    position: "absolute",
    transform: {
      [DESKTOP]: "translateY(-50%)",
      default: "translate(40%, -40%)",
    },
    zIndex: 1,
    left: { [DESKTOP]: `calc(100% + ${gap.md})`, default: "auto" },
    right: { [DESKTOP]: "auto", default: 0 },
    top: { [DESKTOP]: "50%", default: 0 },
  },
  followFab: {
    borderColor: "transparent",
    borderRadius: radius.full,
    backgroundColor: primaryColor.solid1,
    boxShadow:
      "0 1px 1px oklch(0.3 0.03 60 / 0.04), 0 8px 22px -10px oklch(0.3 0.04 60 / 0.22), 0 20px 48px -22px oklch(0.3 0.05 60 / 0.3)",
    color: primaryColor.textContrast,
    filter: { default: "none", ":is([data-hovered])": "brightness(1.06)" },
    transform: { default: "none", ":is([data-pressed])": "scale(0.94)" },
  },
  playBtn: {
    borderColor: "transparent",
    borderRadius: radius.full,
    backgroundColor: primaryColor.solid1,
    boxShadow: `0 2px 9px -2px ${primaryColor.solid1}`,
    color: primaryColor.textContrast,
    filter: { default: "none", ":is([data-hovered])": "brightness(1.06)" },
    transform: { default: "none", ":is([data-pressed])": "scale(0.94)" },
  },
  speedTrigger: {
    borderColor: uiColor.border1,
    borderRadius: radius.full,
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontVariantNumeric: "tabular-nums",
  },
  divider: {
    backgroundColor: uiColor.border1,
    flexShrink: 0,
    height: spacing["5"],
    marginLeft: horizontalSpace.xl,
    marginRight: horizontalSpace.sm,
    width: spacing.px,
  },
});

/**
 * The page reader's floating transport. It lives in the app-shell dock (above
 * the bottom navigation, on every route) and shows whenever an article is
 * loaded into the player. Tapping the title returns to the playing article.
 */
type BarSnapshot = {
  nowPlaying: ReturnType<typeof usePageReader>["nowPlaying"];
  scrollLocked: boolean;
  state: ReturnType<typeof usePageReader>["state"];
};

export function PageReaderBar() {
  const navigate = useNavigate();
  const router = useRouter();
  const {
    state,
    active,
    nowPlaying,
    toggle,
    skip,
    seekTo,
    setRate,
    stop,
    retry,
    scrollLocked,
    lockScroll,
  } = usePageReader();
  const cardRef = useRef<HTMLElement>(null);
  const exiting = useExitAnimation(cardRef, active);
  const snapshotRef = useRef<BarSnapshot | null>(null);
  // While dragging the scrubber we preview the thumb position locally and only
  // commit the seek on release.
  const [scrubValue, setScrubValue] = useState<number | null>(null);

  useEffect(() => {
    if (active) {
      snapshotRef.current = { nowPlaying, scrollLocked, state };
    }
  }, [active, nowPlaying, scrollLocked, state]);

  // Hooks must run before any early return; bail out once they have.
  if (!active && !exiting) return null;

  const snapshot = snapshotRef.current;
  const displayNowPlaying = active
    ? nowPlaying
    : (snapshot?.nowPlaying ?? null);
  const displayScrollLocked = active
    ? scrollLocked
    : (snapshot?.scrollLocked ?? true);
  const displayState = active ? state : (snapshot?.state ?? state);
  const {
    status,
    currentTime,
    duration,
    modelProgress,
    generationProgress,
    error,
  } = displayState;

  const isLoading = status === "loading-model" || status === "generating";
  const isError = status === "error";
  const isPlaying = status === "playing";
  const transportReady = status === "playing" || status === "paused";

  let kickerLabel = "Reading aloud";
  if (status === "loading-model") {
    const percent = Math.round(modelProgress * 100);
    kickerLabel = percent > 0 ? `Loading voice… ${percent}%` : "Loading voice…";
  } else if (status === "generating") {
    kickerLabel = `Generating audio… ${Math.round(generationProgress * 100)}%`;
  } else if (isError) {
    kickerLabel = error ?? "Something went wrong";
  } else if (status === "paused") {
    kickerLabel = "Paused";
  }

  const previewTime = scrubValue ?? currentTime;
  const fraction = duration > 0 ? previewTime / duration : 0;
  const rateKey = String(displayState.rate);

  const playingParams =
    displayNowPlaying && displayNowPlaying.did && displayNowPlaying.rkey
      ? { did: displayNowPlaying.did, rkey: displayNowPlaying.rkey }
      : null;
  const playingHref = playingParams
    ? articleSharePath(playingParams.did, playingParams.rkey)
    : null;
  const onPlayingArticle =
    playingHref !== null && router.state.location.pathname === playingHref;
  const title = displayNowPlaying?.title ?? "";

  const onFollowAlong = () => {
    if (playingParams && !onPlayingArticle) {
      void navigate({ to: "/a/$did/$rkey", params: playingParams });
    }
    lockScroll();
  };

  const metaInner = (
    <>
      <span {...stylex.props(styles.kicker)}>
        <span>{kickerLabel}</span>
        {transportReady ? (
          <>
            <span {...stylex.props(styles.kickerSep)}>·</span>
            <span {...stylex.props(styles.kickerTime)}>
              {formatTime(previewTime)}
            </span>
            <span {...stylex.props(styles.kickerOf)}>
              / {formatTime(duration)}
            </span>
          </>
        ) : null}
      </span>
      {title ? <span {...stylex.props(styles.title)}>{title}</span> : null}
    </>
  );

  return (
    <div {...stylex.props(styles.cluster)}>
      <section
        ref={cardRef}
        data-exiting={exiting || undefined}
        {...stylex.props(styles.card)}
        aria-label="Read aloud"
      >
        <div {...stylex.props(styles.row)}>
          <div {...stylex.props(styles.now)}>
            {playingParams ? (
              <Link
                to="/a/$did/$rkey"
                params={playingParams}
                {...stylex.props(styles.meta)}
              >
                {metaInner}
              </Link>
            ) : (
              <div {...stylex.props(styles.meta)}>{metaInner}</div>
            )}
          </div>

          <div {...stylex.props(styles.controls)}>
            <IconButton
              variant="tertiary"
              style={styles.roundBtn}
              aria-label={`Back ${SKIP_SECONDS} seconds`}
              isDisabled={!transportReady}
              onPress={() => skip(-SKIP_SECONDS)}
            >
              <SkipBack size={18} />
            </IconButton>

            <IconButton
              variant="tertiary"
              size="lg"
              style={styles.playBtn}
              aria-label={isError ? "Retry" : isPlaying ? "Pause" : "Play"}
              isPending={isLoading}
              onPress={isError ? retry : toggle}
            >
              {isError ? (
                <RotateCcw size={20} />
              ) : isPlaying ? (
                <Pause size={20} fill="currentColor" />
              ) : (
                <Play size={20} fill="currentColor" />
              )}
            </IconButton>

            <Menu
              placement="top"
              selectionMode="single"
              selectedKeys={new Set([rateKey])}
              disallowEmptySelection
              onAction={(key) => setRate(Number(key))}
              trigger={
                <Button
                  variant="tertiary"
                  aria-label={`Playback speed: ${formatRate(displayState.rate)}`}
                  style={styles.speedTrigger}
                >
                  {formatRate(displayState.rate)}
                </Button>
              }
            >
              {SPEED_OPTIONS.map((speed) => (
                <MenuItem key={speed} id={String(speed)}>
                  {formatRate(speed)}
                </MenuItem>
              ))}
            </Menu>

            <span {...stylex.props(styles.divider)} aria-hidden />

            <IconButton
              variant="tertiary"
              style={styles.roundBtn}
              aria-label="Stop reading"
              onPress={stop}
            >
              <X size={18} />
            </IconButton>
          </div>
        </div>

        <SeekTrack
          fraction={fraction}
          disabled={!transportReady || duration <= 0}
          durationSeconds={duration}
          currentSeconds={previewTime}
          onPreview={setScrubValue}
          onCommit={(seconds) => {
            setScrubValue(null);
            seekTo(seconds);
          }}
        />
      </section>

      {!displayScrollLocked && transportReady ? (
        <div
          data-exiting={exiting || undefined}
          {...stylex.props(styles.followFabHost)}
        >
          <IconButton
            variant="tertiary"
            size="lg"
            style={styles.followFab}
            aria-label={
              onPlayingArticle
                ? "Follow along"
                : "Return to article and follow along"
            }
            onPress={onFollowAlong}
          >
            <LocateFixed size={20} />
          </IconButton>
        </div>
      ) : null}
    </div>
  );
}
