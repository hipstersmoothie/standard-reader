import type { ProgressBarProps as AriaProgresBarProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { use } from "react";
import { ProgressBar as AriaProgressBar } from "react-aria-components";

import type { Size, StyleXComponentProps } from "../theme/types";

import { SizeContext } from "../context";
import { Label } from "../label";
import { animationDuration } from "../theme/animations.stylex";
import { primaryColor, uiColor } from "../theme/color.stylex";
import { mediaQueries } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import { gap, size as sizeSpace } from "../theme/semantic-spacing.stylex";
import { fontSize, lineHeight } from "../theme/typography.stylex";

const IndeterminateAnimation = stylex.keyframes({
  from: {
    transform: "translateX(-1.86%)",
  },
  to: {
    transform: "translateX(0%)",
  },
});

const styles = stylex.create({
  wrapper: {
    gap: gap["md"],
    gridTemplateAreas: "'label value-label' 'bar bar'",
    alignItems: "center",
    display: "grid",
  },
  label: {
    gridColumnEnd: 'label',
    gridColumnStart: 'label',
    gridRowEnd: 'label',
    gridRowStart: 'label',
  },
  bar: {
    gridColumnEnd: 'bar',
    gridColumnStart: 'bar',
    gridRowEnd: 'bar',
    gridRowStart: 'bar',
    borderRadius: radius.full,
    overflow: "hidden",
    backgroundColor: uiColor.component2,
    width: "100%",

    height: {
      ":is([data-size=lg] *)": sizeSpace["xxs"],
      ":is([data-size=md] *)": sizeSpace["sm"],
      ":is([data-size=sm] *)": sizeSpace["xxs"],
    },
  },
  valueLabel: {
    gridColumnEnd: 'value-label',
    gridColumnStart: 'value-label',
    gridRowEnd: 'value-label',
    gridRowStart: 'value-label',
    color: uiColor.text1,
    fontVariantNumeric: "tabular-nums",
    justifySelf: "flex-end",

    fontSize: {
      ":is([data-size=lg] *)": fontSize["base"],
      ":is([data-size=md] *)": fontSize["sm"],
      ":is([data-size=sm] *)": fontSize["xs"],
    },
    lineHeight: {
      ":is([data-size=lg] *)": lineHeight["base"],
      ":is([data-size=md] *)": lineHeight["sm"],
      ":is([data-size=sm] *)": lineHeight["xs"],
    },
  },
  fill: {
    backgroundColor: primaryColor.solid1,
    transform: "translateX(-100%)",
    transitionDuration: animationDuration.default,
    transitionProperty: "none",
    transitionTimingFunction: "linear",
    height: "100%",
    width: "100%",
  },
  progress: (percentage: number) => ({
    transform: `translateX(calc(${percentage.toString()}% - 100%))`,
  }),
  indeterminateFill: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: {
      default: IndeterminateAnimation,
      [mediaQueries.reducedMotion]: "none",
    },
    animationTimingFunction: "linear",
    backgroundImage: `repeating-linear-gradient(
      45deg,
      ${primaryColor.solid1},
      ${primaryColor.solid1} 20px,
      ${primaryColor.border2} 20px,
      ${primaryColor.border2} 40px
    )`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "20%",
    transformOrigin: "right",
    height: "100%",
    width: "1000%",
  },
});

export interface ProgressBarProps extends StyleXComponentProps<AriaProgresBarProps> {
  label?: string;
  showValueLabel?: boolean;
  size?: Size;
}

export function ProgressBar({
  label,
  style,
  showValueLabel = true,
  size: sizeProp,
  ...props
}: ProgressBarProps) {
  const size = sizeProp || use(SizeContext);

  return (
    <SizeContext value={size}>
      <AriaProgressBar
        {...props}
        data-size={size}
        {...stylex.props(styles.wrapper, style)}
      >
        {({ percentage, valueText, isIndeterminate }) => (
          <>
            {label && <Label style={styles.label}>{label}</Label>}
            {showValueLabel && (
              <span {...stylex.props(styles.valueLabel)}>{valueText}</span>
            )}
            <div {...stylex.props(styles.bar)}>
              {isIndeterminate ? (
                <div {...stylex.props(styles.indeterminateFill)} />
              ) : (
                <div
                  {...stylex.props(
                    styles.fill,
                    styles.progress(percentage ?? 0),
                  )}
                />
              )}
            </div>
          </>
        )}
      </AriaProgressBar>
    </SizeContext>
  );
}
