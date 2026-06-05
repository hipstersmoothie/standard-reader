"use client";

import type { DialogTriggerProps } from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import { use } from "react";
import { mergeProps } from "react-aria";
import {
  Dialog as AriaDialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
  OverlayTriggerStateContext,
} from "react-aria-components";

import type { ButtonProps } from "../button";
import type { StyleXComponentProps } from "../theme/types";

import { Button } from "../button";
import { useHaptics } from "../haptics";
import { IconButton } from "../icon-button";
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
    paddingBottom: verticalSpace["md"],
    paddingTop: verticalSpace["md"],
  },
  header: {
    gap: gap["md"],
    alignItems: "center",
    display: "flex",
    fontSize: fontSize["lg"],
    justifyContent: "space-between",
    height: sizeSpace["3xl"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace["md"],
  },
  description: {
    paddingBottom: verticalSpace["3xl"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  footer: {
    gap: gap["md"],
    display: "flex",
    justifyContent: "flex-end",
    paddingBottom: verticalSpace["md"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
  },
});

export interface AlertDialogProps extends DialogTriggerProps {
  /**
   * The trigger element to open the dialog.
   */
  trigger: React.ReactNode;
  /**
   * The content of the dialog.
   */
  children: React.ReactNode;
}

export const AlertDialog = ({
  trigger,
  children,
  defaultOpen,
  isOpen,
  onOpenChange,
}: AlertDialogProps) => {
  const { trigger: triggerHaptic } = useHaptics();
  const dialogStyles = useDialogStyles({ size: "sm" });

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

      <ModalOverlay
        isKeyboardDismissDisabled
        {...stylex.props(dialogStyles.overlay)}
      >
        <Modal {...stylex.props(dialogStyles.modal)}>
          <AriaDialog
            {...stylex.props(dialogStyles.dialog, styles.dialog)}
            role="alertdialog"
          >
            {children}
          </AriaDialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
};

export interface AlertDialogHeaderProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const AlertDialogHeader = ({
  children,
  style,
}: AlertDialogHeaderProps) => {
  return (
    <div {...stylex.props(styles.header, style)}>
      <Heading>{children}</Heading>
      <IconButton label="Close" size="sm" variant="tertiary" slot="close">
        <X />
      </IconButton>
    </div>
  );
};

export interface AlertDialogDescriptionProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const AlertDialogDescription = ({
  children,
  style,
}: AlertDialogDescriptionProps) => {
  return (
    <div {...stylex.props(styles.description, typeramp.body, style)}>
      {children}
    </div>
  );
};

export interface AlertDialogFooterProps extends StyleXComponentProps<
  React.ComponentProps<"div">
> {}

export const AlertDialogFooter = ({
  children,
  style,
}: AlertDialogFooterProps) => {
  return <div {...stylex.props(styles.footer, style)}>{children}</div>;
};

export type AlertDialogCancelButtonProps = Omit<ButtonProps, "slot">;

export const AlertDialogCancelButton = ({
  children = "Cancel",
  ...props
}: AlertDialogCancelButtonProps) => {
  return (
    <Button variant="secondary" {...props} slot="close">
      {children}
    </Button>
  );
};

export type AlertDialogActionButtonProps = ButtonProps & {
  /**
   * Whether to close the dialog when the button is pressed.
   * If you are doing somthing async, you likely want to set this to false
   * and use isLoading=true.
   */
  closeOnPress?: boolean;
};

export const AlertDialogActionButton = ({
  closeOnPress = true,
  children = "Ok",
  ...props
}: AlertDialogActionButtonProps) => {
  const state = use(OverlayTriggerStateContext);
  const onPress = () => {
    if (closeOnPress) {
      state?.close();
    }
  };

  return <Button {...mergeProps(props, { onPress })}>{children}</Button>;
};
