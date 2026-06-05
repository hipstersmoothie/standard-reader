import type {
  MenuItemProps as AriaMenuItemProps,
  MenuProps as AriaMenuProps,
  MenuSectionProps as AriaMenuSectionProps,
  MenuTriggerProps,
  PopoverProps,
  SubmenuTriggerProps,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { Check, ChevronRight } from "lucide-react";
import { use } from "react";
import {
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  MenuTrigger,
  Popover,
  SubmenuTrigger,
} from "react-aria-components";

import type { Size, StyleXComponentProps } from "../theme/types";

import { SizeContext } from "../context";
import { useHaptics } from "../haptics";
import { ListBoxSeparator } from "../listbox";
import {
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { useListBoxItemStyles } from "../theme/useListBoxItemStyles";
import { usePopoverStyles } from "../theme/usePopoverStyles";

const styles = stylex.create({
  header: {
    paddingBottom: verticalSpace["xs"],
    paddingLeft: horizontalSpace["xl"],
    paddingRight: horizontalSpace["xl"],
    paddingTop: verticalSpace["md"],
  },
  footer: {
    paddingBottom: verticalSpace["xs"],
    paddingLeft: horizontalSpace["xl"],
    paddingRight: horizontalSpace["xl"],
    paddingTop: verticalSpace["md"],
  },
  menu: {
    outline: "none",
    minWidth: 180,
    paddingBottom: verticalSpace["xxs"],
    paddingTop: verticalSpace["xxs"],
  },
});

export interface MenuProps<T extends object>
  extends
    Omit<MenuTriggerProps, "trigger" | "children">,
    Omit<AriaMenuProps<T>, "children" | "className" | "style">,
    Pick<
      PopoverProps,
      | "shouldCloseOnInteractOutside"
      | "shouldFlip"
      | "shouldUpdatePosition"
      | "placement"
    > {
  trigger: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  items?: Iterable<T>;
  children: React.ReactNode | ((item: T) => React.ReactNode);
  size?: Size;
}

export function Menu<T extends object>({
  trigger,
  size: sizeProp,
  defaultOpen,
  isOpen,
  onOpenChange,
  shouldCloseOnInteractOutside,
  shouldFlip,
  shouldUpdatePosition,
  placement,
  header,
  footer,
  onAction,
  ...props
}: MenuProps<T>) {
  const { trigger: triggerHaptic } = useHaptics();
  const popoverStyles = usePopoverStyles();
  const size = sizeProp || use(SizeContext);

  const handleOpenChange = (open: boolean) => {
    triggerHaptic("impactLight");
    onOpenChange?.(open);
  };

  const handleAction = (key: Parameters<NonNullable<typeof onAction>>[0]) => {
    triggerHaptic("selection");
    onAction?.(key);
  };

  return (
    <SizeContext value={size}>
      <MenuTrigger
        defaultOpen={defaultOpen}
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
      >
        {trigger}
        <Popover
          containerPadding={8}
          shouldCloseOnInteractOutside={shouldCloseOnInteractOutside}
          shouldFlip={shouldFlip}
          shouldUpdatePosition={shouldUpdatePosition}
          placement={placement}
          {...stylex.props(popoverStyles.wrapper, popoverStyles.animation)}
        >
          {Boolean(header) && (
            <>
              <div {...stylex.props(styles.header)}>{header}</div>
              <ListBoxSeparator />
            </>
          )}
          <AriaMenu
            {...props}
            onAction={handleAction}
            {...stylex.props(styles.menu)}
          />
          {Boolean(footer) && (
            <>
              <ListBoxSeparator />
              <div {...stylex.props(styles.footer)}>{footer}</div>
            </>
          )}
        </Popover>
      </MenuTrigger>
    </SizeContext>
  );
}

export interface SubMenuProps<T extends object>
  extends
    Omit<SubmenuTriggerProps, "trigger" | "children">,
    Omit<AriaMenuProps<T>, "children" | "className" | "style">,
    Pick<
      PopoverProps,
      | "shouldCloseOnInteractOutside"
      | "shouldFlip"
      | "shouldUpdatePosition"
      | "placement"
    > {
  trigger: React.ReactElement<MenuTriggerProps>;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode | ((item: T) => React.ReactNode);
  items?: Iterable<T>;
  size?: Size;
}

export function SubMenu<T extends object>({
  trigger,
  delay,
  shouldCloseOnInteractOutside,
  shouldFlip,
  shouldUpdatePosition,
  placement,
  header,
  footer,
  ...props
}: SubMenuProps<T>) {
  const popoverStyles = usePopoverStyles();

  return (
    <SubmenuTrigger delay={delay}>
      {trigger}
      <Popover
        shouldCloseOnInteractOutside={shouldCloseOnInteractOutside}
        shouldFlip={shouldFlip}
        shouldUpdatePosition={shouldUpdatePosition}
        placement={placement}
        containerPadding={8}
        offset={-8}
        {...stylex.props(popoverStyles.wrapper, popoverStyles.animation)}
      >
        {header}
        <AriaMenu {...props} {...stylex.props(styles.menu)} />
        {footer}
      </Popover>
    </SubmenuTrigger>
  );
}

export interface MenuSectionProps<
  T extends object,
> extends StyleXComponentProps<AriaMenuSectionProps<T>> {
  children: React.ReactNode;
}

export function MenuSection<T extends object>({
  style,
  ...props
}: MenuSectionProps<T>) {
  return <AriaMenuSection {...props} {...stylex.props(style)} />;
}

export interface MenuItemProps extends StyleXComponentProps<
  Omit<AriaMenuItemProps, "children">
> {
  children: React.ReactNode;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  variant?: "default" | "destructive";
}

export function MenuItem({
  style,
  children,
  prefix,
  suffix,
  variant = "default",
  ...props
}: MenuItemProps) {
  const menuItemStyles = useListBoxItemStyles();

  return (
    <AriaMenuItem
      {...props}
      data-variant={variant}
      textValue={
        props.textValue || (typeof children === "string" ? children : undefined)
      }
      {...stylex.props(menuItemStyles.wrapper, style)}
    >
      {({ isSelected, hasSubmenu }) => (
        <div {...stylex.props(menuItemStyles.inner)}>
          {prefix != null && (
            <div {...stylex.props(menuItemStyles.addon)}>{prefix}</div>
          )}
          <div {...stylex.props(menuItemStyles.label)}>{children}</div>
          {suffix != null && (
            <div {...stylex.props(menuItemStyles.addon)}>{suffix}</div>
          )}
          {isSelected && (
            <div {...stylex.props(menuItemStyles.addon)}>
              <Check size={16} {...stylex.props(menuItemStyles.check)} />
            </div>
          )}
          {hasSubmenu && (
            <div {...stylex.props(menuItemStyles.addon)}>
              <ChevronRight size={16} />
            </div>
          )}
        </div>
      )}
    </AriaMenuItem>
  );
}

export type {
  ListBoxSectionHeaderProps as MenuSectionHeaderProps,
  ListBoxSeparatorProps as MenuSeparatorProps,
} from "../listbox";

export {
  ListBoxSectionHeader as MenuSectionHeader,
  ListBoxSeparator as MenuSeparator,
} from "../listbox";
