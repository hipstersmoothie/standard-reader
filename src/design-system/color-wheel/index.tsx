import type { ColorWheelProps as AriaColorWheelProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { use } from "react";
import {
  ColorWheel as AriaColorWheel,
  ColorWheelTrack,
} from "react-aria-components";

import type { Size, StyleXComponentProps } from "../theme/types";

import { ColorThumb } from "../color-area";
import { SizeContext } from "../context";
import { Flex } from "../flex";
import { uiColor } from "../theme/color.stylex";
import { radius } from "../theme/radius.stylex";
import { size as sizeSpace } from "../theme/semantic-spacing.stylex";

const styles = stylex.create({
  wrapper: {
    width: "fit-content",
  },
  track: {
    gridColumnEnd: 'track',
    gridColumnStart: 'track',
    gridRowEnd: 'track',
    gridRowStart: 'track',
    borderRadius: radius.full,
    height: {
      ":is([data-size=lg] *)": sizeSpace["xl"],
      ":is([data-size=md] *)": sizeSpace["md"],
      ":is([data-size=sm] *)": sizeSpace["xxs"],
    },
    width: "100%",

    backgroundImage: {
      ":is([data-disabled])": `linear-gradient(${uiColor.component2}, ${uiColor.component2}) !important`,
    },
  },
  thumb: {
    top: "50%",
  },
  children: {
    position: "absolute",
    transform: "translate(-50%, -50%)",
    height: "80%",
    left: "50%",
    top: "50%",
    width: "80%",
  },
});

export interface ColorWheelProps extends StyleXComponentProps<
  Omit<AriaColorWheelProps, "children" | "outerRadius" | "innerRadius">
> {
  size?: Size;
  width: number;
  children?: React.ReactNode;
}

export function ColorWheel({
  style,
  size: sizeProp,
  width,
  children,
  ...props
}: ColorWheelProps) {
  const size = sizeProp || use(SizeContext);
  const trackWidth = size === "sm" ? 12 : size === "md" ? 16 : 24;

  return (
    <AriaColorWheel
      {...props}
      {...stylex.props(styles.wrapper, style)}
      data-size={size}
      outerRadius={width}
      innerRadius={width - trackWidth}
    >
      <ColorWheelTrack {...stylex.props(styles.track)} />
      <ColorThumb style={styles.thumb} />
      {Boolean(children) && (
        <Flex style={styles.children} align="center" justify="center">
          {children}
        </Flex>
      )}
    </AriaColorWheel>
  );
}
