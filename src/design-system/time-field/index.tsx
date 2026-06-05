import type {
  TimeFieldProps as AriaTimeFieldProps,
  TimeValue,
  ValidationResult,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { use, useRef } from "react";
import {
  TimeField as AriaTimeField,
  DateInput,
  DateSegment,
} from "react-aria-components";

import type {
  InputValidationState,
  InputVariant,
  LabelVariant,
  Size,
  StyleXComponentProps,
} from "../theme/types";

import { SizeContext } from "../context";
import { Flex } from "../flex";
import { Description, FieldErrorMessage, Label } from "../label";
import { SuffixIcon } from "../suffix-icon";
import { useInputStyles } from "../theme/useInputStyles";

interface TimeFieldContentProps {
  label?: React.ReactNode;
  labelVariant?: LabelVariant;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  size: Size;
  variant: InputVariant | undefined;
  validationState: InputValidationState | undefined;
  isInvalid: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

function TimeFieldContent({
  label,
  labelVariant,
  description,
  errorMessage,
  size,
  variant,
  validationState,
  isInvalid,
  prefix,
  suffix,
}: TimeFieldContentProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputStyles = useInputStyles({
    size,
    variant,
    labelVariant,
    validationState: isInvalid ? "invalid" : validationState,
  });

  const content = (
    <>
      {/*
        This onClick is specifically for mouse users not clicking directly on the input.
        A keyboard user would not encounter the same issue.
      */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        {...stylex.props(inputStyles.wrapper)}
        onClick={() => inputRef.current?.focus()}
      >
        {prefix != null && (
          <div {...stylex.props(inputStyles.addon)}>{prefix}</div>
        )}
        <DateInput {...stylex.props(inputStyles.input)} ref={inputRef}>
          {(segment) => <DateSegment segment={segment} />}
        </DateInput>
        <SuffixIcon
          suffix={suffix}
          style={inputStyles.addon}
          validationIconStyle={inputStyles.validationIcon}
          validationState={validationState}
        />
      </div>
      <Description style={inputStyles.description}>{description}</Description>
      <FieldErrorMessage style={inputStyles.errorMessage}>
        {errorMessage}
      </FieldErrorMessage>
    </>
  );

  return (
    <>
      <Label style={inputStyles.label}>{label}</Label>
      {labelVariant === "horizontal" ? (
        <Flex direction="column" gap="md">
          {content}
        </Flex>
      ) : (
        content
      )}
    </>
  );
}

export interface TimeFieldProps<
  T extends TimeValue,
> extends StyleXComponentProps<Omit<AriaTimeFieldProps<T>, "isInvalid">> {
  label?: React.ReactNode;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  size?: Size;
  variant?: InputVariant;
  labelVariant?: LabelVariant;
  validationState?: InputValidationState;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export function TimeField<T extends TimeValue>({
  label,
  description,
  errorMessage,
  style,
  size: sizeProp,
  variant,
  labelVariant,
  validationState,
  prefix,
  suffix,
  ...props
}: TimeFieldProps<T>) {
  const size = sizeProp || use(SizeContext);
  const inputStyles = useInputStyles({
    size,
    variant,
    labelVariant,
    validationState,
  });

  return (
    <SizeContext value={size}>
      <AriaTimeField
        {...props}
        isInvalid={validationState ? validationState === "invalid" : undefined}
        {...stylex.props(inputStyles.field, style)}
      >
        {({ isInvalid }) => (
          <TimeFieldContent
            label={label}
            labelVariant={labelVariant}
            description={description}
            errorMessage={errorMessage}
            size={size}
            variant={variant}
            validationState={validationState}
            isInvalid={isInvalid}
            prefix={prefix}
            suffix={suffix}
          />
        )}
      </AriaTimeField>
    </SizeContext>
  );
}
