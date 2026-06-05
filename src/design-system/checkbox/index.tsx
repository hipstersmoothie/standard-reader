import type {
  CheckboxGroupProps as AriaCheckboxGroupProps,
  CheckboxProps as AriaCheckboxProps,
  ValidationResult,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { Check, Minus } from "lucide-react";
import { use } from "react";
import {
  Checkbox as AriaCheckbox,
  CheckboxGroup as AriaCheckboxGroup,
} from "react-aria-components";

import type { Size, StyleXComponentProps } from "../theme/types";

import { SizeContext } from "../context";
import { Flex } from "../flex";
import { Description, FieldErrorMessage, Label } from "../label";
import { radius } from "../theme/radius.stylex";
import { primary, ui } from "../theme/semantic-color.stylex";
import { gap, size as sizeSpace } from "../theme/semantic-spacing.stylex";
import { fontFamily, fontSize, lineHeight } from "../theme/typography.stylex";

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
  checkbox: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",

    borderRadius: radius.sm,
    borderWidth: 2,

    cornerShape: "squircle",
    height: sizeSpace["md"],
    width: sizeSpace["md"],
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

interface CheckboxGroupProps extends StyleXComponentProps<
  Omit<AriaCheckboxGroupProps, "children">
> {
  children?: React.ReactNode;
  label?: React.ReactNode;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  size?: Size;
}

export function CheckboxGroup({
  label,
  description,
  errorMessage,
  children,
  size: sizeProp,
  style,
  ...props
}: CheckboxGroupProps) {
  const size = sizeProp || use(SizeContext);

  return (
    <SizeContext value={size}>
      <AriaCheckboxGroup {...props} {...stylex.props(styles.group, style)}>
        <Label>{label}</Label>
        <Flex direction="column" gap="md">
          {children}
        </Flex>
        <Description>{description}</Description>
        <FieldErrorMessage>{errorMessage}</FieldErrorMessage>
      </AriaCheckboxGroup>
    </SizeContext>
  );
}

export interface CheckboxProps extends StyleXComponentProps<
  Omit<AriaCheckboxProps, "children">
> {
  children?: React.ReactNode;
}

export function Checkbox({ children, style, ...props }: CheckboxProps) {
  return (
    <AriaCheckbox {...props} {...stylex.props(styles.wrapper, style)}>
      {({ isIndeterminate, isSelected, isDisabled, isHovered }) => (
        <>
          <div
            data-hovered={isHovered || undefined}
            {...stylex.props(
              styles.checkbox,
              isDisabled
                ? [ui.bgSolid, ui.border, styles.checked]
                : isSelected
                  ? [primary.bgSolid, primary.borderInteractive, styles.checked]
                  : [ui.borderInteractive],
            )}
          >
            {isIndeterminate ? (
              <Minus size={16} />
            ) : isSelected ? (
              <Check size={16} />
            ) : null}
          </div>
          {children != null && (
            <Flex direction="column" gap="xs">
              {children}
            </Flex>
          )}
        </>
      )}
    </AriaCheckbox>
  );
}
