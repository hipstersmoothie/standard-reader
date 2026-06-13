"use client";

import * as stylex from "@stylexjs/stylex";
import { animationDuration } from "#/design-system/theme/animations.stylex";
import { primaryColor, uiColor } from "#/design-system/theme/color.stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import { verticalSpace } from "#/design-system/theme/semantic-spacing.stylex";
import { spacing } from "#/design-system/theme/spacing.stylex";
import { useRef } from "react";

import { formatTime } from "./format";

const ARROW_SECONDS = 5;

const styles = stylex.create({
  trackHit: {
    boxSizing: "border-box",
    cursor: { default: "pointer", ":is([aria-disabled=true])": "default" },
    position: "relative",
    touchAction: "none",
    paddingBottom: verticalSpace.xs,
    paddingTop: verticalSpace.sm,
    width: "100%",
  },
  track: {
    borderRadius: radius.full,
    overflow: "hidden",
    backgroundColor: uiColor.component2,
    position: "relative",
    height: spacing["2"],
    width: "100%",
  },
  trackDisabled: { opacity: 0.6 },
  trackFill: {
    borderRadius: radius.full,
    backgroundColor: primaryColor.solid1,
    position: "absolute",
    transitionDuration: animationDuration.default,
    transitionProperty: "width",
    transitionTimingFunction: "linear",
    height: "100%",
    left: 0,
    top: 0,
  },
});

/**
 * A thin, prototype-style seek track that is still draggable/clickable. We
 * preview the position locally while dragging and only commit the seek on
 * release, so a sweep across the bar doesn't repeatedly rebase synthesis.
 */
export function SeekTrack({
  fraction,
  disabled,
  durationSeconds,
  currentSeconds,
  onPreview,
  onCommit,
}: {
  fraction: number;
  disabled: boolean;
  durationSeconds: number;
  currentSeconds: number;
  onPreview: (seconds: number) => void;
  onCommit: (seconds: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const secondsFromClientX = (clientX: number): number => {
    const el = trackRef.current;
    if (!el || durationSeconds <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const ratio =
      rect.width > 0
        ? Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
        : 0;
    return ratio * durationSeconds;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onPreview(secondsFromClientX(event.clientX));
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    onPreview(secondsFromClientX(event.clientX));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    onCommit(secondsFromClientX(event.clientX));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onCommit(Math.max(0, currentSeconds - ARROW_SECONDS));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onCommit(Math.min(durationSeconds, currentSeconds + ARROW_SECONDS));
    }
  };

  const pct = Math.min(1, Math.max(0, fraction)) * 100;

  return (
    <div
      ref={trackRef}
      {...stylex.props(styles.trackHit)}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(durationSeconds)}
      aria-valuenow={Math.round(currentSeconds)}
      aria-valuetext={formatTime(currentSeconds)}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <div {...stylex.props(styles.track, disabled && styles.trackDisabled)}>
        <span
          {...stylex.props(styles.trackFill)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
