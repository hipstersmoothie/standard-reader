import type { SliderProps as AriaSliderProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import {
  Slider as AriaSlider,
  SliderOutput,
  SliderThumb,
  SliderTrack,
} from "react-aria-components";

import type { StyleXComponentProps } from "../theme/types";

import { Label } from "../label";
import { primaryColor, uiColor } from "../theme/color.stylex";
import { radius } from "../theme/radius.stylex";
import { gap, size as sizeSpace } from "../theme/semantic-spacing.stylex";
import { shadow } from "../theme/shadow.stylex";
import { fontSize, lineHeight } from "../theme/typography.stylex";

const styles = stylex.create({
  wrapper: {
    gap: {
      ":is([data-orientation=vertical])": gap["md"],
    },
    gridTemplateAreas: "'label value-label' 'track track'",
    alignItems: {
      ":is([data-orientation=vertical])": "center",
    },
    display: {
      default: "grid",
      ":is([data-orientation=vertical])": "flex",
    },
    flexDirection: {
      ":is([data-orientation=vertical])": "column",
    },
  },
  track: {
    flexGrow: {
      ":is([data-orientation=vertical] *)": 1,
    },
    gridColumnEnd: "track",
    gridColumnStart: "track",
    gridRowEnd: "track",
    gridRowStart: "track",
    opacity: {
      ":is([data-disabled=true] *)": 0.5,
    },
    position: "relative",
    height: {
      ":is([data-orientation=horizontal] *)": sizeSpace["3xl"],
      ":is([data-orientation=horizontal] *)::before": sizeSpace["xxs"],
      ":is([data-orientation=vertical] *)": "100%",
      ":is([data-orientation=vertical] *)::before": "100%",
    },
    width: {
      ":is([data-orientation=horizontal] *)": "100%",
      ":is([data-orientation=horizontal] *)::before": "100%",
      ":is([data-orientation=vertical] *)": sizeSpace["3xl"],
      ":is([data-orientation=vertical] *)::before": sizeSpace["xxs"],
    },

    transform: {
      ":is([data-orientation=horizontal] *)::before": "translateY(-50%)",
      ":is([data-orientation=vertical] *)::before": "translateX(-50%)",
    },
    bottom: {
      ":is([data-orientation=vertical] *)::before": 0,
    },
    left: {
      ":is([data-orientation=horizontal] *)::before": 0,
      ":is([data-orientation=vertical] *)::before": "50%",
    },
    right: {
      ":is([data-orientation=horizontal] *)::before": 0,
    },
    top: {
      ":is([data-orientation=horizontal] *)::before": "50%",
      ":is([data-orientation=vertical] *)::before": 0,
    },
    "::before": {
      borderRadius: radius.full,
      backgroundColor: uiColor.border1,
      content: "''",
      position: "absolute",
    },
  },
  thumb: {
    borderColor: uiColor.border1,
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: {
      default: uiColor.component1,
      ":is([data-dragging=true])": uiColor.component3,
      ":is([data-hovered])": uiColor.component2,
    },
    boxShadow: shadow.md,
    content: "''",
    forcedColorAdjust: "none",
    height: sizeSpace["md"],
    left: {
      ":is([data-orientation=vertical] *)": "50%",
    },
    top: {
      ":is([data-orientation=horizontal] *)": "50%",
    },
    width: sizeSpace["md"],
  },
  trackInner: {
    borderRadius: radius.full,
    backgroundColor: {
      default: primaryColor.solid1,
      ":is([data-disabled=true] *)": uiColor.border3,
    },
    position: "absolute",
    transform: {
      ":is([data-orientation=horizontal] *)": "translateY(-50%)",
      ":is([data-orientation=vertical] *)": "translateX(-50%)",
    },
    height: {
      ":is([data-orientation=horizontal] *)": sizeSpace["xxs"],
      ":is([data-orientation=vertical] *)": "100%",
    },
    left: {
      ":is([data-orientation=vertical] *)": "50%",
    },
    top: {
      ":is([data-orientation=horizontal] *)": "50%",
    },
    width: {
      ":is([data-orientation=horizontal] *)": "100%",
      ":is([data-orientation=vertical] *)": sizeSpace["xxs"],
    },
  },
  trackSingle: {
    height: {
      ":is([data-orientation=horizontal] *)": sizeSpace["xxs"],
      ":is([data-orientation=vertical] *)":
        "calc(attr(data-progress number) * 1%)",
    },
    width: {
      ":is([data-orientation=horizontal] *)":
        "calc(attr(data-progress number) * 1%)",
      ":is([data-orientation=vertical] *)": sizeSpace["xxs"],
    },
  },
  trackMultiple: {
    height: {
      ":is([data-orientation=horizontal] *)": sizeSpace["xxs"],
      ":is([data-orientation=vertical] *)":
        "calc(attr(data-progress-end number) * 1% - attr(data-progress-start number) * 1%)",
    },
    left: {
      ":is([data-orientation=horizontal] *)":
        "calc(attr(data-progress-start number) * 1%)",
      ":is([data-orientation=vertical] *)": "50%",
    },
    top: {
      ":is([data-orientation=horizontal] *)": "50%",
      ":is([data-orientation=vertical] *)":
        "calc(100% - attr(data-progress-end number) * 1%)",
    },
    width: {
      ":is([data-orientation=horizontal] *)":
        "calc(attr(data-progress-end number) * 1% - attr(data-progress-start number) * 1%)",
      ":is([data-orientation=vertical] *)": sizeSpace["xxs"],
    },
  },
  valueLabel: {
    color: uiColor.text1,
    fontSize: fontSize["sm"],
    fontVariantNumeric: "tabular-nums",
    gridColumnEnd: "value-label",
    gridColumnStart: "value-label",
    gridRowEnd: "value-label",
    gridRowStart: "value-label",
    justifySelf: "flex-end",
    lineHeight: lineHeight["sm"],
  },
  label: {
    gridColumnEnd: "label",
    gridColumnStart: "label",
    gridRowEnd: "label",
    gridRowStart: "label",
  },
});

interface SliderProps<T> extends StyleXComponentProps<AriaSliderProps<T>> {
  label?: string;
  names?: Array<string>;
  thumbLabels?: Array<string>;
  autoFocus?: boolean;
  showValueLabel?: boolean;
}

export function Slider<T extends number | Array<number>>({
  label,
  thumbLabels,
  style,
  names,
  autoFocus,
  showValueLabel = true,
  ...props
}: SliderProps<T>) {
  return (
    <AriaSlider {...props} {...stylex.props(styles.wrapper, style)}>
      {label && <Label style={styles.label}>{label}</Label>}
      {showValueLabel && (
        <SliderOutput {...stylex.props(styles.valueLabel)}>
          {({ state }) =>
            state.values.map((_, i) => state.getThumbValueLabel(i)).join(" – ")
          }
        </SliderOutput>
      )}
      <SliderTrack {...stylex.props(styles.track)}>
        {({ state }) => (
          <>
            {state.values.length === 1 && (
              <div
                data-progress={state.getThumbPercent(0) * 100}
                {...stylex.props(styles.trackInner, styles.trackSingle)}
              />
            )}
            {state.values.length > 1 && (
              <div
                data-progress-start={state.getThumbPercent(0) * 100}
                data-progress-end={
                  state.getThumbPercent(state.values.length - 1) * 100
                }
                {...stylex.props(styles.trackInner, styles.trackMultiple)}
              />
            )}
            {state.values.map((_, i) => (
              <SliderThumb
                key={i}
                index={i}
                aria-label={thumbLabels?.[i]}
                name={names?.[i]}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus={autoFocus && i === 0}
                {...stylex.props(styles.thumb)}
              />
            ))}
          </>
        )}
      </SliderTrack>
    </AriaSlider>
  );
}
