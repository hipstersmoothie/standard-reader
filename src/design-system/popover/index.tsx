"use client";

import type {
  PopoverProps as AriaPopoverProps,
  DialogTriggerProps,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import {
  Popover as AriaPopover,
  Dialog,
  DialogTrigger,
  OverlayArrow,
} from "react-aria-components";

import type { StyleXComponentProps } from "../theme/types";

import { useHaptics } from "../haptics";
import { uiColor } from "../theme/color.stylex";
import {
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { usePopoverStyles } from "../theme/usePopoverStyles";

const styles = stylex.create({
  wrapperWithArrow: {
    filter: `drop-shadow(-0.5px -0.5px 0 ${uiColor.border2}) drop-shadow(0.5px -0.5px 0 ${uiColor.border2}) drop-shadow(0.5px 0.5px 0 ${uiColor.border2}) drop-shadow(-0.5px 0.5px 0 ${uiColor.border2}) drop-shadow(0px 1px 3px rgb(0 0 0 / 0.1)) drop-shadow(0px -1px 3px rgb(0 0 0 / 0.1))`,
  },
  wrapper: {
    borderColor: uiColor.border2,
    borderStyle: "solid",
    borderWidth: 1,
  },
  content: {
    boxShadow: "none",
    position: "relative",
    paddingBottom: verticalSpace["3xl"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  caret: {},
  arrow: {
    backgroundColor: uiColor.bgSubtle,
    transform: {
      [":is([data-placement=bottom] *)"]: "rotate(180deg)",
      [":is([data-placement=left] *)"]: "rotate(90deg)",
      [":is([data-placement=right] *)"]: "rotate(-90deg)",
      [":is([data-placement=top] *)"]: "tranuiColorY(-50%) rotate(-45deg)",
    },
    zIndex: 0,
    height: sizeSpace["sm"],
    width: sizeSpace["sm"],
  },
});
interface PopoverProps
  extends
    DialogTriggerProps,
    StyleXComponentProps<Omit<AriaPopoverProps, "className" | "trigger">> {
  trigger: React.ReactNode;
  triggerName?: Pick<AriaPopoverProps, "trigger">;
  children: React.ReactNode;
  hasArrow?: boolean;
}

export const Popover = ({
  trigger,
  children,
  defaultOpen,
  isOpen,
  onOpenChange,
  style,
  hasArrow,
  ...popoverProps
}: PopoverProps) => {
  const { trigger: triggerHaptic } = useHaptics();
  const popoverStyles = usePopoverStyles();

  const handleOpenChange = (open: boolean) => {
    triggerHaptic("impactLight");
    onOpenChange?.(open);
  };

  return (
    <DialogTrigger
      {...({
        isOpen,
        onOpenChange: handleOpenChange,
        defaultOpen,
      } as DialogTriggerProps)}
    >
      {trigger}

      <AriaPopover
        offset={8}
        containerPadding={8}
        {...popoverProps}
        {...stylex.props(
          popoverStyles.animation,
          hasArrow && styles.wrapperWithArrow,
        )}
      >
        {hasArrow && (
          <OverlayArrow {...stylex.props(styles.caret)}>
            <div {...stylex.props(styles.arrow)} />
          </OverlayArrow>
        )}
        <Dialog
          {...stylex.props(
            popoverStyles.wrapper,
            styles.content,
            !hasArrow && styles.wrapper,
            style,
          )}
        >
          {children}
        </Dialog>
      </AriaPopover>
    </DialogTrigger>
  );
};
