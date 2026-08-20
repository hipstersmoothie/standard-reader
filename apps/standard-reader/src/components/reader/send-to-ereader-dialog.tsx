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
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import { SmallBody } from "@standard-reader/design-system/typography";
import * as stylex from "@stylexjs/stylex";
import { BookDown } from "lucide-react";

import { startDownload } from "./start-download";

const styles = stylex.create({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: gap["2xl"],
    width: "100%",
  },
  dialogTitle: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
  },
  field: {
    backgroundColor: uiColor.component2,
    borderColor: uiColor.border1,
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    color: uiColor.text1,
    flexGrow: 1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    minWidth: 0,
    padding: verticalSpace.md,
    width: "100%",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: gap.md,
  },
});

export interface EreaderDownload {
  url: string;
  label: string;
}

/**
 * "Send to your e-reader" — the two ways a reader gets something onto a device.
 *
 * A one-off download for the piece in front of them, and the catalog URL for
 * the readers who would rather have their device fetch it. Both in one dialog
 * because they answer the same question, and a reader who wants one usually
 * wants to know the other exists.
 */
export function SendToEreaderDialog({
  isOpen,
  onOpenChange,
  name,
  catalogUrl,
  downloads = [],
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is being sent — a publication, an article, a list. */
  name: string;
  /** OPDS catalog URL for this thing, when it has one. */
  catalogUrl?: string | null;
  downloads?: Array<EreaderDownload>;
}) {
  const { t } = useLingui();

  return (
    <Dialog
      fitContent
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
      trigger={<span hidden aria-hidden />}
    >
      <DialogHeader>
        <span {...stylex.props(styles.dialogTitle)}>
          <Trans>Send to your e-reader</Trans>
        </span>
      </DialogHeader>
      <DialogBody style={styles.body}>
        {downloads.length > 0 ? (
          <div {...stylex.props(styles.section)}>
            <SmallBody variant="secondary">
              <Trans>
                Download {name} as a file — images and all, ready to read
                offline.
              </Trans>
            </SmallBody>
            <Flex gap="sm" wrap>
              {downloads.map((download) => (
                <Button
                  key={download.url}
                  onPress={() => startDownload(download.url)}
                  variant="secondary"
                >
                  <BookDown size={14} /> {download.label}
                </Button>
              ))}
            </Flex>
          </div>
        ) : null}

        {catalogUrl ? (
          <div {...stylex.props(styles.section)}>
            <SmallBody variant="secondary">
              <Trans>
                Or add this catalog URL to KOReader, Foliate, Marvin or any
                other OPDS app, and browse {name} from the device itself.
              </Trans>
            </SmallBody>
            <Flex align="center" gap="sm">
              <input
                readOnly
                aria-label={t`OPDS catalog URL`}
                onFocus={(event) => event.currentTarget.select()}
                value={catalogUrl}
                {...stylex.props(styles.field)}
              />
              <CopyToClipboardButton size="lg" text={catalogUrl} />
            </Flex>
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button onPress={() => onOpenChange(false)} variant="secondary">
          <Trans>Close</Trans>
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
