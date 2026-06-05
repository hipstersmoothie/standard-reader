import type {
  SelectProps as AriaSelectProps,
  PopoverProps,
  ValidationResult,
} from "react-aria-components";

import { useLayoutEffect } from "@react-aria/utils";
import * as stylex from "@stylexjs/stylex";
import { ChevronDown } from "lucide-react";
import { use, useRef } from "react";
import {
  Select as AriaSelect,
  Autocomplete,
  Button,
  ListLayout,
  Popover,
  SelectValue,
  Virtualizer,
  useFilter,
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
import { ListBox, ListBoxSeparator } from "../listbox";
import { SearchField } from "../search-field";
import { SuffixIcon } from "../suffix-icon";
import {
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { useInputStyles } from "../theme/useInputStyles";
import { estimatedRowHeights } from "../theme/useListBoxItemStyles";
import { usePopoverStyles } from "../theme/usePopoverStyles";

const styles = stylex.create({
  matchWidth: {
    minWidth: "max(var(--trigger-width), 180px)",
  },
  listBox: {
    maxHeight: "40vh",
  },
  searchField: {
    paddingLeft: horizontalSpace["xs"],
    paddingRight: horizontalSpace["xs"],
    paddingTop: verticalSpace["xs"],
  },
});

interface SelectContentProps<T extends object> {
  isOpen: boolean;
  label?: string;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  size: Size;
  variant: InputVariant | undefined;
  validationState: InputValidationState | undefined;
  isInvalid: boolean;
  placeholder: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  isSearchable: boolean;
  items?: Iterable<T>;
  children: React.ReactNode | ((item: T) => React.ReactNode);
  shouldCloseOnInteractOutside?: ((element: Element) => boolean) | undefined;
  shouldFlip?: boolean;
  shouldUpdatePosition?: boolean;
  placement?: PopoverProps["placement"];
  isVirtualized?: boolean;
  labelVariant?: "vertical" | "horizontal";
  isRequired: boolean;
}

function SelectContent<T extends object>({
  isOpen,
  isVirtualized,
  label,
  description,
  errorMessage,
  size,
  variant,
  validationState,
  isInvalid,
  placeholder,
  prefix,
  suffix,
  isSearchable,
  items,
  children,
  shouldCloseOnInteractOutside,
  shouldFlip,
  shouldUpdatePosition,
  placement,
  labelVariant,
  isRequired,
}: SelectContentProps<T>) {
  const inputStyles = useInputStyles({
    size,
    variant,
    labelVariant,
    validationState: isInvalid ? "invalid" : validationState,
  });
  const popoverStyles = usePopoverStyles();
  const { contains } = useFilter({ sensitivity: "base" });
  const popoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isOpen) return;

    let firstFrame = 0;
    let secondFrame = 0;

    // Wait for the popover and listbox to mount before scrolling the selected option.
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const selectedOption = popoverRef.current?.querySelector<HTMLElement>(
          '[role="option"][aria-selected="true"]',
        );

        selectedOption?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [isOpen]);

  let listbox = (
    <ListBox items={items} style={styles.listBox}>
      {children}
    </ListBox>
  );

  if (isVirtualized) {
    listbox = (
      <Virtualizer
        layout={ListLayout}
        layoutOptions={{ estimatedRowHeight: estimatedRowHeights[size] }}
      >
        {listbox}
      </Virtualizer>
    );
  }

  if (isSearchable) {
    listbox = (
      <Autocomplete filter={contains}>
        <div {...stylex.props(styles.searchField)}>
          <SearchField placeholder="Search" variant="secondary" />
        </div>
        <ListBoxSeparator />
        {listbox}
      </Autocomplete>
    );
  }

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
      <Button {...stylex.props(inputStyles.wrapper)}>
        {prefix != null && (
          <div {...stylex.props(inputStyles.addon)}>{prefix}</div>
        )}
        <SelectValue {...stylex.props(inputStyles.input)}>
          {({ selectedText, isPlaceholder, defaultChildren }) => {
            if (isPlaceholder) return placeholder;
            if (selectedText) return selectedText;

            return defaultChildren;
          }}
        </SelectValue>
        <SuffixIcon
          suffix={
            <>
              {suffix}
              <ChevronDown size={16} aria-hidden="true" />
            </>
          }
          style={inputStyles.addon}
          validationIconStyle={inputStyles.validationIcon}
          validationState={validationState}
        />
      </Button>
      <Description style={inputStyles.description}>{description}</Description>
      <FieldErrorMessage style={inputStyles.errorMessage}>
        {errorMessage}
      </FieldErrorMessage>
      <Popover
        ref={popoverRef}
        containerPadding={8}
        shouldCloseOnInteractOutside={shouldCloseOnInteractOutside}
        shouldFlip={shouldFlip}
        shouldUpdatePosition={shouldUpdatePosition}
        placement={placement}
        {...stylex.props(
          popoverStyles.wrapper,
          popoverStyles.animation,
          styles.matchWidth,
        )}
      >
        {listbox}
      </Popover>
    </>
  );
}

export interface SelectProps<T extends object, M extends "single" | "multiple">
  extends
    StyleXComponentProps<Omit<AriaSelectProps<T, M>, "children" | "isInvalid">>,
    Pick<
      PopoverProps,
      | "shouldCloseOnInteractOutside"
      | "shouldFlip"
      | "shouldUpdatePosition"
      | "placement"
    > {
  label?: string;
  labelVariant?: LabelVariant;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  items?: Iterable<T>;
  children: React.ReactNode | ((item: T) => React.ReactNode);
  size?: Size;
  variant?: InputVariant;
  validationState?: InputValidationState;
  placeholder?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  isSearchable?: boolean;
  isVirtualized?: boolean;
}

export function Select<
  T extends object,
  M extends "single" | "multiple" = "single",
>({
  label,
  description,
  errorMessage,
  children,
  items,
  style,
  size: sizeProp,
  variant,
  labelVariant,
  validationState,
  shouldCloseOnInteractOutside,
  shouldFlip,
  shouldUpdatePosition,
  placement,
  placeholder = "Select an option",
  prefix,
  suffix,
  isSearchable = false,
  isVirtualized = false,
  ...props
}: SelectProps<T, M>) {
  const size = sizeProp || use(SizeContext);
  const inputStyles = useInputStyles({
    size,
    variant,
    labelVariant,
    validationState,
  });

  return (
    <SizeContext value={size}>
      <AriaSelect
        {...props}
        isInvalid={validationState ? validationState === "invalid" : undefined}
        {...stylex.props(inputStyles.field, style)}
        placeholder={placeholder}
      >
        {({ isInvalid, isOpen, isRequired }) => (
          <SelectContent
            isRequired={isRequired}
            isOpen={isOpen}
            isVirtualized={isVirtualized}
            label={label}
            description={description}
            errorMessage={errorMessage}
            size={size}
            variant={variant}
            validationState={validationState}
            isInvalid={isInvalid}
            placeholder={placeholder}
            prefix={prefix}
            suffix={suffix}
            isSearchable={isSearchable}
            items={items}
            shouldCloseOnInteractOutside={shouldCloseOnInteractOutside}
            shouldFlip={shouldFlip}
            shouldUpdatePosition={shouldUpdatePosition}
            placement={placement}
            labelVariant={labelVariant}
          >
            {children}
          </SelectContent>
        )}
      </AriaSelect>
    </SizeContext>
  );
}

export type {
  ListBoxItemProps as SelectItemProps,
  ListBoxSectionProps as SelectSectionProps,
  ListBoxSectionHeaderProps as SelectSectionHeaderProps,
  ListBoxSeparatorProps as SelectSeparatorProps,
} from "../listbox";

export {
  ListBoxItem as SelectItem,
  ListBoxSection as SelectSection,
  ListBoxSectionHeader as SelectSectionHeader,
  ListBoxSeparator as SelectSeparator,
} from "../listbox";
