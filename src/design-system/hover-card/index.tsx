"use client";

import type {
  PopoverProps as AriaPopoverProps,
  DialogTriggerProps,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { use, useRef } from "react";
import { mergeProps, useFocusVisible, useHover, useKeyboard } from "react-aria";
import {
  Popover as AriaPopover,
  Dialog,
  DialogTrigger,
  OverlayTriggerStateContext,
  Pressable,
} from "react-aria-components";

import type { StyleXComponentProps } from "../theme/types";

import {
  horizontalSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { shadow } from "../theme/shadow.stylex";
import { usePopoverStyles } from "../theme/usePopoverStyles";

const styles = stylex.create({
  wrapper: {
    shadow: shadow.md,
  },
  content: {
    outline: "none",
    position: "relative",
    paddingBottom: verticalSpace["md"],
    paddingLeft: horizontalSpace["md"],
    paddingRight: horizontalSpace["md"],
    paddingTop: verticalSpace["md"],
  },
});

interface HoverCardInnerProps extends StyleXComponentProps<
  Omit<AriaPopoverProps, "trigger">
> {
  trigger: React.ComponentProps<typeof Pressable>["children"];
  triggerName?: AriaPopoverProps["trigger"];
  children: React.ReactNode;
  showDelay?: number;
  hideDelay?: number;
}

/** Ignore leave events for this long after opening to avoid spurious pointerleave from layout shifts when popover mounts */
const IGNORE_LEAVE_AFTER_OPEN_MS = 150;

function HoverCardInner({
  trigger,
  triggerName,
  children,
  style,
  showDelay = 250,
  hideDelay = 250,
  ...popoverProps
}: HoverCardInnerProps) {
  const { isFocusVisible } = useFocusVisible();
  const { keyboardProps } = useKeyboard({
    onKeyDown: (e) => {
      if (!isFocusVisible) return;
      if (e.key !== "Enter") return;
      overlayTriggerState?.open();
    },
  });
  const overlayTriggerState = use(OverlayTriggerStateContext);
  const popoverStyles = usePopoverStyles();
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const openedAtRef = useRef<number | null>(null);
  const { hoverProps } = useHover({
    onHoverStart: () => {
      if (showTimeoutRef.current) return;
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      showTimeoutRef.current = setTimeout(() => {
        overlayTriggerState?.open();
        openedAtRef.current = Date.now();
        showTimeoutRef.current = null;
      }, showDelay);
    },
    onHoverEnd: () => {
      // Ignore leave shortly after opening - popover mount can cause spurious pointerleave
      // (e.g. from scroll lock shifting layout or DOM updates when overlay appears)
      if (
        openedAtRef.current &&
        Date.now() - openedAtRef.current < IGNORE_LEAVE_AFTER_OPEN_MS
      ) {
        return;
      }
      openedAtRef.current = null;
      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current);
        showTimeoutRef.current = null;
      }
      hideTimeoutRef.current = setTimeout(() => {
        overlayTriggerState?.close();
        hideTimeoutRef.current = null;
      }, hideDelay);
    },
  });

  return (
    <>
      <Pressable {...mergeProps(hoverProps, keyboardProps)}>
        {trigger}
      </Pressable>
      <AriaPopover
        {...stylex.props(
          styles.wrapper,
          popoverStyles.wrapper,
          popoverStyles.animation,
        )}
        offset={8}
        containerPadding={8}
        isNonModal={isFocusVisible ? false : true}
        trigger={triggerName}
        {...mergeProps(hoverProps, popoverProps)}
      >
        <Dialog {...stylex.props(styles.content, style)}>{children}</Dialog>
      </AriaPopover>
    </>
  );
}

export interface HoverCardProps
  extends DialogTriggerProps, HoverCardInnerProps {}

export const HoverCard = ({
  defaultOpen,
  isOpen,
  onOpenChange,
  ...props
}: HoverCardProps) => {
  return (
    <DialogTrigger
      {...({ isOpen, onOpenChange, defaultOpen } as DialogTriggerProps)}
    >
      <HoverCardInner {...props} />
    </DialogTrigger>
  );
};
