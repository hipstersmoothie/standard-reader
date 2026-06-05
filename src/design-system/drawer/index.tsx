"use client";

import type { DialogTriggerProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import {
  Dialog as AriaDialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";

import type { Size, StyleXComponentProps } from "../theme/types";

import { useHaptics } from "../haptics";
import { IconButton } from "../icon-button";
import {
  animationDuration,
  animationTimingFunction,
  animations,
} from "../theme/animations.stylex";
import { uiColor } from "../theme/color.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { typeramp } from "../theme/typography.stylex";
import { useDialogStyles } from "../theme/useDialogStyles";
import { NonModalDrawer } from "./NonModalDrawer";

const styles = stylex.create({
  overlay: {
    zIndex: 0,
  },
  drawerWrapper: {
    position: "fixed",
    bottom: {
      ":is([data-direction=bottom])": 0,
      ":is([data-direction=left])": 0,
      ":is([data-direction=right])": 0,
    },
    left: {
      ":is([data-direction=bottom])": 0,
      ":is([data-direction=left])": 0,
      ":is([data-direction=top])": 0,
    },
    right: {
      ":is([data-direction=bottom])": 0,
      ":is([data-direction=right])": 0,
      ":is([data-direction=top])": 0,
    },
    top: {
      ":is([data-direction=left])": 0,
      ":is([data-direction=right])": 0,
      ":is([data-direction=top])": 0,
    },

    borderRadius: 0,
    translate: "unset",
    borderBottomWidth: {
      default: 0,
      ":is([data-direction=top])": 1,
    },
    borderLeftWidth: {
      default: 0,
      ":is([data-direction=right])": 1,
    },
    borderRightWidth: {
      default: 0,
      ":is([data-direction=left])": 1,
    },
    borderTopWidth: {
      default: 0,
      ":is([data-direction=bottom])": 1,
    },
    height: {
      ":is([data-direction=right], [data-direction=left])": "100vh",
      ":is([data-direction=top], [data-direction=bottom]):is([data-size=lg])":
        "800px",
      ":is([data-direction=top], [data-direction=bottom]):is([data-size=md])":
        "600px",
      ":is([data-direction=top], [data-direction=bottom]):is([data-size=sm])":
        "320px",
    },
    maxHeight: {
      ":is([data-direction=right], [data-direction=left])": "100vh",
      ":is([data-direction=top], [data-direction=bottom])": `calc(100vh - ${sizeSpace["3xl"]})`,
    },
    maxWidth: {
      ":is([data-direction=right], [data-direction=left])": `calc(100vw - ${sizeSpace["3xl"]})`,
      ":is([data-direction=top], [data-direction=bottom])": "100vw",
    },
    width: {
      ":is([data-direction=left], [data-direction=right]):is([data-size=lg])":
        "800px",
      ":is([data-direction=left], [data-direction=right]):is([data-size=md])":
        "600px",
      ":is([data-direction=left], [data-direction=right]):is([data-size=sm])":
        "320px",
      ":is([data-direction=top], [data-direction=bottom])": "100vw",
    },

    animationDuration: animationDuration.slow,
    animationName: {
      ":is([data-direction=bottom][data-entering])": animations.slideInBottom,
      ":is([data-direction=bottom][data-exiting])": animations.slideOutBottom,
      ":is([data-direction=left][data-entering])": animations.slideInLeft,
      ":is([data-direction=left][data-exiting])": animations.slideOutLeft,
      ":is([data-direction=right][data-entering])": animations.slideInRight,
      ":is([data-direction=right][data-exiting])": animations.slideOutRight,
      ":is([data-direction=top][data-entering])": animations.slideInTop,
      ":is([data-direction=top][data-exiting])": animations.slideOutTop,
    },
    animationTimingFunction: {
      ":is([data-entering])": animationTimingFunction.easeOut,
      ":is([data-exiting])": animationTimingFunction.easeIn,
    },
  },
  dialog: {
    overflow: "auto",
    paddingBottom: verticalSpace["md"],
    paddingTop: verticalSpace["md"],
  },
  header: {
    gap: gap["md"],
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    height: sizeSpace["3xl"],
    paddingBottom: verticalSpace["md"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
  },
  description: {
    color: uiColor.text1,
    paddingBottom: verticalSpace["3xl"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  body: {
    flexGrow: 1,
    paddingBottom: verticalSpace["3xl"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: { default: 0, ":first-child": verticalSpace["3xl"] },
  },
  footer: {
    gap: gap["md"],
    display: "flex",
    justifyContent: "flex-end",
    paddingBottom: verticalSpace["md"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],

    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
  },
});

export interface DrawerProps extends DialogTriggerProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  size?: Size;
  direction?: "left" | "right" | "top" | "bottom";
  isNonModal?: boolean;
}

export const Drawer = ({
  trigger,
  children,
  defaultOpen,
  isOpen,
  onOpenChange,
  size = "md",
  direction = "right",
  isNonModal = false,
}: DrawerProps) => {
  const { trigger: triggerHaptic } = useHaptics();
  const dialogStyles = useDialogStyles({ size });

  const handleOpenChange = (open: boolean) => {
    triggerHaptic("impactLight");
    onOpenChange?.(open);
  };

  return (
    <DialogTrigger
      defaultOpen={defaultOpen}
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
    >
      {trigger}

      {isNonModal ? (
        <NonModalDrawer
          data-size={size}
          data-direction={direction}
          {...stylex.props(dialogStyles.modal, styles.drawerWrapper)}
        >
          <AriaDialog {...stylex.props(dialogStyles.dialog, styles.dialog)}>
            {children}
          </AriaDialog>
        </NonModalDrawer>
      ) : (
        <ModalOverlay isDismissable>
          <div {...stylex.props(dialogStyles.overlay, styles.overlay)} />
          <Modal
            data-size={size}
            data-direction={direction}
            {...stylex.props(dialogStyles.modal, styles.drawerWrapper)}
          >
            <AriaDialog {...stylex.props(dialogStyles.dialog, styles.dialog)}>
              {children}
            </AriaDialog>
          </Modal>
        </ModalOverlay>
      )}
    </DialogTrigger>
  );
};

export interface DrawerHeaderProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const DrawerHeader = ({ children, style }: DrawerHeaderProps) => {
  return (
    <div {...stylex.props(styles.header, typeramp.heading5, style)}>
      <Heading>{children}</Heading>
      <IconButton label="Close" size="sm" variant="tertiary" slot="close">
        <X />
      </IconButton>
    </div>
  );
};

export interface DrawerDescriptionProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const DrawerDescription = ({
  children,
  style,
}: DrawerDescriptionProps) => {
  return (
    <div {...stylex.props(styles.description, typeramp.body, style)}>
      {children}
    </div>
  );
};

export interface DrawerBodyProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const DrawerBody = ({ children, style }: DrawerBodyProps) => {
  return <div {...stylex.props(styles.body, style)}>{children}</div>;
};

export interface DrawerFooterProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const DrawerFooter = ({ children, style }: DrawerFooterProps) => {
  return <div {...stylex.props(styles.footer, style)}>{children}</div>;
};
