"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@standard-reader/design-system/dialog";
import { Flex } from "@standard-reader/design-system/flex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { verticalSpace } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { Share, SquarePlus } from "lucide-react";

const styles = stylex.create({
  intro: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
  },
  step: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
  },
  stepIcon: {
    color: uiColor.text1,
    flexShrink: 0,
  },
});

const ICON_SIZE = 18;

/**
 * Explains how to turn notifications on when the reader is on iOS in a Safari
 * tab.
 *
 * iOS only exposes web push to a PWA installed on the Home Screen — in a tab
 * `PushManager` doesn't exist at all — and there is no programmatic install
 * prompt to trigger, so the only thing we can do is show the steps. The bell
 * stays visible and pressable rather than disabled: this is the one
 * "unsupported" case the reader can actually fix, and a dead control wouldn't
 * tell them that.
 */
export function IosInstallPrompt({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog
      trigger={null}
      size="sm"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <DialogHeader>
        <Trans>Add to your Home Screen</Trans>
      </DialogHeader>
      <DialogBody>
        <Flex direction="column" gap="lg">
          <p {...stylex.props(styles.intro)}>
            <Trans>
              On iPhone and iPad, notifications only work once Standard Reader
              is installed. It takes two taps.
            </Trans>
          </p>
          <Flex direction="column" gap="md">
            <Flex align="center" gap="md">
              <Share
                size={ICON_SIZE}
                aria-hidden
                {...stylex.props(styles.stepIcon)}
              />
              <span {...stylex.props(styles.step)}>
                <Trans>Tap Share in the Safari toolbar.</Trans>
              </span>
            </Flex>
            <Flex align="center" gap="md">
              <SquarePlus
                size={ICON_SIZE}
                aria-hidden
                {...stylex.props(styles.stepIcon)}
              />
              <span {...stylex.props(styles.step)}>
                <Trans>Choose “Add to Home Screen”.</Trans>
              </span>
            </Flex>
          </Flex>
          <p {...stylex.props(styles.intro)}>
            <Trans>
              Then open Standard Reader from your Home Screen and turn the bell
              on there.
            </Trans>
          </p>
        </Flex>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onPress={() => onOpenChange(false)}>
          <Trans>Got it</Trans>
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
