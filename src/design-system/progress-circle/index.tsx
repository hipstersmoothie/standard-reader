import type { ProgressBarProps as AriaProgressBarProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { Check } from "lucide-react";
import { use } from "react";
import { ProgressBar } from "react-aria-components";

import type { Size, StyleXComponentProps } from "../theme/types";

import { SizeContext } from "../context";
import { Label } from "../label";
import { animationDuration } from "../theme/animations.stylex";
import { primaryColor, uiColor } from "../theme/color.stylex";
import { radius } from "../theme/radius.stylex";
import { gap, size as sizeSpace } from "../theme/semantic-spacing.stylex";

const IndeterminateFillAnimation = stylex.keyframes({
  from: {
    transform: "rotate(0deg)",
  },
  to: {
    transform: "rotate(360deg)",
  },
});

const styles = stylex.create({
  wrapper: {
    gap: gap["md"],
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
  },
  circleWrapper: {
    justifyContent: "center",
    position: "relative",

    "--progress-border-width": 8,
    // Scope to this ProgressBar only — a parent (e.g. Button) may also set
    // data-size; :is([data-size=lg] *) would incorrectly enlarge nested spinners.
    "--progress-size": {
      ":is([data-progress-circle][data-size=lg] *)": sizeSpace["4xl"],
      ":is([data-progress-circle][data-size=md] *)": sizeSpace["3xl"],
      ":is([data-progress-circle][data-size=sm] *)": sizeSpace["md"],
    },
  },
  track: {
    borderColor: uiColor.component1,
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: "var(--progress-border-width)",
    boxSizing: "border-box",
    height: "var(--progress-size)",
    width: "var(--progress-size)",
  },
  fills: {
    position: "absolute",
    height: "100%",
    left: 0,
    top: 0,
    width: "100%",
  },
  fillMask: {
    overflow: "hidden",
    boxSizing: "border-box",
    position: "absolute",
    transformOrigin: "100%",
    height: "100%",
    width: "50%",
  },
  fillMask1: {
    transform: "rotate(0deg)",
  },
  fillMask2: {
    transform: "rotate(180deg)",
  },
  fillSubmask: {
    overflow: "hidden",
    boxSizing: "border-box",
    transformOrigin: "100%",
    transitionDuration: animationDuration.default,
    transitionProperty: "transform",
    transitionTimingFunction: "linear",
    height: "100%",
    width: "100%",
  },
  fill: {
    borderColor: primaryColor.solid1,
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: "var(--progress-border-width)",
    boxSizing: "border-box",
    height: "var(--progress-size)",
    width: "var(--progress-size)",
  },
  check: {
    position: "absolute",
    transform: "translate(-50%, -50%)",
    left: "50%",
    top: "50%",
  },
  completed: {
    backgroundColor: primaryColor.solid1,
  },
  indeterminateFillAnimation: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: IndeterminateFillAnimation,
    animationTimingFunction: "linear",
  },
});

export interface ProgressCircleProps extends StyleXComponentProps<
  Omit<AriaProgressBarProps, "children">
> {
  label?: string;
  size?: Size;
}

export function ProgressCircle({
  label,
  style,
  size: sizeProp,
  ...props
}: ProgressCircleProps) {
  const size = sizeProp || use(SizeContext);

  return (
    <ProgressBar
      {...props}
      data-progress-circle
      data-size={size}
      {...stylex.props(styles.wrapper, style)}
    >
      {({ percentage = 0, isIndeterminate }) => {
        const rotateFirstHalf = Math.min(0.5, percentage / 100) * 360 - 180;
        const rotateSecondHalf = (1 - Math.max(0.5, percentage / 100)) * -360;

        return (
          <>
            <div {...stylex.props(styles.circleWrapper)}>
              <div
                {...stylex.props(
                  styles.track,
                  percentage === 100 && styles.completed,
                )}
              />

              {isIndeterminate ? (
                <div {...stylex.props(styles.fills)}>
                  <div
                    {...stylex.props(
                      styles.fillMask,
                      styles.fillMask1,
                      styles.indeterminateFillAnimation,
                    )}
                  >
                    <div
                      {...stylex.props(styles.fillSubmask)}
                      style={{ transform: "rotate(90deg)" }}
                    >
                      <div {...stylex.props(styles.fill)} />
                    </div>
                  </div>
                </div>
              ) : (
                <div {...stylex.props(styles.fills)}>
                  <div {...stylex.props(styles.fillMask, styles.fillMask1)}>
                    <div
                      {...stylex.props(styles.fillSubmask)}
                      style={{
                        transform: `rotate(${rotateSecondHalf.toString()}deg)`,
                      }}
                    >
                      <div {...stylex.props(styles.fill)} />
                    </div>
                  </div>
                  <div {...stylex.props(styles.fillMask, styles.fillMask2)}>
                    <div
                      {...stylex.props(styles.fillSubmask)}
                      style={{
                        transform: `rotate(${rotateFirstHalf.toString()}deg)`,
                      }}
                    >
                      <div {...stylex.props(styles.fill)} />
                    </div>
                  </div>
                </div>
              )}

              {percentage === 100 && <Check {...stylex.props(styles.check)} />}
            </div>
            {label && <Label>{label}</Label>}
          </>
        );
      }}
    </ProgressBar>
  );
}
