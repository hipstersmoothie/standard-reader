"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { CopyToClipboardButton } from "@standard-reader/design-system/copy-to-clipboard-button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@standard-reader/design-system/dialog";
import { Flex } from "@standard-reader/design-system/flex";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import type { Size } from "@standard-reader/design-system/theme/types";
import {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import { SmallBody } from "@standard-reader/design-system/typography";
import * as stylex from "@stylexjs/stylex";
import { Rss } from "lucide-react";
import { useState } from "react";

const styles = stylex.create({
  dialogTitle: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
  },
  body: {
    gap: gap["2xl"],
    display: "flex",
    flexDirection: "column",
    width: "100%",
  },
  field: {
    padding: verticalSpace.md,
    borderColor: uiColor.border1,
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.component2,
    boxSizing: "border-box",
    color: uiColor.text1,
    flexGrow: 1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    minWidth: 0,
    width: "100%",
  },
});

/**
 * Icon button that opens a dialog explaining an RSS feed and offering its URL
 * as a one-click copy target — the same "explain + copyable value" shape as
 * `ShareMenu`'s embed-subscribe dialog, without the menu/embed-tab machinery.
 */
export function RssFeedButton({
  feedUrl,
  name,
  variant = "icon",
  size = "md",
  isOpen: controlledOpen,
  onOpenChange,
}: {
  feedUrl: string;
  /** Subject shown in the dialog copy, e.g. a publication, list, or author name. */
  name: string;
  variant?: "button" | "icon";
  size?: Size;
  /**
   * Optional controlled open state. When provided, the dialog is driven by the
   * parent — letting another control (e.g. an overflow menu item) open it.
   */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const iconSize = size === "sm" ? 14 : 18;

  return (
    <>
      {variant === "icon" ? (
        <IconButton
          variant="secondary"
          size={size}
          label={t`RSS feed`}
          onPress={() => setOpen(true)}
        >
          <Rss size={iconSize} />
        </IconButton>
      ) : (
        <Button
          variant="secondary"
          size={size === "sm" ? "sm" : undefined}
          onPress={() => setOpen(true)}
        >
          <Rss size={14} /> RSS
        </Button>
      )}

      <RssFeedDialog
        name={name}
        feedUrl={feedUrl}
        isOpen={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

/**
 * The dialog on its own, for surfaces that open it from something other than
 * the button — e.g. an overflow menu item in the publication hero.
 */
export function RssFeedDialog({
  feedUrl,
  name,
  isOpen,
  onOpenChange,
}: {
  feedUrl: string;
  name: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
      fitContent
      trigger={<span hidden aria-hidden />}
    >
      <DialogHeader>
        <span {...stylex.props(styles.dialogTitle)}>
          <Trans>RSS feed</Trans>
        </span>
      </DialogHeader>
      <DialogBody style={styles.body}>
        <SmallBody variant="secondary">
          <Trans>
            Subscribe to {name} in any RSS reader — new articles show up there
            as soon as they publish.
          </Trans>
        </SmallBody>
        <Flex align="center" gap="sm">
          <input
            readOnly
            aria-label={t`RSS feed URL`}
            value={feedUrl}
            onFocus={(event) => event.currentTarget.select()}
            {...stylex.props(styles.field)}
          />
          <CopyToClipboardButton text={feedUrl} size="lg" />
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={() => onOpenChange(false)}>
          <Trans>Close</Trans>
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
