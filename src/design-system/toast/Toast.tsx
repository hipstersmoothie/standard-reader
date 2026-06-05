"use client";

import type {
  ToastRegionProps as AriaToastRegionProps,
  QueuedToast,
} from "react-aria-components";

import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import { useEffect } from "react";
import {
  UNSTABLE_ToastRegion as AriaToastRegion,
  Text,
  UNSTABLE_Toast as Toast,
  UNSTABLE_ToastContent as ToastContent,
} from "react-aria-components";

import type { StyleXComponentProps } from "../theme/types";
import type { ToastContentType } from "./queue";

import { Button } from "../button";
import { Flex } from "../flex";
import { useHaptics } from "../haptics";
import { IconButton } from "../icon-button";
import {
  criticalColor,
  successColor,
  uiColor,
  warningColor,
} from "../theme/color.stylex";
import {
  gap,
  horizontalSpace,
  size as sizeSpace,
  verticalSpace,
} from "../theme/semantic-spacing.stylex";
import { lineHeight, typeramp } from "../theme/typography.stylex";
import { usePopoverStyles } from "../theme/usePopoverStyles";
import { toasts } from "./queue";

const styles = stylex.create({
  region: {
    gap: gap["md"],
    outline: "none",
    display: "flex",
    flexDirection: "column-reverse",
    position: "fixed",
    zIndex: 9999,
    bottom: verticalSpace["3xl"],
    right: horizontalSpace["3xl"],
  },
  toast: {
    gap: gap["2xl"],
    alignItems: "center",
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    minWidth: sizeSpace["10xl"],
    paddingBottom: verticalSpace["xl"],
    paddingLeft: horizontalSpace["3xl"],
    paddingRight: horizontalSpace["3xl"],
    paddingTop: verticalSpace["xl"],
  },
  content: {
    flexGrow: '1',
    flexShrink: '1',
    flexBasis: 'auto',
    gap: gap["lg"],
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  title: {
    color: {
      default: uiColor.text1,
      ":is([data-variant=critical] *)": criticalColor.textContrast,
      ":is([data-variant=success] *)": successColor.text2,
      ":is([data-variant=warning] *)": warningColor.text2,
    },
    fontWeight: 600,
    lineHeight: lineHeight["none"],
  },
  description: {
    color: {
      default: uiColor.text1,
      ":is([data-variant=critical] *)": criticalColor.text1,
      ":is([data-variant=success] *)": successColor.text1,
      ":is([data-variant=warning] *)": warningColor.text1,
    },
  },
  icon: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",

    // eslint-disable-next-line @stylexjs/no-legacy-contextual-styles, @stylexjs/valid-styles
    ":is(*) svg": {
      color: {
        ":is([data-variant=critical] *)": criticalColor.solid1,
        ":is([data-variant=success] *)": successColor.solid1,
        ":is([data-variant=warning] *)": warningColor.solid1,
      },
      flexShrink: 0,
      pointerEvents: "none",
      height: sizeSpace["md"],
      width: sizeSpace["md"],
    },
  },
  critical: {
    borderColor: criticalColor.border2,
    backgroundColor: criticalColor.component1,
    color: criticalColor.text2,
  },
  success: {
    borderColor: successColor.border2,
    backgroundColor: successColor.component1,
    color: successColor.text2,
  },
  warning: {
    borderColor: warningColor.border2,
    backgroundColor: warningColor.component1,
    color: warningColor.text2,
  },
});

function ToastItem({ toast }: { toast: QueuedToast<ToastContentType> }) {
  const { trigger } = useHaptics();
  const popoverStyles = usePopoverStyles();

  useEffect(() => {
    if (toast.content.variant === "success") {
      trigger("success");
    } else if (toast.content.variant === "critical") {
      trigger("error");
    }
  }, [toast.key, toast.content.variant, trigger]);

  return (
    <Toast
      toast={toast}
      data-variant={toast.content.variant}
      {...stylex.props(
        popoverStyles.wrapper,
        styles.toast,
        toast.content.variant === "critical" && styles.critical,
        toast.content.variant === "success" && styles.success,
        toast.content.variant === "warning" && styles.warning,
      )}
    >
      {Boolean(toast.content.icon) && (
        <div {...stylex.props(styles.icon)}>{toast.content.icon}</div>
      )}
      <ToastContent {...stylex.props(styles.content)}>
        <Text slot="title" {...stylex.props(typeramp.body, styles.title)}>
          {toast.content.title}
        </Text>
        {toast.content.description && (
          <Text
            slot="description"
            {...stylex.props(styles.description, typeramp.label)}
          >
            {toast.content.description}
          </Text>
        )}
      </ToastContent>
      <Flex direction="row" gap="xs">
        {toast.content.action && (
          <Button
            size="sm"
            variant={toast.content.action.variant}
            onPress={() => {
              toast.content.action?.onPress();
              toasts.close(toast.key);
            }}
          >
            {toast.content.action.label}
          </Button>
        )}
        <IconButton
          aria-label="Close"
          size="sm"
          variant="tertiary"
          slot="close"
        >
          <X />
        </IconButton>
      </Flex>
    </Toast>
  );
}

export interface ToastRegionProps extends StyleXComponentProps<
  Omit<AriaToastRegionProps<ToastContentType>, "children" | "queue">
> {}

export function ToastRegion({ style, ...props }: ToastRegionProps) {
  return (
    <AriaToastRegion
      queue={toasts}
      {...props}
      {...stylex.props(styles.region, style)}
    >
      {({ toast }) => <ToastItem toast={toast} />}
    </AriaToastRegion>
  );
}
