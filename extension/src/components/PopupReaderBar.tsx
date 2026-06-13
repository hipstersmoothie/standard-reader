import * as stylex from "@stylexjs/stylex";
import { formatTime } from "#/components/reader/format";
import { SeekTrack } from "#/components/reader/seek-track";
import { Button } from "#/design-system/button";
import { IconButton } from "#/design-system/icon-button";
import { Menu, MenuItem } from "#/design-system/menu";
import { primaryColor, uiColor } from "#/design-system/theme/color.stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "#/design-system/theme/typography.stylex";
import { Headphones, Pause, Play, RotateCcw, SkipBack, X } from "lucide-react";

import type {
  ReaderSnapshot,
  ReaderTransportCommand,
} from "../lib/reader-messaging";

import { sendMessage } from "../lib/messaging";

const SKIP_SECONDS = 15;
const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2];

function formatRate(rate: number): string {
  return `${rate}×`;
}

const styles = stylex.create({
  frame: {
    backgroundColor: uiColor.bg,
    borderBottomWidth: 0,
    borderColor: uiColor.border1,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderStyle: "solid",
    borderTopWidth: 1,
    boxSizing: "border-box",
    width: "100%",
  },
  content: {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    paddingBlock: verticalSpace.lg,
    paddingInline: horizontalSpace["4xl"],
    rowGap: gap.md,
    width: "100%",
  },
  row: {
    alignItems: "center",
    columnGap: gap.md,
    display: "flex",
  },
  meta: {
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    rowGap: gap.sm,
    minWidth: 0,
  },
  kicker: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.sm,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.wider,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
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
  errorText: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
  listenButton: {
    width: "100%",
  },
});

export type PopupReaderArticle = {
  documentUri: string;
  title: string;
};

type PopupReaderBarProps = {
  /** Current tab article, when the popup resolved to one. */
  article?: PopupReaderArticle | null;
  snapshot: ReaderSnapshot | null;
  setSnapshot: (snapshot: ReaderSnapshot | null) => void;
  onPlay: (target: PopupReaderArticle) => Promise<void>;
  starting?: boolean;
  playError?: string | null;
};

/**
 * Pinned read-aloud controls for the popup footer. Renders only while a session
 * is active (loading, playing, paused, or error) so transport stays put as you
 * browse other popup states while audio keeps playing.
 */
export function PopupReaderBar({
  article = null,
  snapshot,
  setSnapshot,
  onPlay,
  starting = false,
  playError = null,
}: PopupReaderBarProps) {
  const state = snapshot?.state ?? null;
  if (state === null || state.status === "idle") return null;

  const command = (transportCommand: ReaderTransportCommand) => {
    void sendMessage({
      type: "readerCommand",
      command: transportCommand,
    }).catch(() => {});
  };

  const stop = () => {
    // Optimistic: the offscreen document is torn down on stop, so no idle
    // broadcast will follow.
    setSnapshot(null);
    command({ type: "stop" });
  };

  const {
    status,
    currentTime,
    duration,
    modelProgress,
    generationProgress,
    rate,
    error,
  } = state;
  const isLoading = status === "loading-model" || status === "generating";
  const isError = status === "error";
  const isPlaying = status === "playing";
  const transportReady = status === "playing" || status === "paused";
  const playingThisArticle =
    article != null &&
    snapshot?.nowPlaying?.documentUri === article.documentUri;

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

  const fraction = duration > 0 ? currentTime / duration : 0;

  return (
    <div {...stylex.props(styles.frame)}>
      <div {...stylex.props(styles.content)}>
        <section aria-label="Read aloud">
          <div {...stylex.props(styles.row)}>
            <div {...stylex.props(styles.meta)}>
              <span {...stylex.props(styles.kicker)}>
                <span>{kickerLabel}</span>
                {transportReady ? (
                  <>
                    <span {...stylex.props(styles.kickerTime)}>
                      {formatTime(currentTime)}
                    </span>
                    <span {...stylex.props(styles.kickerOf)}>
                      / {formatTime(duration)}
                    </span>
                  </>
                ) : null}
              </span>
              {snapshot?.nowPlaying?.title ? (
                <span {...stylex.props(styles.title)}>
                  {snapshot.nowPlaying.title}
                </span>
              ) : null}
            </div>

            <div {...stylex.props(styles.controls)}>
              <IconButton
                variant="tertiary"
                style={styles.roundBtn}
                aria-label={`Back ${SKIP_SECONDS} seconds`}
                isDisabled={!transportReady}
                onPress={() =>
                  command({ type: "skip", seconds: -SKIP_SECONDS })
                }
              >
                <SkipBack size={16} />
              </IconButton>

              <IconButton
                variant="tertiary"
                size="lg"
                style={styles.playBtn}
                aria-label={isError ? "Retry" : isPlaying ? "Pause" : "Play"}
                isPending={isLoading}
                onPress={() => command({ type: isError ? "retry" : "toggle" })}
              >
                {isError ? (
                  <RotateCcw size={18} />
                ) : isPlaying ? (
                  <Pause size={18} fill="currentColor" />
                ) : (
                  <Play size={18} fill="currentColor" />
                )}
              </IconButton>

              <Menu
                placement="top"
                selectionMode="single"
                selectedKeys={new Set([String(rate)])}
                disallowEmptySelection
                onAction={(key) =>
                  command({ type: "setRate", rate: Number(key) })
                }
                trigger={
                  <Button
                    variant="tertiary"
                    aria-label={`Playback speed: ${formatRate(rate)}`}
                    style={styles.speedTrigger}
                  >
                    {formatRate(rate)}
                  </Button>
                }
              >
                {SPEED_OPTIONS.map((speed) => (
                  <MenuItem key={speed} id={String(speed)}>
                    {formatRate(speed)}
                  </MenuItem>
                ))}
              </Menu>

              <IconButton
                variant="tertiary"
                style={styles.roundBtn}
                aria-label="Stop reading"
                onPress={stop}
              >
                <X size={16} />
              </IconButton>
            </div>
          </div>

          <SeekTrack
            fraction={fraction}
            disabled={!transportReady || duration <= 0}
            durationSeconds={duration}
            currentSeconds={currentTime}
            onPreview={() => {}}
            onCommit={(seconds) => command({ type: "seekTo", seconds })}
          />
        </section>

        {article && !playingThisArticle ? (
          <Button
            variant="secondary"
            size="lg"
            onPress={() => void onPlay(article)}
            isPending={starting}
            style={styles.listenButton}
          >
            <Headphones size={16} />
            Listen to this article instead
          </Button>
        ) : null}
        {playError ? (
          <span {...stylex.props(styles.errorText)}>{playError}</span>
        ) : null}
      </div>
    </div>
  );
}
