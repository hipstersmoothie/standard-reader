"use client";

import * as stylex from "@stylexjs/stylex";
import { use, useEffect, useRef, useState } from "react";
import type {
  AutocompleteProps as AriaAutocompleteProps,
  ListBoxProps,
  ValidationResult,
} from "react-aria-components";
import { Autocomplete as AriaAutocomplete } from "react-aria-components";

import { SizeContext } from "../context";
import { ListBox } from "../listbox";
import { TextField } from "../text-field";
import {
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import type {
  InputValidationState,
  InputVariant,
  Size,
  StyleXComponentProps,
} from "../theme/types";
import { usePopoverStyles } from "../theme/usePopoverStyles";

const styles = stylex.create({
  wrapper: {
    position: "relative",
  },
  popover: {
    position: "absolute",
    zIndex: 1000,
    insetInlineStart: 0,
    paddingTop: verticalSpace["xs"],
    top: "100%",
    width: "100%",
  },
  // Inset the suggestion rows from the popover's rounded corners so a focused
  // item's ring isn't clipped by the container's `overflow`.
  list: {
    paddingBottom: verticalSpace["xs"],
    paddingInlineStart: horizontalSpace["xs"],
    paddingInlineEnd: horizontalSpace["xs"],
    paddingTop: verticalSpace["xs"],
  },
});

/**
 * Props for the AutocompleteInput component.
 * Combines text input with a dropdown list of suggestions.
 */
export interface AutocompleteInputProps<T extends object>
  extends
    StyleXComponentProps<
      Omit<AriaAutocompleteProps<T>, "children" | "isInvalid">
    >,
    Pick<ListBoxProps<T>, "renderEmptyState"> {
  /** Label for the text field. */
  label?: React.ReactNode;
  /** Description text shown below the input. */
  description?: string;
  /** Error message or function returning message from validation. */
  errorMessage?: string | ((validation: ValidationResult) => string);
  /** Items to display in the suggestions list. */
  items?: Iterable<T>;
  /** Render function or content for each list item. */
  children: React.ReactNode | ((item: T) => React.ReactNode);
  /** Size of the input and list items. */
  size?: Size;
  /** Visual variant of the input. */
  variant?: InputVariant;
  /** Validation state override. */
  validationState?: InputValidationState;
  /** Placeholder text when input is empty. */
  placeholder?: string;
  /**
   * Native input autocomplete hint. Pass "off" to stop the browser from
   * offering saved-password/username autofill over an in-app suggestion field.
   */
  autoComplete?: string;
  /**
   * Opt the input out of browser/extension credential autofill (1Password,
   * LastPass, etc.) so it doesn't pop over the in-app suggestion list.
   */
  disablePasswordManagers?: boolean;
  /** Content to render before the input. */
  prefix?: React.ReactNode;
  /** Content to render after the input. */
  suffix?: React.ReactNode;
  /** Callback when an item is selected. */
  onAction?: (item: string) => void;
}

export function AutocompleteInput<T extends object>({
  label,
  description,
  errorMessage,
  children,
  items,
  style,
  size: sizeProp,
  variant,
  validationState,
  placeholder,
  autoComplete,
  disablePasswordManagers,
  prefix,
  suffix,
  onAction,
  renderEmptyState,
  // Don't auto-focus the first suggestion after each keystroke — that gives it
  // a keyboard focus ring while the user is only typing. The ring should
  // appear only once they arrow into the list. Still overridable per usage.
  disableAutoFocusFirst = true,
  ...props
}: AutocompleteInputProps<T>) {
  const size = sizeProp || use(SizeContext);
  const popoverStyles = usePopoverStyles();
  const wrapperRef = useRef<HTMLDivElement>(null);
  /** Whether focus is inside the field — suggestions never open unfocused. */
  const focusInsideRef = useRef(false);
  const [isOpenState, setIsOpenState] = useState(false);

  const firstItem = items ? [...items][0] : undefined;
  const isOnlyMatch =
    items &&
    firstItem &&
    [...items].length === 1 &&
    "handle" in firstItem &&
    firstItem.handle === props.inputValue;
  const hasItems = items && [...items].length > 0 && !isOnlyMatch;
  const isOpen = hasItems && isOpenState;

  // Open popover when suggestions arrive (prop change) while the user is in
  // the field — items present on mount don't open it by default.
  useEffect(() => {
    if (hasItems && focusInsideRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect, @eslint-react/hooks-extra/no-direct-set-state-in-use-effect -- Sync open state when items prop updates
      setIsOpenState(true);
    }
  }, [hasItems]);

  // Handle blur - close if focus moves outside the autocomplete
  const handleBlurCapture = (_e: React.FocusEvent) => {
    setTimeout(() => {
      const activeElement = document.activeElement;
      if (
        wrapperRef.current &&
        activeElement &&
        !wrapperRef.current.contains(activeElement)
      ) {
        focusInsideRef.current = false;
        setIsOpenState(false);
      }
    }, 0);
  };

  // Handle focus - reopen if there are items
  const handleFocusCapture = () => {
    focusInsideRef.current = true;
    if (hasItems) {
      setIsOpenState(true);
    }
  };

  // Handle item selection - close autocomplete
  const handleAction = (key: React.Key) => {
    setIsOpenState(false);
    onAction?.(String(key));
  };

  return (
    <SizeContext value={size}>
      <AriaAutocomplete
        disableAutoFocusFirst={disableAutoFocusFirst}
        {...props}
        {...stylex.props(style)}
      >
        <div
          ref={wrapperRef}
          {...stylex.props(styles.wrapper)}
          onBlurCapture={handleBlurCapture}
          onFocusCapture={handleFocusCapture}
        >
          <TextField
            label={label}
            description={description}
            errorMessage={errorMessage}
            size={size}
            variant={variant}
            validationState={validationState}
            placeholder={placeholder}
            autoComplete={autoComplete}
            disablePasswordManagers={disablePasswordManagers}
            prefix={prefix}
            suffix={suffix}
          />

          {isOpen && (
            <div {...stylex.props(styles.popover)}>
              <div {...stylex.props(popoverStyles.wrapper, styles.list)}>
                <ListBox
                  items={items}
                  selectionMode="none"
                  renderEmptyState={
                    renderEmptyState ?? (() => "No results found.")
                  }
                  onAction={handleAction}
                >
                  {children}
                </ListBox>
              </div>
            </div>
          )}
        </div>
      </AriaAutocomplete>
    </SizeContext>
  );
}
