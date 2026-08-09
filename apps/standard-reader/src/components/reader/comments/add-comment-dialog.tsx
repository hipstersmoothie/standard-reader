"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogHeader,
} from "@standard-reader/design-system/dialog";
import { Flex } from "@standard-reader/design-system/flex";
import { Separator } from "@standard-reader/design-system/separator";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { MessageSquarePlus } from "lucide-react";

import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import { PLATFORM_NAME } from "#/lib/publishing-platform";

import { PlatformMark } from "../platform-logo";
import { articleCommentDestinations } from "./article-comment-destinations";

const styles = stylex.create({
  trigger: { display: "none" },
  body: { width: "100%" },
  groupTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  groupHint: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  destinations: {
    gap: gap.md,
    display: "flex",
    flexWrap: "wrap",
  },
  /**
   * Each app's own touch icon. They ship at their own sizes and with their own
   * corner treatment baked in, so the box is fixed and rounded here to keep the
   * row of chips reading as one set.
   */
  clientIcon: {
    borderRadius: radius.sm,
    cornerShape: "squircle",
    display: "block",
    flexShrink: 0,
    objectFit: "contain",
  },
  // The handle reads as a foreign run inside translated prose; isolate it so a
  // RTL locale doesn't reorder the `@` away from the name.
  handle: {
    fontFamily: fontFamily.mono,
    unicodeBidi: "isolate",
  },
});

/** The "Add comment" control itself — pair it with {@link AddCommentDialog}. */
export function AddCommentTrigger({ onPress }: { onPress: () => void }) {
  return (
    <Button variant="secondary" size="sm" onPress={onPress}>
      <MessageSquarePlus size={16} aria-hidden />
      <Trans>Add comment</Trans>
    </Button>
  );
}

/**
 * Controlled "where do you want to comment?" dialog. Standard Reader hosts no
 * comments of its own, so every row here is a link out to a place whose records
 * the Discussion section reads back — see `#/lib/comment-destinations`.
 *
 * Rendered with a hidden trigger (the app's controlled-dialog idiom) because
 * the section head and the empty state both open the same dialog.
 */
export function AddCommentDialog({
  article,
  isOpen,
  onOpenChange,
}: {
  article: ArticleDetail;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const { authorHandle, bsky, mode, platform } =
    articleCommentDestinations(article);
  const platformName = platform ? PLATFORM_NAME[platform.platform] : null;

  const openDestination = (url: string) => {
    globalThis.open(url, "_blank", "noopener,noreferrer");
    onOpenChange(false);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
      fitContent
      trigger={<span hidden aria-hidden {...stylex.props(styles.trigger)} />}
    >
      <DialogHeader>
        <Trans>Add a comment</Trans>
      </DialogHeader>
      <DialogDescription>
        <Trans>
          Discussion here is gathered from posts across the network, so you
          comment wherever you already post.
        </Trans>
      </DialogDescription>
      <Separator />
      <DialogBody style={styles.body}>
        <Flex direction="column" gap="4xl">
          {bsky.length > 0 ? (
            <Flex direction="column" gap="lg">
              <h3 {...stylex.props(styles.groupTitle)}>
                {mode === "reply" ? (
                  <Trans>Reply on Bluesky</Trans>
                ) : (
                  <Trans>Post on Bluesky</Trans>
                )}
              </h3>
              <p {...stylex.props(styles.groupHint)}>
                {mode === "reply" ? (
                  <Trans>
                    This article has a post of its own. Your reply to it shows
                    up here.
                  </Trans>
                ) : authorHandle ? (
                  <Trans>
                    Opens a new post linking to this article and tagging{" "}
                    <span {...stylex.props(styles.handle)}>
                      @{authorHandle}
                    </span>
                    .
                  </Trans>
                ) : (
                  <Trans>Opens a new post linking to this article.</Trans>
                )}
              </p>
              <div {...stylex.props(styles.destinations)}>
                {bsky.map((destination) => (
                  <Button
                    key={destination.id}
                    variant="secondary"
                    onPress={() => openDestination(destination.url)}
                  >
                    {destination.iconUrl ? (
                      <img
                        src={destination.iconUrl}
                        alt=""
                        width={16}
                        height={16}
                        loading="lazy"
                        {...stylex.props(styles.clientIcon)}
                      />
                    ) : null}
                    {destination.label}
                  </Button>
                ))}
              </div>
            </Flex>
          ) : null}

          {platform && platformName ? (
            <Flex direction="column" gap="lg">
              <h3 {...stylex.props(styles.groupTitle)}>
                <Trans>Comment on {platformName}</Trans>
              </h3>
              <p {...stylex.props(styles.groupHint)}>
                <Trans>
                  {platformName} hosts comments on the original article, and
                  they show up here too.
                </Trans>
              </p>
              <div {...stylex.props(styles.destinations)}>
                <Button
                  variant="secondary"
                  onPress={() => openDestination(platform.url)}
                  aria-label={t`Comment on ${platformName}`}
                >
                  <PlatformMark platform={platform.platform} size={16} />
                  {platformName}
                </Button>
              </div>
            </Flex>
          ) : null}
        </Flex>
      </DialogBody>
    </Dialog>
  );
}
