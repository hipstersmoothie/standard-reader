"use client";

import type { Key } from "react-aria-components";

import type { Size } from "#/design-system/theme/types";
import type { PublicationEmbedMeta } from "#/integrations/tanstack-query/api-publication.functions";
import type { SubscribeEmbedTab } from "#/lib/publication-embed";

import * as stylex from "@stylexjs/stylex";
import { Button } from "#/design-system/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "#/design-system/dialog";
import { Flex } from "#/design-system/flex";
import { IconButton } from "#/design-system/icon-button";
import { Menu, MenuItem } from "#/design-system/menu";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "#/design-system/segmented-control";
import { uiColor } from "#/design-system/theme/color.stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import {
  gap,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  tracking,
} from "#/design-system/theme/typography.stylex";
import { SmallBody } from "#/design-system/typography";
import { getPublicUrlClient } from "#/lib/public-url";
import {
  buildSubscribeAnchorSnippet,
  buildSubscribeEmbedSnippet,
  subscribePageUrl,
} from "#/lib/publication-embed";
import { buildBlueskyComposeUrl } from "#/lib/quote-share";
import { Code, Link as LinkIcon, Share2 } from "lucide-react";
import { useMemo, useState } from "react";

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
    paddingLeft: verticalSpace.lg,
    paddingRight: verticalSpace.lg,
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
    color: uiColor.text1,
    fontSize: fontSize.sm,
    textDecoration: "underline",
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
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedTab, setEmbedTab] = useState<SubscribeEmbedTab>("landscape");
  const [copied, setCopied] = useState<"link" | "embed" | "anchor" | null>(
    null,
  );

  const baseUrl = getPublicUrlClient();

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
      <IconButton variant="secondary" size={size} label="Share">
        <Share2 size={iconSize} />
      </IconButton>
    ) : (
      <Button variant="secondary" size={size === "sm" ? "sm" : undefined}>
        <Share2 size={14} /> Share
      </Button>
    );

  return (
    <>
      <Menu trigger={trigger}>
        <MenuItem onPress={onCopyLink} suffix={<LinkIcon size={14} />}>
          {copied === "link" ? "Copied!" : "Copy link"}
        </MenuItem>
        <MenuItem onPress={onShareBluesky} suffix={<Share2 size={14} />}>
          Share on Bluesky
        </MenuItem>
        {embed ? (
          <MenuItem
            onPress={() => {
              setEmbedOpen(true);
            }}
            suffix={<Code size={14} />}
          >
            Embed subscribe
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
            <span {...stylex.props(styles.dialogTitle)}>Embed subscribe</span>
          </DialogHeader>
          <DialogBody style={styles.body}>
            <Flex direction="column" gap="sm" style={styles.layoutControl}>
              <SegmentedControl
                selectedKeys={new Set([embedTab])}
                onSelectionChange={onEmbedTabChange}
              >
                <SegmentedControlItem id="landscape">
                  Landscape
                </SegmentedControlItem>
                <SegmentedControlItem id="portrait">
                  Portrait
                </SegmentedControlItem>
                <SegmentedControlItem id="link">Link</SegmentedControlItem>
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
                    Subscribe to {embed.name}
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
                {embedTab === "link"
                  ? "Add this anchor anywhere on your site and style it however you like. It opens the subscribe flow when clicked."
                  : embedTab === "portrait"
                    ? "Portrait stacks the card vertically. Height adjusts automatically once the embed loads. Change the iframe width as needed."
                    : "Landscape fits a compact row. Height adjusts automatically once the embed loads. Change the iframe width as needed."}
              </SmallBody>
              <textarea
                readOnly
                aria-label={
                  embedTab === "link" ? "Subscribe link code" : "Embed code"
                }
                value={embedSnippet}
                {...stylex.props(styles.snippet)}
              />
            </Flex>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onPress={() => setEmbedOpen(false)}>
              Close
            </Button>
            <Button variant="primary" onPress={onCopySnippet}>
              {copied === "anchor"
                ? "Copied!"
                : copied === "embed"
                  ? "Copied!"
                  : embedTab === "link"
                    ? "Copy link code"
                    : "Copy embed code"}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </>
  );
}
