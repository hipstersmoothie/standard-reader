import type {
  LabelProps as AriaLabelProps,
  FieldErrorProps,
  TextProps,
  ValidationResult,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { use } from "react";
import { Label as AriaLabel, FieldError, Text } from "react-aria-components";

import type { Size, StyleXComponentProps } from "../theme/types";

import { SizeContext } from "../context";
import { uiColor } from "../theme/color.stylex";
import { critical, ui } from "../theme/semantic-color.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "../theme/typography.stylex";

const styles = stylex.create({
  label: {
    color: uiColor.text1,
    fontWeight: fontWeight["semibold"],
    fontFamily: fontFamily["sans"],

    fontSize: {
      ":is([data-size=lg])": fontSize["sm"],
      ":is([data-size=md])": fontSize["xs"],
      ":is([data-size=sm])": fontSize["xs"],
    },
    lineHeight: {
      ":is([data-size=lg])": lineHeight["base"],
      ":is([data-size=md])": lineHeight["sm"],
      ":is([data-size=sm])": lineHeight["xs"],
    },
  },
  description: {
    color: ui.textDim,
    fontSize: fontSize["sm"],
    lineHeight: lineHeight["sm"],
  },
  descriptionSm: {
    fontSize: fontSize["xs"],
    lineHeight: lineHeight["xs"],
  },
  errorMessage: {
    color: critical.textDim,
    fontSize: fontSize["sm"],
    lineHeight: lineHeight["sm"],
  },
  errorMessageSm: {
    fontSize: fontSize["xs"],
    lineHeight: lineHeight["xs"],
  },
});

export interface LabelProps extends StyleXComponentProps<AriaLabelProps> {
  size?: Size;
}

export function Label({ style, size: sizeProp, ...props }: LabelProps) {
  if (!props.children) return null;

  const size = sizeProp || use(SizeContext);

  return (
    <AriaLabel
      {...props}
      data-size={size}
      {...stylex.props(styles.label, style)}
    />
  );
}

export interface DescriptionProps extends StyleXComponentProps<TextProps> {
  size?: Size;
}

export function Description({
  style,
  size: sizeProp,
  ...props
}: DescriptionProps) {
  if (!props.children) return null;

  const size = sizeProp || use(SizeContext);

  return (
    <Text
      slot="description"
      {...stylex.props(
        styles.description,
        ui.textDim,
        size === "sm" && styles.descriptionSm,
        style,
      )}
      {...props}
    />
  );
}

export interface ErrorMessageProps extends StyleXComponentProps<TextProps> {
  size?: Size;
}

export function ErrorMessage({
  style,
  size: sizeProp,
  ...props
}: ErrorMessageProps) {
  const size = sizeProp || use(SizeContext);

  return (
    <Text
      slot="errorMessage"
      {...stylex.props(
        styles.errorMessage,
        critical.textDim,
        size === "sm" && styles.errorMessageSm,
        style,
      )}
      {...props}
    />
  );
}

export interface FieldErrorMessageProps extends StyleXComponentProps<
  Omit<FieldErrorProps, "children">
> {
  children?: string | ((validation: ValidationResult) => string) | undefined;
}

export function FieldErrorMessage({
  style,
  children,
  ...props
}: FieldErrorMessageProps) {
  return (
    <FieldError {...props} {...stylex.props(style)}>
      {(validationResult) => {
        if (validationResult.isInvalid) {
          return (
            <ErrorMessage>
              {typeof children === "function"
                ? children(validationResult)
                : children || validationResult.validationErrors.join(", ")}
            </ErrorMessage>
          );
        }
        return null;
      }}
    </FieldError>
  );
}
