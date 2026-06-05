import type {
  ComboBoxProps as AriaComboBoxProps,
  ListBoxProps,
  PopoverProps,
  ValidationResult,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { ChevronDown } from "lucide-react";
import { use } from "react";
import {
  ComboBox as AriaComboBox,
  Button,
  Input,
  ListLayout,
  Popover,
  Virtualizer,
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
import { ListBox } from "../listbox";
import { SuffixIcon } from "../suffix-icon";
import {
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { useInputStyles } from "../theme/useInputStyles";
import { estimatedRowHeights } from "../theme/useListBoxItemStyles";
import { usePopoverStyles } from "../theme/usePopoverStyles";
import { SmallBody } from "../typography";

const styles = stylex.create({
  matchWidth: {
    minWidth: "max(var(--trigger-width), 180px)",
  },
  emptyState: {
    display: "flex",
    justifyContent: "center",
    paddingBottom: verticalSpace["2xl"],
    paddingLeft: horizontalSpace["2xl"],
    paddingRight: horizontalSpace["2xl"],
    paddingTop: verticalSpace["2xl"],
  },
});

function EmptyState() {
  return (
    <div {...stylex.props(styles.emptyState)}>
      <SmallBody variant="secondary">No items found</SmallBody>
    </div>
  );
}

interface ComboBoxContentProps<T extends object> {
  label?: string;
  labelVariant?: LabelVariant;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  size: Size;
  variant: InputVariant | undefined;
  validationState: InputValidationState | undefined;
  isInvalid: boolean;
  isRequired: boolean;
  placeholder: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  items?: Iterable<T>;
  children: React.ReactNode | ((item: T) => React.ReactNode);
  shouldCloseOnInteractOutside?: ((element: Element) => boolean) | undefined;
  shouldFlip?: boolean;
  shouldUpdatePosition?: boolean;
  placement?: PopoverProps["placement"];
  renderEmptyState?: ListBoxProps<T>["renderEmptyState"];
  isVirtualized?: boolean;
}

function ComboBoxContent<T extends object>({
  label,
  labelVariant,
  description,
  errorMessage,
  size,
  variant,
  validationState,
  isInvalid: _isInvalid,
  isRequired,
  placeholder,
  prefix,
  suffix,
  items,
  children,
  shouldCloseOnInteractOutside,
  shouldFlip,
  shouldUpdatePosition,
  placement,
  renderEmptyState,
  isVirtualized,
}: ComboBoxContentProps<T>) {
  const inputStyles = useInputStyles({
    size,
    variant,
    labelVariant,
    validationState: _isInvalid ? "invalid" : validationState,
  });
  const popoverStyles = usePopoverStyles();

  let listbox = (
    <ListBox items={items} renderEmptyState={renderEmptyState || EmptyState}>
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

  const content = (
    <>
      <Button {...stylex.props(inputStyles.wrapper)}>
        {prefix != null && (
          <div {...stylex.props(inputStyles.addon)}>{prefix}</div>
        )}
        <Input
          {...stylex.props(inputStyles.input)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            // Prevent form submission when Enter is pressed in the combobox input
            // React Aria Components handles Enter key for selection when menu is open
            // We prevent default to stop form submission in all cases
            if (e.key === "Enter") {
              e.preventDefault();
            }
          }}
        />
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
      {description && (
        <Description style={inputStyles.description}>{description}</Description>
      )}
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
      <Popover
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

export interface ComboBoxProps<T extends object>
  extends
    StyleXComponentProps<Omit<AriaComboBoxProps<T>, "children" | "isInvalid">>,
    Pick<
      PopoverProps,
      | "shouldCloseOnInteractOutside"
      | "shouldFlip"
      | "shouldUpdatePosition"
      | "placement"
    >,
    Pick<ListBoxProps<T>, "renderEmptyState"> {
  label?: string;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  items?: Iterable<T>;
  children: React.ReactNode | ((item: T) => React.ReactNode);
  size?: Size;
  variant?: InputVariant;
  labelVariant?: LabelVariant;
  validationState?: InputValidationState;
  placeholder?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  isVirtualized?: boolean;
}

export function ComboBox<T extends object>({
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
  renderEmptyState,
  isVirtualized = false,
  ...props
}: ComboBoxProps<T>) {
  const size = sizeProp || use(SizeContext);
  const inputStyles = useInputStyles({
    size,
    variant,
    labelVariant,
    validationState,
  });

  return (
    <SizeContext value={size}>
      <AriaComboBox
        {...props}
        isInvalid={validationState ? validationState === "invalid" : undefined}
        {...stylex.props(inputStyles.field, style)}
      >
        {({ isInvalid, isRequired }) => (
          <ComboBoxContent
            label={label}
            labelVariant={labelVariant}
            description={description}
            errorMessage={errorMessage}
            size={size}
            variant={variant}
            validationState={validationState}
            isInvalid={isInvalid}
            isRequired={isRequired}
            placeholder={placeholder}
            prefix={prefix}
            suffix={suffix}
            items={items}
            shouldCloseOnInteractOutside={shouldCloseOnInteractOutside}
            shouldFlip={shouldFlip}
            shouldUpdatePosition={shouldUpdatePosition}
            placement={placement}
            renderEmptyState={renderEmptyState}
            isVirtualized={isVirtualized}
          >
            {children}
          </ComboBoxContent>
        )}
      </AriaComboBox>
    </SizeContext>
  );
}

export type {
  ListBoxItemProps as ComboBoxItemProps,
  ListBoxSectionProps as ComboBoxSectionProps,
  ListBoxSectionHeaderProps as ComboBoxSectionHeaderProps,
  ListBoxSeparatorProps as ComboBoxSeparatorProps,
} from "../listbox";

export {
  ListBoxItem as ComboBoxItem,
  ListBoxSection as ComboBoxSection,
  ListBoxSectionHeader as ComboBoxSectionHeader,
  ListBoxSeparator as ComboBoxSeparator,
} from "../listbox";
