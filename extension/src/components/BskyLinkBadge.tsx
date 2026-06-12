import * as stylex from "@stylexjs/stylex";
import { Flex } from "#/design-system/flex";
import { IconButton } from "#/design-system/icon-button";
import { uiColor } from "#/design-system/theme/color.stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import { ui } from "#/design-system/theme/semantic-color.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import { Bookmark, ExternalLink } from "lucide-react";
import { useState } from "react";

import type { ExtensionResolveResult } from "../lib/types";

import { sendMessage } from "../lib/messaging";
import { ExtensionTheme } from "./ExtensionTheme";

const styles = stylex.create({
  badge: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    paddingBlock: verticalSpace.xs,
    paddingInline: horizontalSpace.xs,
    alignItems: "center",
    backgroundColor: ui.bgSubtle,
    display: "inline-flex",
    marginInlineStart: horizontalSpace.xs,
    verticalAlign: "middle",
  },
});

type BskyLinkBadgeProps = {
  result: ExtensionResolveResult;
  onUpdate: () => void;
};

export function BskyLinkBadge({ result, onUpdate }: BskyLinkBadgeProps) {
  const [busy, setBusy] = useState(false);

  if (result.kind !== "article") return null;

  const toggleSave = async () => {
    setBusy(true);
    try {
      await sendMessage({
        type: "bookmark",
        documentUri: result.documentUri,
        save: !result.isBookmarked,
      });
      onUpdate();
    } finally {
      setBusy(false);
    }
  };

  const openReader = async () => {
    await sendMessage({ type: "openReader", url: result.readerUrl });
  };

  return (
    <ExtensionTheme variant="page">
      <span {...stylex.props(styles.badge)}>
        <Flex direction="row" gap="xs" align="center">
          <IconButton
            aria-label={
              result.isBookmarked ? "Saved" : "Save to Standard Reader"
            }
            variant={result.isBookmarked ? "primary" : "tertiary"}
            size="sm"
            isDisabled={busy}
            onPress={() => {
              void toggleSave();
            }}
          >
            <Bookmark size={14} />
          </IconButton>
          <IconButton
            aria-label="Open in Standard Reader"
            variant="tertiary"
            size="sm"
            isDisabled={busy}
            onPress={() => {
              void openReader();
            }}
          >
            <ExternalLink size={14} />
          </IconButton>
        </Flex>
      </span>
    </ExtensionTheme>
  );
}
