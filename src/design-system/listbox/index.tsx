import type {
  ListBoxItemProps as AriaListBoxItemProps,
  ListBoxProps as AriaListBoxProps,
  ListBoxSectionProps as AriaListBoxSectionProps,
  SeparatorProps,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { Check } from "lucide-react";
import { createContext, use, useContext, useRef } from "react";
import {
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxSection as AriaListBoxSection,
  Header,
  ListLayout,
  ListStateContext,
  Virtualizer,
} from "react-aria-components";

import type { CheckboxProps } from "../checkbox";
import type { Size, StyleXComponentProps } from "../theme/types";

import { Checkbox } from "../checkbox";
import { SizeContext } from "../context";
import { useHaptics } from "../haptics";
import { Separator } from "../separator";
import { ui } from "../theme/semantic-color.stylex";
import {
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { typeramp } from "../theme/typography.stylex";
import {
  estimatedRowHeights,
  useListBoxItemStyles,
} from "../theme/useListBoxItemStyles";

const styles = stylex.create({
  listBox: {
    outline: "none",
  },
  sectionLabel: {
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    paddingBottom: verticalSpace["xs"],
    paddingLeft: horizontalSpace["xl"],
    paddingRight: horizontalSpace["xl"],
    paddingTop: verticalSpace["xs"],

    height: {
      ":is([data-size=lg])": sizeSpace["4xl"],
      ":is([data-size=md])": sizeSpace["2xl"],
      ":is([data-size=sm])": sizeSpace["2xl"],
    },
  },
  separator: {
    marginBottom: verticalSpace["sm"],
    marginTop: verticalSpace["sm"],
  },
});

type ListBoxVariant = "default" | "checkbox";

const ListboxVariantContext = createContext<ListBoxVariant>("default");

export interface ListBoxProps<T extends object> extends StyleXComponentProps<
  AriaListBoxProps<T>
> {
  size?: Size;
  items?: Iterable<T>;
  children: React.ReactNode | ((item: T) => React.ReactNode);
  variant?: ListBoxVariant;
  isVirtualized?: boolean;
}

export function ListBox<T extends object>({
  size: sizeProp,
  style,
  variant = "default",
  isVirtualized = false,
  onSelectionChange,
  onAction,
  ...props
}: ListBoxProps<T>) {
  const { trigger } = useHaptics();
  const size = sizeProp || use(SizeContext);
  const innerRef = useRef<HTMLDivElement>(null);
  const context = useContext(ListStateContext);
  const handleSelectionChange = (
    keys: Parameters<NonNullable<typeof onSelectionChange>>[0],
  ) => {
    trigger("selection");
    onSelectionChange?.(keys);
  };

  const handleAction = (key: Parameters<NonNullable<typeof onAction>>[0]) => {
    trigger("selection");
    onAction?.(key);
  };

  const listbox = (
    <AriaListBox
      {...props}
      ref={innerRef}
      onSelectionChange={handleSelectionChange}
      onAction={context ? undefined : handleAction}
      {...stylex.props(styles.listBox, style)}
    />
  );

  return (
    <ListboxVariantContext value={variant}>
      <SizeContext value={size}>
        {isVirtualized ? (
          <Virtualizer
            layout={ListLayout}
            layoutOptions={{ estimatedRowHeight: estimatedRowHeights[size] }}
          >
            {listbox}
          </Virtualizer>
        ) : (
          listbox
        )}
      </SizeContext>
    </ListboxVariantContext>
  );
}

export interface ListBoxItemProps extends StyleXComponentProps<
  Omit<AriaListBoxItemProps, "children">
> {
  children: React.ReactNode;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

function ListBoxCheckbox({ id = "", ...props }: CheckboxProps) {
  const listboxItemState = use(ListStateContext);

  return (
    <Checkbox
      {...props}
      isSelected={Boolean(
        listboxItemState?.selectionManager.selectedKeys.has(id),
      )}
      onChange={() => listboxItemState?.selectionManager.select(id)}
    />
  );
}

export function ListBoxItem({
  style,
  children,
  prefix,
  suffix,
  ...props
}: ListBoxItemProps) {
  const listBoxItemStyles = useListBoxItemStyles();
  const variant = use(ListboxVariantContext);

  return (
    <AriaListBoxItem
      {...props}
      value={props.value || { id: props.id, label: children }}
      textValue={
        props.textValue || (typeof children === "string" ? children : undefined)
      }
      {...stylex.props(listBoxItemStyles.wrapper, style)}
    >
      {({ isSelected }) => (
        <div {...stylex.props(listBoxItemStyles.inner)}>
          {variant === "checkbox" && (
            <div {...stylex.props(listBoxItemStyles.addon)}>
              <ListBoxCheckbox
                isSelected={isSelected}
                id={
                  (props.id as string) ||
                  (props.value as { id?: string } | undefined)?.id
                }
                onPress={(e) => e.continuePropagation()}
              />
            </div>
          )}
          {prefix != null && (
            <div {...stylex.props(listBoxItemStyles.addon)}>{prefix}</div>
          )}
          <div {...stylex.props(listBoxItemStyles.label)}>{children}</div>
          {suffix != null && (
            <div {...stylex.props(listBoxItemStyles.addon)}>{suffix}</div>
          )}
          {isSelected && variant === "default" && (
            <Check size={16} {...stylex.props(listBoxItemStyles.check)} />
          )}
        </div>
      )}
    </AriaListBoxItem>
  );
}

export interface ListBoxSectionProps<
  T extends object,
> extends StyleXComponentProps<AriaListBoxSectionProps<T>> {
  children: React.ReactNode;
}

export function ListBoxSection<T extends object>({
  style,
  ...props
}: ListBoxSectionProps<T>) {
  return <AriaListBoxSection {...props} {...stylex.props(style)} />;
}

export interface ListBoxSeparatorProps extends StyleXComponentProps<SeparatorProps> {}

export function ListBoxSeparator({ style, ...props }: ListBoxSeparatorProps) {
  return <Separator {...props} style={[styles.separator, style]} />;
}

export interface ListBoxSectionHeaderProps extends StyleXComponentProps<
  React.HTMLAttributes<HTMLElement>
> {}

export function ListBoxSectionHeader({
  style,
  ...props
}: ListBoxSectionHeaderProps) {
  const size = use(SizeContext);

  return (
    <Header
      {...props}
      data-size={size}
      {...stylex.props(
        typeramp.sublabel,
        styles.sectionLabel,
        ui.textDim,
        style,
      )}
    />
  );
}
