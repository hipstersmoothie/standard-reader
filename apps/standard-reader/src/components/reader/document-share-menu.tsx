"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Share2 } from "lucide-react";
import { useState } from "react";

import { IconButton } from "@standard-reader/design-system/icon-button";
import { MenuItem, MenuSeparator } from "@standard-reader/design-system/menu";
import type { Size } from "@standard-reader/design-system/theme/types";
import { buildPdslsRecordUrl } from "#/lib/quote-share";

import { LinkShareMenu } from "./link-share-menu";
import { SaveToCollectionDialog } from "./save-to-collection-dialog";

function openExternal(url: string) {
  globalThis.open(url, "_blank", "noopener,noreferrer");
}

function currentPageUrl(): string {
  // `location` is undefined during SSR — LinkShareMenu calls this while
  // rendering (to decide `canShare`), so guard against the server.
  return globalThis.location?.href ?? "";
}

export function DocumentShareMenu({
  recordUri,
  title,
  canonicalUrl,
  description,
  author,
  siteName,
  imageUrl,
  size = "md",
}: {
  /** Document AT-URI for PDSLS. */
  recordUri: string;
  /** Article title, used as the saved record's title on Margin/Semble. */
  title: string;
  /** The original article's URL, when it has one — enables the "save the
   * original link instead" toggle in the save dialogs. */
  canonicalUrl?: string | null;
  /** Article summary, used as the saved Semble card's description. */
  description?: string | null;
  /** Article author/byline, used as the saved Semble card's author. */
  author?: string | null;
  /** Publication name, used as the saved Semble card's site name. */
  siteName?: string | null;
  /** Article hero image, used as the saved Semble card's image. */
  imageUrl?: string | null;
  size?: Size;
}) {
  const { t } = useLingui();
  const iconSize = size === "sm" ? 14 : 18;
  const [saveDialog, setSaveDialog] = useState<"margin" | "semble" | null>(
    null,
  );

  return (
    <>
      <LinkShareMenu
        getLinkUrl={currentPageUrl}
        trigger={
          <IconButton variant="secondary" size={size} label={t`Share`}>
            <Share2 size={iconSize} />
          </IconButton>
        }
      >
        <MenuSeparator />
        <MenuItem
          onPress={() => setSaveDialog("margin")}
          textValue={t`Save to Margin…`}
        >
          <Trans>Save to Margin…</Trans>
        </MenuItem>
        <MenuItem
          onPress={() => setSaveDialog("semble")}
          textValue={t`Save to Semble…`}
        >
          <Trans>Save to Semble…</Trans>
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          onPress={() => {
            openExternal(buildPdslsRecordUrl(recordUri));
          }}
          textValue={t`View on PDSLS`}
        >
          <Trans>View on PDSLS</Trans>
        </MenuItem>
      </LinkShareMenu>
      <SaveToCollectionDialog
        app="margin"
        isOpen={saveDialog === "margin"}
        onOpenChange={(open) => setSaveDialog(open ? "margin" : null)}
        articleTitle={title}
        getStandardReaderUrl={currentPageUrl}
        originalUrl={canonicalUrl}
      />
      <SaveToCollectionDialog
        app="semble"
        isOpen={saveDialog === "semble"}
        onOpenChange={(open) => setSaveDialog(open ? "semble" : null)}
        articleTitle={title}
        getStandardReaderUrl={currentPageUrl}
        originalUrl={canonicalUrl}
        articleDescription={description}
        articleAuthor={author}
        articleSiteName={siteName}
        articleImageUrl={imageUrl}
      />
    </>
  );
}
