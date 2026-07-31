import { useUNSAFE_PortalContext } from "@react-aria/overlays";
import * as stylex from "@stylexjs/stylex";
import { Minus, MoveHorizontal, Plus } from "lucide-react";
import { use, useRef } from "react";
import { mergeProps } from "react-aria";
import type {
  NumberFieldProps as AriaNumberFieldProps,
  InputProps,
  ValidationResult,
} from "react-aria-components";
import {
  NumberField as AriaNumberField,
  Button,
  Input,
  NumberFieldStateContext,
} from "react-aria-components";
import { createPortal } from "react-dom";

import { SizeContext } from "../context";
import { Flex } from "../flex";
import { Description, FieldErrorMessage, Label } from "../label";
import { SuffixIcon } from "../suffix-icon";
import { focusColor, uiColor } from "../theme/color.stylex";
import { ui } from "../theme/semantic-color.stylex";
import {
  horizontalSpace,
  size as sizeSpace,
} from "../theme/semantic-spacing.stylex";
import type {
  InputValidationState,
  InputVariant,
  LabelVariant,
  Size,
  StyleXComponentProps,
} from "../theme/types";
import { useInputStyles } from "../theme/useInputStyles";
import { usePointerLock } from "./usePointerLock";

interface NumberInputWrapperProps {
  style: stylex.StyleXStyles;
  onClick: () => void;
  children: React.ReactNode;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function NumberInputWrapper({
  style,
  onClick,
  children,
}: NumberInputWrapperProps) {
  const state = use(NumberFieldStateContext);
  const { lockProps, isLocked, cursorProps } = usePointerLock({
    onMove(e) {
      if (!state) return;
      state.setNumberValue(
        clamp(
          state.numberValue + e.deltaX,
          state.minValue ?? -Infinity,
          state.maxValue ?? Infinity,
        ),
      );
    },
  });
  const { getContainer } = useUNSAFE_PortalContext();

  return (
    <div
      {...stylex.props(styles.wrapper, style)}
      {...mergeProps(lockProps, { onClick })}
    >
      {children}
      {isLocked &&
        createPortal(
          <div {...cursorProps}>
            <MoveHorizontal size={16} />
          </div>,
          getContainer?.() ?? document.body,
        )}
    </div>
  );
}

const styles = stylex.create({
  wrapper: {
    cursor: "ew-resize",
  },
  input: {
    cursor: "text",
  },
  button: {
    alignItems: "center",
    aspectRatio: 1,
    display: "flex",
    flexGrow: 1,
    flexShrink: 0,
    justifyContent: "center",
    borderBottomWidth: 0,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 0,
    borderInlineEndWidth: 0,
    borderTopWidth: 0,
    minHeight: 0,
    paddingBottom: 0,
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
    paddingTop: 0,

    // eslint-disable-next-line @stylexjs/no-legacy-contextual-styles, @stylexjs/valid-styles
    ":is(*) svg": {
      flexShrink: 0,
      pointerEvents: "none",
      height: sizeSpace["md"],
      width: sizeSpace["md"],
    },

    color: {
      default: uiColor.text2,
      ":disabled": uiColor.text1,
    },
    outline: {
      default: "none",
      ":is([data-focus-visible])": `2px solid ${focusColor.ring}`,
    },
    outlineOffset: "-2px",
  },
  buttonLeft: {
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: 1,
  },
  buttonRight: {
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
  },
  inputWithStepper: {
    textAlign: "center",
    paddingInlineStart: horizontalSpace["md"],
    paddingInlineEnd: horizontalSpace["md"],
  },
});

interface NumberFieldContentProps {
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
  hideStepper: boolean;
}

function NumberFieldContent({
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
  hideStepper,
}: NumberFieldContentProps) {
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
      <NumberInputWrapper
        style={inputStyles.wrapper}
        onClick={() => inputRef.current?.focus()}
      >
        {!hideStepper && (
          <Button
            slot="decrement"
            {...stylex.props(
              styles.button,
              styles.buttonLeft,
              ui.borderInteractive,
              ui.bgAction,
            )}
          >
            <Minus />
          </Button>
        )}
        {prefix != null && (
          <div {...stylex.props(inputStyles.addon)}>{prefix}</div>
        )}
        <Input
          placeholder={placeholder}
          ref={inputRef}
          {...stylex.props(
            styles.input,
            inputStyles.input,
            !hideStepper && styles.inputWithStepper,
          )}
        />
        <SuffixIcon
          suffix={suffix}
          style={inputStyles.addon}
          validationIconStyle={inputStyles.validationIcon}
          validationState={validationState}
        />
        {!hideStepper && (
          <Button
            slot="increment"
            {...stylex.props(
              styles.button,
              styles.buttonRight,
              ui.borderInteractive,
              ui.bgAction,
            )}
          >
            <Plus />
          </Button>
        )}
      </NumberInputWrapper>
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

export interface NumberFieldProps
  extends
    StyleXComponentProps<Omit<AriaNumberFieldProps, "children" | "isInvalid">>,
    Pick<InputProps, "placeholder"> {
  label?: React.ReactNode;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  size?: Size;
  variant?: InputVariant;
  labelVariant?: LabelVariant;
  validationState?: InputValidationState;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  hideStepper?: boolean;
}

export function NumberField({
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
  placeholder,
  hideStepper = false,
  ...props
}: NumberFieldProps) {
  const size = sizeProp || use(SizeContext);
  const inputStyles = useInputStyles({
    size,
    variant,
    labelVariant,
    validationState,
  });

  return (
    <SizeContext value={size}>
      <AriaNumberField
        {...props}
        isInvalid={validationState ? validationState === "invalid" : undefined}
        {...stylex.props(inputStyles.field, style)}
      >
        {({ isInvalid }) => (
          <NumberFieldContent
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
            hideStepper={hideStepper}
          />
        )}
      </AriaNumberField>
    </SizeContext>
  );
}
