"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { Code, Link as LinkIcon, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Key } from "react-aria-components";

import { Button } from "@standard-reader/design-system/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@standard-reader/design-system/dialog";
import { Flex } from "@standard-reader/design-system/flex";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { Menu, MenuItem } from "@standard-reader/design-system/menu";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@standard-reader/design-system/segmented-control";
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
import type { PublicationEmbedMeta } from "#/integrations/tanstack-query/api-publication.functions";
import { shareLinkUrl, useNativeShareAvailable } from "#/lib/native-share";
import { getPublicUrlClient } from "#/lib/public-url";
import type { SubscribeEmbedTab } from "#/lib/publication-embed";
import {
  buildSubscribeAnchorSnippet,
  buildSubscribeEmbedSnippet,
  subscribePageUrl,
} from "#/lib/publication-embed";
import { buildBlueskyComposeUrl } from "#/lib/quote-share";

import { SubscribeEmbedPreview } from "./subscribe-embed-preview";

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
  previewPanel: {
    borderRadius: radius.md,
    cornerShape: "squircle",
    overflow: "visible",
    backgroundColor: uiColor.component1,
    flexShrink: 0,
    paddingBottom: verticalSpace.lg,
    paddingInlineStart: verticalSpace.lg,
    paddingInlineEnd: verticalSpace.lg,
    paddingTop: verticalSpace.lg,
    width: "100%",
  },
  layoutControl: {
    flexShrink: 0,
    width: "100%",
  },
  snippetSection: {
    flexShrink: 0,
    width: "100%",
  },
  snippet: {
    padding: verticalSpace.md,
    borderColor: uiColor.border1,
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.component2,
    boxSizing: "border-box",
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    lineHeight: 1.5,
    resize: "vertical",
    minHeight: "5.5rem",
    width: "100%",
  },
  linkPreview: {
    textDecoration: "underline",
    color: uiColor.text1,
    fontSize: fontSize.sm,
  },
  linkPreviewPanel: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    minHeight: "5rem",
    width: "100%",
  },
});

export function ShareMenu({
  pageUrl,
  embed,
  variant = "button",
  size = "md",
}: {
  pageUrl: string;
  /** When set, the menu offers a subscribe embed snippet for this publication. */
  embed?: PublicationEmbedMeta;
  variant?: "button" | "icon";
  size?: Size;
}) {
  const { t } = useLingui();
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedTab, setEmbedTab] = useState<SubscribeEmbedTab>("landscape");
  const [copied, setCopied] = useState<"link" | "embed" | "anchor" | null>(
    null,
  );
  const nativeShareAvailable = useNativeShareAvailable();

  const baseUrl = getPublicUrlClient();

  const publicationName = embed?.name ?? "";

  const subscribeHref = embed
    ? subscribePageUrl({ did: embed.did, rkey: embed.rkey, baseUrl })
    : "";

  const embedSnippet = useMemo(() => {
    if (!embed) return "";
    if (embedTab === "link") {
      return buildSubscribeAnchorSnippet({
        did: embed.did,
        rkey: embed.rkey,
        name: embed.name,
        baseUrl,
      });
    }
    return buildSubscribeEmbedSnippet({
      did: embed.did,
      rkey: embed.rkey,
      name: embed.name,
      topic: embed.topic,
      ownerDisplayName: embed.ownerDisplayName,
      ownerHandle: embed.ownerHandle,
      description: embed.description,
      layout: embedTab,
      themeBackground: embed.themeBackground,
      themeForeground: embed.themeForeground,
      themeAccent: embed.themeAccent,
      themeAccentForeground: embed.themeAccentForeground,
      baseUrl,
    });
  }, [embed, embedTab, baseUrl]);

  const onEmbedTabChange = (keys: Set<Key>) => {
    const next = [...keys][0];
    if (next === "landscape" || next === "portrait" || next === "link") {
      setEmbedTab(next);
    }
  };

  const onCopyLink = async () => {
    await navigator.clipboard.writeText(pageUrl);
    setCopied("link");
    globalThis.setTimeout(() => {
      setCopied((value) => (value === "link" ? null : value));
    }, 2000);
  };

  const onCopySnippet = async () => {
    if (!embedSnippet) return;
    await navigator.clipboard.writeText(embedSnippet);
    const copyKey = embedTab === "link" ? "anchor" : "embed";
    setCopied(copyKey);
    globalThis.setTimeout(() => {
      setCopied((value) => (value === copyKey ? null : value));
    }, 2000);
  };

  const onShareBluesky = () => {
    globalThis.open(
      buildBlueskyComposeUrl(pageUrl),
      "_blank",
      "noopener,noreferrer",
    );
  };

  const iconSize = size === "sm" ? 14 : 18;

  const trigger =
    variant === "icon" ? (
      <IconButton variant="secondary" size={size} label={t`Share`}>
        <Share2 size={iconSize} />
      </IconButton>
    ) : (
      <Button variant="secondary" size={size === "sm" ? "sm" : undefined}>
        <Share2 size={14} /> <Trans>Share</Trans>
      </Button>
    );

  return (
    <>
      <Menu trigger={trigger}>
        <MenuItem
          onPress={onCopyLink}
          suffix={<LinkIcon size={14} />}
          textValue={copied === "link" ? t`Copied!` : t`Copy link`}
        >
          {copied === "link" ? (
            <Trans>Copied!</Trans>
          ) : (
            <Trans>Copy link</Trans>
          )}
        </MenuItem>
        <MenuItem
          onPress={onShareBluesky}
          suffix={<Share2 size={14} />}
          textValue={t`Share on Bluesky`}
        >
          <Trans>Share on Bluesky</Trans>
        </MenuItem>
        {nativeShareAvailable ? (
          <MenuItem
            onPress={() => {
              void shareLinkUrl(pageUrl);
            }}
            textValue={t`Share elsewhere`}
          >
            <Trans>Share elsewhere</Trans>
          </MenuItem>
        ) : null}
        {embed ? (
          <MenuItem
            onPress={() => {
              setEmbedOpen(true);
            }}
            suffix={<Code size={14} />}
            textValue={t`Embed subscribe`}
          >
            <Trans>Embed subscribe</Trans>
          </MenuItem>
        ) : null}
      </Menu>

      {embed ? (
        <Dialog
          isOpen={embedOpen}
          onOpenChange={setEmbedOpen}
          size="md"
          fitContent
          trigger={<span hidden aria-hidden />}
        >
          <DialogHeader>
            <span {...stylex.props(styles.dialogTitle)}>
              <Trans>Embed subscribe</Trans>
            </span>
          </DialogHeader>
          <DialogBody style={styles.body}>
            <Flex direction="column" gap="sm" style={styles.layoutControl}>
              <SegmentedControl
                selectedKeys={new Set([embedTab])}
                onSelectionChange={onEmbedTabChange}
              >
                <SegmentedControlItem id="landscape">
                  <Trans>Landscape</Trans>
                </SegmentedControlItem>
                <SegmentedControlItem id="portrait">
                  <Trans>Portrait</Trans>
                </SegmentedControlItem>
                <SegmentedControlItem id="link">
                  <Trans>Link</Trans>
                </SegmentedControlItem>
              </SegmentedControl>
            </Flex>
            <div {...stylex.props(styles.previewPanel)}>
              {embedTab === "link" ? (
                <div {...stylex.props(styles.linkPreviewPanel)}>
                  <a
                    href={subscribeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...stylex.props(styles.linkPreview)}
                  >
                    <Trans>Subscribe to {publicationName}</Trans>
                  </a>
                </div>
              ) : (
                <SubscribeEmbedPreview
                  meta={embed}
                  layout={embedTab}
                  baseUrl={baseUrl}
                />
              )}
            </div>
            <Flex direction="column" gap="2xl" style={styles.snippetSection}>
              <SmallBody variant="secondary">
                {embedTab === "link" ? (
                  <Trans>
                    Add this anchor anywhere on your site and style it however
                    you like. It opens the subscribe flow when clicked.
                  </Trans>
                ) : embedTab === "portrait" ? (
                  <Trans>
                    Portrait stacks the card vertically. Height adjusts
                    automatically once the embed loads. Change the iframe width
                    as needed.
                  </Trans>
                ) : (
                  <Trans>
                    Landscape fits a compact row. Height adjusts automatically
                    once the embed loads. Change the iframe width as needed.
                  </Trans>
                )}
              </SmallBody>
              <textarea
                readOnly
                aria-label={
                  embedTab === "link" ? t`Subscribe link code` : t`Embed code`
                }
                value={embedSnippet}
                {...stylex.props(styles.snippet)}
              />
            </Flex>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onPress={() => setEmbedOpen(false)}>
              <Trans>Close</Trans>
            </Button>
            <Button variant="primary" onPress={onCopySnippet}>
              {copied === "anchor" || copied === "embed" ? (
                <Trans>Copied!</Trans>
              ) : embedTab === "link" ? (
                <Trans>Copy link code</Trans>
              ) : (
                <Trans>Copy embed code</Trans>
              )}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </>
  );
}
