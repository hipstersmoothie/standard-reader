import type {
  ColorPickerProps as AriaColorPickerProps,
  Color,
  ColorSpace,
  PopoverProps,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { Pipette } from "lucide-react";
import { createContext, use, useMemo } from "react";
import {
  ColorPicker as AriaColorPicker,
  Button,
  ColorPickerStateContext,
  Dialog,
  DialogTrigger,
  Popover,
} from "react-aria-components";

import type { FlexProps } from "../flex";
import type { Size, StyleXComponentProps } from "../theme/types";

import { ColorArea } from "../color-area";
import { ColorField } from "../color-field";
import { ColorSlider } from "../color-slider";
import { ColorSwatch } from "../color-swatch";
import {
  ColorSwatchPicker,
  ColorSwatchPickerItem,
} from "../color-swatch-picker";
import { SizeContext } from "../context";
import { Flex } from "../flex";
import { IconButton } from "../icon-button";
import { Select, SelectItem } from "../select";
import { Separator } from "../separator";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { fontSize } from "../theme/typography.stylex";
import { usePopoverStyles } from "../theme/usePopoverStyles";

const ColorSpaceContext = createContext<ColorSpace>("hsb");

const styles = stylex.create({
  button: {
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    borderWidth: 0,
    paddingRight: 0,
    gap: {
      default: gap["md"],
      ":is([data-size=sm])": sizeSpace["xxs"],
    },
    paddingTop: 0,
    alignItems: "center",
    backgroundColor: "transparent",
    display: "flex",
    fontSize: fontSize["sm"],
  },
  root: {
    display: "block",
  },
  defaultPicker: {
    paddingBottom: verticalSpace["xl"],
    paddingLeft: horizontalSpace["md"],
    paddingRight: horizontalSpace["md"],
    paddingTop: verticalSpace["md"],
  },
  popover: {
    paddingBottom: 0,
    paddingTop: 0,
    width: 328,
  },
  separator: {
    marginLeft: `calc(${horizontalSpace["sm"]} * -1)`,
    marginRight: `calc(${horizontalSpace["sm"]} * -1)`,
    width: `calc(100% + ${sizeSpace["sm"]} * 2)`,
  },
  grow: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  controls: {
    paddingLeft: horizontalSpace["xs"],
    paddingRight: horizontalSpace["xs"],
  },
});

export interface ColorPickerProps
  extends
    StyleXComponentProps<Omit<AriaColorPickerProps, "children">>,
    Pick<PopoverProps, "placement"> {
  children?: React.ReactNode;
  size?: Size;
  label?: string;
}

function ColorSpaceProvider({ children }: { children: React.ReactNode }) {
  const state = use(ColorPickerStateContext);

  if (!state?.color) {
    throw new Error("Color needs to be a defined value");
  }

  const colorSpace = useMemo(() => state.color.getColorSpace(), [state.color]);

  return <ColorSpaceContext value={colorSpace}>{children}</ColorSpaceContext>;
}

export function ColorPicker({
  style,
  children,
  label,
  size: sizeProp,
  placement,
  ...props
}: ColorPickerProps) {
  const popoverStyles = usePopoverStyles();
  const size = sizeProp || use(SizeContext);

  return (
    <SizeContext value={size}>
      <AriaColorPicker {...props} {...stylex.props(styles.root, style)}>
        <ColorSpaceProvider>
          <DialogTrigger>
            <Button data-size={size} {...stylex.props(styles.button)}>
              <ColorSwatch />
              {label && <span>{label}</span>}
            </Button>
            <Popover
              placement={placement}
              {...stylex.props(
                popoverStyles.wrapper,
                popoverStyles.animation,
                styles.popover,
              )}
            >
              <Dialog className="color-picker-dialog">{children}</Dialog>
            </Popover>
          </DialogTrigger>
        </ColorSpaceProvider>
      </AriaColorPicker>
    </SizeContext>
  );
}

export interface DefaultColorEditorProps extends FlexProps {
  swatches?: Array<string>;
  onSwatchChange?: (color: Color) => void;
  hasAlpha?: boolean;
}

export function DefaultColorEditor({
  style,
  swatches,
  onSwatchChange,
  hasAlpha = true,
  ...props
}: DefaultColorEditorProps) {
  const colorSpace = use(ColorSpaceContext);
  const state = use(ColorPickerStateContext);

  return (
    <Flex
      direction="column"
      gap="xl"
      {...props}
      style={[styles.defaultPicker, style]}
    >
      {colorSpace === "hsb" ? (
        <ColorArea
          colorSpace={colorSpace}
          xChannel="saturation"
          yChannel="brightness"
        />
      ) : colorSpace === "hsl" ? (
        <ColorArea
          colorSpace={colorSpace}
          xChannel="hue"
          yChannel="saturation"
        />
      ) : (
        <ColorArea colorSpace={colorSpace} xChannel="red" yChannel="green" />
      )}

      <Separator style={styles.separator} />

      <Flex gap="md" align="center">
        <IconButton label="Pick color" variant="outline">
          <Pipette />
        </IconButton>
        <Select
          aria-label="Color format"
          value={colorSpace}
          onChange={(key) => {
            state?.setColor(state.color.toFormat(key as ColorSpace));
          }}
        >
          <SelectItem id="hsb">HSB</SelectItem>
          <SelectItem id="hsl">HSL</SelectItem>
          <SelectItem id="rgb">RGB</SelectItem>
        </Select>
        <ColorField
          aria-label="HEX code"
          colorSpace={colorSpace}
          style={styles.grow}
        />
        {hasAlpha && (
          <ColorField
            aria-label="Alpha"
            colorSpace={colorSpace}
            channel="alpha"
            style={styles.grow}
          />
        )}
      </Flex>

      <Separator style={styles.separator} />

      <SizeContext value="sm">
        <Flex direction="column" gap="xl" style={styles.controls}>
          {colorSpace === "hsb" ? (
            <>
              <ColorSlider label="Hue" channel="hue" colorSpace={colorSpace} />
              <ColorSlider
                label="Saturation"
                channel="saturation"
                colorSpace={colorSpace}
              />
              <ColorSlider
                label="Brightness"
                channel="brightness"
                colorSpace={colorSpace}
              />
            </>
          ) : colorSpace === "hsl" ? (
            <>
              <ColorSlider label="Hue" channel="hue" colorSpace={colorSpace} />
              <ColorSlider
                label="Saturation"
                channel="saturation"
                colorSpace={colorSpace}
              />
              <ColorSlider
                label="Lightness"
                channel="lightness"
                colorSpace={colorSpace}
              />
            </>
          ) : (
            <>
              <ColorSlider label="Red" channel="red" colorSpace={colorSpace} />
              <ColorSlider
                label="Green"
                channel="green"
                colorSpace={colorSpace}
              />
              <ColorSlider
                label="Blue"
                channel="blue"
                colorSpace={colorSpace}
              />
            </>
          )}

          {hasAlpha && (
            <ColorSlider
              label="Alpha"
              channel="alpha"
              colorSpace={colorSpace}
            />
          )}
        </Flex>
      </SizeContext>
      {swatches && (
        <>
          <Separator style={styles.separator} />
          <Flex direction="column" align="center">
            <ColorSwatchPicker onChange={onSwatchChange}>
              {swatches.map((swatch) => (
                <ColorSwatchPickerItem key={swatch} color={swatch} />
              ))}
            </ColorSwatchPicker>
          </Flex>
        </>
      )}
    </Flex>
  );
}
