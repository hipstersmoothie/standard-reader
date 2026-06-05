"use client";

import type {
  AutocompleteProps as AriaAutocompleteProps,
  ListBoxProps,
  ValidationResult,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { use, useEffect, useRef, useState } from "react";
import { Autocomplete as AriaAutocomplete } from "react-aria-components";

import type {
  InputValidationState,
  InputVariant,
  Size,
  StyleXComponentProps,
} from "../theme/types";

import { SizeContext } from "../context";
import { ListBox } from "../listbox";
import { TextField } from "../text-field";
import { verticalSpace } from "../theme/semantic-spacing.stylex";
import { usePopoverStyles } from "../theme/usePopoverStyles";

const styles = stylex.create({
  wrapper: {
    position: "relative",
  },
  popover: {
    position: "absolute",
    left: 0,
    paddingTop: verticalSpace["xs"],
    top: "100%",
    width: "100%",
    zIndex: 1000,
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
  prefix,
  suffix,
  onAction,
  renderEmptyState,
  ...props
}: AutocompleteInputProps<T>) {
  const size = sizeProp || use(SizeContext);
  const popoverStyles = usePopoverStyles();
  const wrapperRef = useRef<HTMLDivElement>(null);
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

  // Open popover when suggestions arrive (prop change)
  useEffect(() => {
    if (hasItems) {
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
        setIsOpenState(false);
      }
    }, 0);
  };

  // Handle focus - reopen if there are items
  const handleFocusCapture = () => {
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
      <AriaAutocomplete {...props} {...stylex.props(style)}>
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
            prefix={prefix}
            suffix={suffix}
          />

          {isOpen && (
            <div {...stylex.props(styles.popover)}>
              <div {...stylex.props(popoverStyles.wrapper)}>
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
