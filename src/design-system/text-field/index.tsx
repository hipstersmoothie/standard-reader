import type {
  TextFieldProps as AriaTextFieldProps,
  InputProps,
  ValidationResult,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { Eye, EyeOff } from "lucide-react";
import { use, useRef, useState } from "react";
import {
  TextField as AriaTextField,
  Input,
  InputContext,
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
import { IconButton } from "../icon-button";
import { Description, FieldErrorMessage, Label } from "../label";
import { SuffixIcon } from "../suffix-icon";
import { useInputStyles } from "../theme/useInputStyles";

function PasswordToggle({
  type,
  setType,
  style,
}: {
  type: TextFieldProps["type"];
  setType: (type: TextFieldProps["type"]) => void;
  style?: stylex.StyleXStyles;
}) {
  const state = use(InputContext);

  if (!state || !("value" in state) || !state.value) return null;

  return (
    <div {...stylex.props(style)}>
      <IconButton
        size="sm"
        variant="tertiary"
        label="Toggle password visibility"
        onPress={() => {
          setType(type === "password" ? "text" : "password");
        }}
      >
        {type === "password" ? <EyeOff /> : <Eye />}
      </IconButton>
    </div>
  );
}

interface TextFieldContentProps {
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
  placeholder?: string;
  type: TextFieldProps["type"];
  setType: (type: TextFieldProps["type"]) => void;
  isRequired: boolean;
}

function TextFieldContent({
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
  placeholder,
  type,
  setType,
  isRequired,
}: TextFieldContentProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isPasswordInput = type === "password";
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
        <Input
          {...stylex.props(inputStyles.input)}
          ref={inputRef}
          placeholder={placeholder}
          data-focus-always-visible
        />
        {isPasswordInput && (
          <PasswordToggle
            type={type}
            setType={setType}
            style={inputStyles.addon}
          />
        )}
        <SuffixIcon
          suffix={suffix}
          style={inputStyles.addon}
          validationIconStyle={inputStyles.validationIcon}
          validationState={validationState}
        />
      </div>
      <Description style={inputStyles.description}>{description}</Description>
      {errorMessage && (
        <FieldErrorMessage style={inputStyles.errorMessage}>
          {errorMessage}
        </FieldErrorMessage>
      )}
    </>
  );

  return (
    <>
      {label && (
        <Label style={inputStyles.label}>
          {label}{" "}
          {isRequired ? (
            <span {...stylex.props(inputStyles.required)}>*</span>
          ) : null}
        </Label>
      )}

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

export interface TextFieldProps
  extends
    StyleXComponentProps<Omit<AriaTextFieldProps, "isInvalid">>,
    Pick<InputProps, "placeholder"> {
  label?: React.ReactNode;
  labelVariant?: LabelVariant;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  size?: Size;
  variant?: InputVariant;
  validationState?: InputValidationState;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export function TextField({
  label,
  description,
  errorMessage,
  style,
  size: sizeProp,
  variant,
  validationState,
  prefix,
  suffix,
  placeholder,
  labelVariant,
  ...props
}: TextFieldProps) {
  const size = sizeProp || use(SizeContext);
  const [type, setType] = useState<TextFieldProps["type"]>(
    props.type || "text",
  );
  const inputStyles = useInputStyles({
    size,
    variant,
    labelVariant,
    validationState,
  });

  return (
    <SizeContext value={size}>
      <AriaTextField
        {...props}
        isInvalid={validationState ? validationState === "invalid" : undefined}
        type={type}
        {...stylex.props(inputStyles.field, style)}
      >
        {({ isInvalid, isRequired }) => (
          <TextFieldContent
            isRequired={isRequired}
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
            placeholder={placeholder}
            type={type}
            setType={setType}
          />
        )}
      </AriaTextField>
    </SizeContext>
  );
}
