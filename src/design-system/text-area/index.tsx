import type {
  TextAreaProps as AriaTextAreaProps,
  InputProps,
  TextFieldProps,
  ValidationResult,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { use, useLayoutEffect, useRef } from "react";
import {
  TextArea as AriaTextArea,
  TextField as AriaTextField,
} from "react-aria-components";

import type {
  InputValidationState,
  InputVariant,
  LabelVariant,
  Size,
  StyleXComponentProps,
} from "../theme/types";

import { SizeContext } from "../context";
import { Description, FieldErrorMessage, Label } from "../label";
import {
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { fontFamily, lineHeight } from "../theme/typography.stylex";
import { useInputStyles } from "../theme/useInputStyles";

const styles = stylex.create({
  wrapper: {
    height: "auto",
    minHeight: {
      ":is([data-size=lg])": sizeSpace["4xl"],
      ":is([data-size=md])": sizeSpace["3xl"],
      ":is([data-size=sm])": sizeSpace["xl"],
    },
  },
  textarea: {
    fontFamily: fontFamily["sans"],
    boxSizing: "border-box",
    lineHeight: {
      ":is([data-size=lg])": lineHeight["lg"],
      ":is([data-size=md])": lineHeight["base"],
      ":is([data-size=sm])": lineHeight["sm"],
    },
    resize: "none",

    minWidth: 0,
    paddingBottom: {
      ":is([data-size=lg])": verticalSpace["xs"],
      ":is([data-size=md])": verticalSpace["sm"],
      ":is([data-size=sm])": verticalSpace["xxs"],
    },
    paddingTop: {
      ":is([data-size=lg])": verticalSpace["xs"],
      ":is([data-size=md])": verticalSpace["sm"],
      ":is([data-size=sm])": verticalSpace["xxs"],
    },
    width: "100%",
  },
  resizable: {
    resize: "both",
  },
  autosize: {
    overflow: "hidden",
    resize: "none",
  },
});

export interface TextAreaProps
  extends
    StyleXComponentProps<Omit<TextFieldProps, "children">>,
    Pick<AriaTextAreaProps, "rows">,
    Pick<InputProps, "placeholder"> {
  label?: React.ReactNode;
  labelVariant?: LabelVariant;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  size?: Size;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  isResizable?: boolean;
  autosize?: boolean;
  variant?: InputVariant;
  validationState?: InputValidationState;
}

export function TextArea({
  label,
  description,
  errorMessage,
  style,
  size: sizeProp,
  prefix,
  suffix,
  placeholder,
  rows,
  isResizable = true,
  autosize = true,
  variant,
  validationState,
  labelVariant,
  ...props
}: TextAreaProps) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const size = sizeProp || use(SizeContext);
  const inputStyles = useInputStyles({
    size,
    variant,
    labelVariant,
    validationState,
  });

  useLayoutEffect(() => {
    const textarea = textAreaRef.current;
    if (!textarea || !autosize) return;

    const adjustHeight = () => {
      // Reset height to auto to get accurate scrollHeight
      textarea.style.height = "auto";
      // Set height to scrollHeight, which will respect minHeight from styles
      const newHeight = textarea.scrollHeight;
      textarea.style.height = `${String(newHeight)}px`;
    };

    // Adjust height immediately
    adjustHeight();

    // Listen for input events to adjust height dynamically
    textarea.addEventListener("input", adjustHeight);

    // Also adjust on resize in case container size changes
    const resizeObserver = new ResizeObserver(adjustHeight);
    resizeObserver.observe(textarea);

    return () => {
      textarea.removeEventListener("input", adjustHeight);
      resizeObserver.disconnect();
    };
  }, [autosize, props.value, props.defaultValue]);

  // Handle onChange to trigger resize when value changes programmatically
  const handleChange = (value: string) => {
    props.onChange?.(value);
    // Trigger resize after value update
    if (autosize && textAreaRef.current) {
      requestAnimationFrame(() => {
        const textarea = textAreaRef.current;
        if (textarea) {
          textarea.style.height = "auto";
          textarea.style.height = `${String(textarea.scrollHeight)}px`;
        }
      });
    }
  };

  return (
    <SizeContext value={size}>
      <AriaTextField
        {...props}
        onChange={props.onChange ? handleChange : undefined}
        isInvalid={validationState ? validationState === "invalid" : undefined}
        {...stylex.props(inputStyles.field, style)}
      >
        <Label>{label}</Label>
        {/*
        This onClick is specifically for mouse users not clicking directly on the input.
        A keyboard user would not encounter the same issue.
      */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div
          {...stylex.props(inputStyles.wrapper, styles.wrapper)}
          onClick={() => textAreaRef.current?.focus()}
          data-size={size}
        >
          {prefix != null && (
            <div {...stylex.props(inputStyles.addon)}>{prefix}</div>
          )}
          <AriaTextArea
            data-size={size}
            {...stylex.props(
              inputStyles.input,
              styles.textarea,
              isResizable && !autosize && styles.resizable,
              autosize && styles.autosize,
            )}
            ref={textAreaRef}
            placeholder={placeholder}
            rows={autosize ? 1 : rows}
          />
          {suffix != null && (
            <div {...stylex.props(inputStyles.addon)}>{suffix}</div>
          )}
        </div>
        <Description>{description}</Description>
        <FieldErrorMessage>{errorMessage}</FieldErrorMessage>
      </AriaTextField>
    </SizeContext>
  );
}
