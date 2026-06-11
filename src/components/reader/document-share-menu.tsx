"use client";

import type { Size } from "#/design-system/theme/types";

import { IconButton } from "#/design-system/icon-button";
import { MenuItem, MenuSeparator } from "#/design-system/menu";
import { buildPdslsRecordUrl } from "#/lib/quote-share";
import { Share2 } from "lucide-react";

import { LinkShareMenu } from "./link-share-menu";

function openExternal(url: string) {
  globalThis.open(url, "_blank", "noopener,noreferrer");
}

function currentPageUrl(): string {
  return globalThis.location.href;
}

export function DocumentShareMenu({
  recordUri,
  size = "md",
}: {
  /** Document AT-URI for PDSLS. */
  recordUri: string;
  size?: Size;
}) {
  const iconSize = size === "sm" ? 14 : 18;

  return (
    <LinkShareMenu
      getLinkUrl={currentPageUrl}
      trigger={
        <IconButton variant="secondary" size={size} label="Share">
          <Share2 size={iconSize} />
        </IconButton>
      }
    >
      <MenuSeparator />
      <MenuItem
        onPress={() => {
          openExternal(buildPdslsRecordUrl(recordUri));
        }}
      >
        View on PDSLS
      </MenuItem>
    </LinkShareMenu>
  );
}
