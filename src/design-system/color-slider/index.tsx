import type { ColorSliderProps as AriaColorSliderProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { use } from "react";
import {
  ColorSlider as AriaColorSlider,
  SliderOutput,
  SliderTrack,
} from "react-aria-components";

import type { Size, StyleXComponentProps } from "../theme/types";

import { ColorThumb } from "../color-area";
import { SizeContext } from "../context";
import { Label } from "../label";
import { uiColor } from "../theme/color.stylex";
import { radius } from "../theme/radius.stylex";
import { gap, size as sizeSpace } from "../theme/semantic-spacing.stylex";
import { fontSize, lineHeight } from "../theme/typography.stylex";

const styles = stylex.create({
  colorSlider: {
    gap: gap["md"],
    gridTemplateAreas: {
      default: "'track'",
      ":has(label,[data-slider-output])": "'label value-label' 'track track'",
    },
    display: "grid",
    flexDirection: "column",
  },
  label: {
    gridColumnEnd: 'label',
    gridColumnStart: 'label',
    gridRowEnd: 'label',
    gridRowStart: 'label',
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
  track: {
    gridColumnEnd: 'track',
    gridColumnStart: 'track',
    gridRowEnd: 'track',
    gridRowStart: 'track',
    borderRadius: radius.full,
    cornerShape: "squircle",
    height: {
      ":is([data-size=lg] *)": sizeSpace["xl"],
      ":is([data-size=md] *)": sizeSpace["md"],
      ":is([data-size=sm] *)": sizeSpace["xxs"],
    },
    width: "100%",
  },
  thumb: {
    top: "50%",
  },
});

export interface ColorAreaProps extends StyleXComponentProps<
  Omit<AriaColorSliderProps, "children">
> {
  label?: string;
  showValueLabel?: boolean;
  size?: Size;
}

export function ColorSlider({
  style,
  label,
  showValueLabel = true,
  size: sizeProp,
  ...props
}: ColorAreaProps) {
  const size = sizeProp || use(SizeContext);

  return (
    <SizeContext value={size}>
      <AriaColorSlider
        {...props}
        data-size={size}
        {...stylex.props(styles.colorSlider, style)}
      >
        {label && <Label style={styles.label}>{label}</Label>}
        {showValueLabel && (
          <SliderOutput
            data-slider-output
            {...stylex.props(styles.valueLabel)}
          />
        )}
        <SliderTrack
          {...stylex.props(styles.track)}
          style={({ defaultStyle, isDisabled }) => ({
            background: isDisabled
              ? uiColor.component2
              : `${defaultStyle.background as string},
                    repeating-conic-gradient(#CCC 0% 25%, white 0% 50%) 50% / 16px 16px`,
          })}
        >
          <ColorThumb style={styles.thumb} />
        </SliderTrack>
      </AriaColorSlider>
    </SizeContext>
  );
}
