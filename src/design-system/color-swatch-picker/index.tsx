import type {
  ColorSwatchPickerItemProps as AriaColorSwatchPickerItemProps,
  ColorSwatchPickerProps as AriaColorSwatchPickerProps,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { use } from "react";
import {
  ColorSwatchPicker as AriaColorSwatchPicker,
  ColorSwatchPickerItem as AriaColorSwatchPickerItem,
} from "react-aria-components";

import type { Size, StyleXComponentProps } from "../theme/types";

import { ColorSwatch } from "../color-swatch";
import { SizeContext } from "../context";
import { uiColor } from "../theme/color.stylex";
import { radius } from "../theme/radius.stylex";
import { gap, size as sizeSpace } from "../theme/semantic-spacing.stylex";

const styles = stylex.create({
  picker: {
    gap: {
      default: gap["md"],
      ":is([data-size=sm])": sizeSpace["xxs"],
    },
    display: "flex",
    flexDirection: {
      default: "row",
      ":is([data-layout=stack])": "column",
    },
    flexWrap: "wrap",
  },
  item: {
    borderRadius: {
      ":is([data-size=lg] *)": radius.lg,
      ":is([data-size=md] *)": radius.md,
      ":is([data-size=sm] *)": radius.sm,
    },
    outline: "none",
    boxSizing: "border-box",
    forcedColorAdjust: "none",
    position: "relative",
    width: "fit-content",

    borderColor: { ":is([data-selected])::after": uiColor.border3 },
    borderStyle: { ":is([data-selected])::after": "solid" },
    borderWidth: { ":is([data-selected])::after": 1 },
    outlineColor: { ":is([data-selected])::after": "white" },
    outlineOffset: { ":is([data-selected])::after": "-2px" },
    outlineStyle: { ":is([data-selected])::after": "solid" },
    outlineWidth: { ":is([data-selected])::after": "2px" },
    "::after": {
      inset: 0,
      borderRadius: "inherit",
      boxSizing: "border-box",
      content: "",
      position: "absolute",
    },
  },
});

export interface ColorSwatchPickerProps extends StyleXComponentProps<
  Omit<AriaColorSwatchPickerProps, "children">
> {
  children?: React.ReactNode;
  layout?: "grid" | "stack";
  size?: Size;
}

export function ColorSwatchPicker({
  style,
  size: sizeProp,
  children,
  layout = "grid",
  ...props
}: ColorSwatchPickerProps) {
  const size = sizeProp || use(SizeContext);

  return (
    <SizeContext value={size}>
      <AriaColorSwatchPicker
        layout={layout}
        data-size={size}
        {...props}
        {...stylex.props(styles.picker, style)}
      >
        {children}
      </AriaColorSwatchPicker>
    </SizeContext>
  );
}

export interface ColorSwatchPickerItemProps extends StyleXComponentProps<
  Omit<AriaColorSwatchPickerItemProps, "children">
> {}

export function ColorSwatchPickerItem({
  style,
  ...props
}: ColorSwatchPickerItemProps) {
  return (
    <AriaColorSwatchPickerItem {...props} {...stylex.props(styles.item, style)}>
      <ColorSwatch />
    </AriaColorSwatchPickerItem>
  );
}

export { ColorSwatch } from "../color-swatch";
