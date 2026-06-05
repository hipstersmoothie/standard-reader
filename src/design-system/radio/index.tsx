import type {
  RadioGroupProps as AriaRadioGroupProps,
  RadioProps as AriaRadioProps,
  ValidationResult,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { use } from "react";
import {
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  SelectionIndicator,
} from "react-aria-components";

import type { Size, StyleXComponentProps } from "../theme/types";

import { SizeContext } from "../context";
import { Flex } from "../flex";
import { Description, FieldErrorMessage, Label } from "../label";
import {
  animationDuration,
  animationTimingFunction,
} from "../theme/animations.stylex";
import { mediaQueries } from "../theme/media-queries.stylex";
import { radius } from "../theme/radius.stylex";
import { primary, ui } from "../theme/semantic-color.stylex";
import { gap, size as sizeSpace } from "../theme/semantic-spacing.stylex";
import { fontFamily, fontSize, lineHeight } from "../theme/typography.stylex";

const scaleIn = stylex.keyframes({
  "0%": {
    transform: "translate(-50%, -50%) scale(0)",
  },
  "100%": {
    transform: "translate(-50%, -50%) scale(1)",
  },
});

const styles = stylex.create({
  wrapper: {
    gap: gap["lg"],
    alignItems: {
      default: "center",
      ":has(p)": "flex-start",
    },
    display: "flex",
    fontFamily: fontFamily["sans"],
    fontSize: fontSize["sm"],
    lineHeight: lineHeight["sm"],
    opacity: { ":is([data-disabled])": 0.5 },
  },
  radio: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",

    borderRadius: radius.full,
    borderWidth: 2,
    position: "relative",
    height: sizeSpace["md"],
    width: sizeSpace["md"],

    transitionDuration: animationDuration.fast,
    transitionProperty: {
      default: "background-color, color",
      [mediaQueries.reducedMotion]: "none",
    },
    transitionTimingFunction: "ease-in-out",
  },
  selectionIndicator: {
    borderRadius: radius.full,
    backgroundColor: "white",
    height: sizeSpace["sm"],
    width: sizeSpace["sm"],

    position: "absolute",
    transform: "translate(-50%, -50%)",
    left: "50%",
    top: "50%",

    animationDuration: animationDuration.fast,
    animationFillMode: "forwards",
    animationName: {
      default: scaleIn,
      [mediaQueries.reducedMotion]: "none",
    },
    animationTimingFunction: animationTimingFunction.easeInOut,
  },
  checked: {
    color: "white",
  },
  group: {
    gap: gap["xl"],
    display: "flex",
    flexDirection: "column",
  },
});

interface RadioGroupProps extends StyleXComponentProps<
  Omit<AriaRadioGroupProps, "children">
> {
  children?: React.ReactNode;
  label?: React.ReactNode;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  size?: Size;
}

export function RadioGroup({
  label,
  description,
  errorMessage,
  children,
  size: sizeProp,
  style,
  ...props
}: RadioGroupProps) {
  const size = sizeProp || use(SizeContext);

  return (
    <SizeContext value={size}>
      <AriaRadioGroup {...props} {...stylex.props(styles.group, style)}>
        <Label>{label}</Label>
        <Flex direction="column" gap="md">
          {children}
        </Flex>
        <Description>{description}</Description>
        <FieldErrorMessage>{errorMessage}</FieldErrorMessage>
      </AriaRadioGroup>
    </SizeContext>
  );
}

export interface RadioProps extends StyleXComponentProps<
  Omit<AriaRadioProps, "children">
> {
  children?: React.ReactNode;
}

export function Radio({ children, style, ...props }: RadioProps) {
  return (
    <AriaRadio {...props} {...stylex.props(styles.wrapper, style)}>
      {({ isSelected, isDisabled, isHovered }) => (
        <>
          <div
            data-hovered={isHovered || undefined}
            {...stylex.props(
              styles.radio,
              isDisabled
                ? [ui.bgSolid, ui.border, styles.checked]
                : isSelected
                  ? [primary.bgSolid, primary.borderInteractive, styles.checked]
                  : [ui.borderInteractive],
            )}
          >
            <SelectionIndicator {...stylex.props(styles.selectionIndicator)} />
          </div>
          <Flex direction="column" gap="xs">
            {children}
          </Flex>
        </>
      )}
    </AriaRadio>
  );
}
