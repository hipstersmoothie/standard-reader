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
import { uiColor } from "../theme/color.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { fontSize, typeramp } from "../theme/typography.stylex";
import { useDialogStyles } from "../theme/useDialogStyles";

const styles = stylex.create({
  dialog: {
    overflow: "auto",
  },
  header: {
    gap: gap["md"],
    alignItems: "center",
    backgroundColor: uiColor.bg,
    display: "flex",
    fontSize: fontSize["lg"],
    justifyContent: "space-between",
    position: "sticky",
    zIndex: 1,
    paddingBottom: verticalSpace["md"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace["md"],
    top: 0,

    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: fontSize["lg"],
    marginTop: 0,
    marginBottom: 0,
  },
  description: {
    color: uiColor.text1,
    marginBottom: verticalSpace["3xl"],
    marginTop: verticalSpace["3xl"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
  },
  body: {
    marginBottom: verticalSpace["3xl"],
    marginTop: verticalSpace["3xl"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
  },
  /* eslint-disable @stylexjs/sort-keys -- footer layout + padding order */
  footer: {
    gap: gap["md"],
    display: "flex",
    justifyContent: "flex-end",
    paddingBottom: verticalSpace["3xl"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    position: "sticky",
    paddingTop: verticalSpace["3xl"],
    zIndex: 1,
    bottom: 0,
    backgroundColor: uiColor.bg,

    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
  },
  /* eslint-enable @stylexjs/sort-keys */
});

export interface DialogProps extends DialogTriggerProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  size?: Size;
}

export const Dialog = ({
  trigger,
  children,
  defaultOpen,
  isOpen,
  onOpenChange,
  size,
}: DialogProps) => {
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

      <ModalOverlay {...stylex.props(dialogStyles.overlay)} isDismissable>
        <Modal {...stylex.props(dialogStyles.modal)}>
          <AriaDialog {...stylex.props(dialogStyles.dialog, styles.dialog)}>
            {children}
          </AriaDialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
};

export interface DialogHeaderProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const DialogHeader = ({ children, style }: DialogHeaderProps) => {
  return (
    <div {...stylex.props(styles.header, style)}>
      <Heading {...stylex.props(styles.headerTitle)}>{children}</Heading>
      <IconButton label="Close" size="sm" variant="tertiary" slot="close">
        <X />
      </IconButton>
    </div>
  );
};

export interface DialogDescriptionProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const DialogDescription = ({
  children,
  style,
}: DialogDescriptionProps) => {
  return (
    <div {...stylex.props(styles.description, typeramp.body, style)}>
      {children}
    </div>
  );
};

export interface DialogBodyProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const DialogBody = ({ children, style }: DialogBodyProps) => {
  return <div {...stylex.props(styles.body, style)}>{children}</div>;
};

export interface DialogFooterProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const DialogFooter = ({ children, style }: DialogFooterProps) => {
  return <div {...stylex.props(styles.footer, style)}>{children}</div>;
};
