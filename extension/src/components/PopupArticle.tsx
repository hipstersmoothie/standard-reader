import * as stylex from "@stylexjs/stylex";
import { formatReaders, initials } from "#/components/reader/format";
import { ArticleEngagement } from "#/components/reader/primitives";
import { Avatar } from "#/design-system/avatar";
import { Button } from "#/design-system/button";
import { Flex } from "#/design-system/flex";
import { IconButton } from "#/design-system/icon-button";
import { Separator } from "#/design-system/separator";
import {
  criticalColor,
  primaryColor,
  uiColor,
} from "#/design-system/theme/color.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "#/design-system/theme/typography.stylex";
import { Tooltip } from "#/design-system/tooltip";
import { Text } from "#/design-system/typography/text";
import {
  ArrowRight,
  Bookmark,
  Check,
  Headphones,
  Heart,
  UserPlus,
  Users,
} from "lucide-react";

import type { ExtensionResolveArticle } from "../lib/types";

const READER_UNAVAILABLE_TOOLTIP =
  "This article doesn't have the structured content needed to render in Standard Reader.";

const styles = stylex.create({
  content: {
    paddingBlock: verticalSpace["5xl"],
    paddingInline: horizontalSpace["4xl"],
    boxSizing: "border-box",
    width: "100%",
  },
  title: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize["3xl"],
    fontStyle: "normal",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    textWrap: "pretty",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
  },
  metaDot: {
    color: uiColor.text1,
  },
  actions: {
    width: "100%",
  },
  actionButton: {
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    minWidth: 0,
  },
  actionButtonWrap: {
    display: "inline-flex",
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    minWidth: 0,
    width: "100%",
  },
  listenError: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
  likeActive: {
    color: criticalColor.solid1,
  },
  bookmarkActive: {
    color: primaryColor.text2,
  },
  pubRow: {
    marginTop: verticalSpace["3xl"],
    width: "100%",
  },
  pubRowBody: {
    paddingTop: verticalSpace["2xl"],
  },
  pubIdentity: {
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    minWidth: 0,
  },
  pubName: {
    overflow: "hidden",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  pubMeta: {
    color: uiColor.text1,
  },
});

function PublicationMark({
  name,
  iconUrl,
  ownerAvatarUrl,
  avatarSize,
}: {
  name: string;
  iconUrl: string | null;
  ownerAvatarUrl: string | null;
  avatarSize: "sm" | "md" | "lg";
}) {
  return (
    <Avatar
      size={avatarSize}
      src={iconUrl ?? ownerAvatarUrl ?? undefined}
      fallback={initials(name)}
      alt={name}
    />
  );
}

type PopupArticleProps = {
  result: ExtensionResolveArticle;
  saveBusy: boolean;
  likeBusy: boolean;
  followBusy: boolean;
  onSave: () => void;
  onLike: () => void;
  onFollow: () => void;
  onOpenReader: () => void;
  showListen?: boolean;
  listenStarting?: boolean;
  listenError?: string | null;
  onListen?: () => void;
};

export function PopupArticle({
  result,
  saveBusy,
  likeBusy,
  followBusy,
  onSave,
  onLike,
  onFollow,
  onOpenReader,
  showListen = false,
  listenStarting = false,
  listenError = null,
  onListen,
}: PopupArticleProps) {
  const pubName = result.publicationName ?? "Publication";
  const authorHandle = result.authorHandle;
  const readingLabel =
    result.readingMinutes == null ? null : `${result.readingMinutes} min read`;
  const followerCount = result.publicationSubscriberCount ?? 0;
  const canOpenInReader = result.hasRenderableBody ?? true;
  const showPubRow = Boolean(result.publicationUri && result.publicationName);
  const hasEngagement = result.recommendCount > 0 || result.commentCount > 0;
  const showMeta = Boolean(readingLabel || hasEngagement);

  const viewInReaderButton = (
    <Button
      variant="secondary"
      size="lg"
      onPress={onOpenReader}
      isDisabled={!canOpenInReader}
      style={styles.actionButton}
    >
      View in Reader
      <ArrowRight size={16} />
    </Button>
  );

  return (
    <Flex direction="column" style={styles.content}>
      <Flex direction="column" gap="4xl" align="stretch">
        <Flex direction="column" gap="xxs">
          <h2 {...stylex.props(styles.title)}>{result.title}</h2>

          {showMeta ? (
            <Flex direction="row" gap="md" align="center" wrap>
              {readingLabel ? (
                <Text font="mono" size="xs" variant="secondary">
                  {readingLabel}
                </Text>
              ) : null}
              {hasEngagement && readingLabel ? (
                <span {...stylex.props(styles.metaDot)} aria-hidden>
                  ·
                </span>
              ) : null}
              <ArticleEngagement
                recommendCount={result.recommendCount}
                commentCount={result.commentCount}
                size="xs"
              />
            </Flex>
          ) : null}
        </Flex>

        <Flex direction="row" gap="sm" style={styles.actions}>
          {showListen ? (
            <IconButton
              variant="secondary"
              size="lg"
              label="Listen to article"
              onPress={onListen}
              isPending={listenStarting}
            >
              <Headphones size={18} />
            </IconButton>
          ) : null}
          <IconButton
            variant="secondary"
            size="lg"
            label={result.isRecommended ? "Liked" : "Like article"}
            onPress={onLike}
            isDisabled={likeBusy}
            style={result.isRecommended ? styles.likeActive : undefined}
          >
            <Heart
              size={18}
              strokeWidth={2}
              fill={result.isRecommended ? "currentColor" : "none"}
            />
          </IconButton>
          <IconButton
            variant="secondary"
            size="lg"
            label={result.isBookmarked ? "Saved for later" : "Save for later"}
            onPress={onSave}
            isDisabled={saveBusy}
            style={result.isBookmarked ? styles.bookmarkActive : undefined}
          >
            <Bookmark
              size={18}
              fill={result.isBookmarked ? "currentColor" : "none"}
            />
          </IconButton>
          {canOpenInReader ? (
            viewInReaderButton
          ) : (
            <Tooltip placement="top" text={READER_UNAVAILABLE_TOOLTIP}>
              <span {...stylex.props(styles.actionButtonWrap)}>
                {viewInReaderButton}
              </span>
            </Tooltip>
          )}
        </Flex>
        {listenError ? (
          <span {...stylex.props(styles.listenError)}>{listenError}</span>
        ) : null}
      </Flex>

      {showPubRow ? (
        <Flex direction="column" style={styles.pubRow}>
          <Separator />
          <Flex
            direction="row"
            gap="md"
            align="center"
            style={styles.pubRowBody}
          >
            <PublicationMark
              name={pubName}
              iconUrl={result.publicationIconUrl}
              ownerAvatarUrl={result.publicationOwnerAvatarUrl}
              avatarSize="lg"
            />
            <Flex direction="column" gap="sm" style={styles.pubIdentity}>
              <span {...stylex.props(styles.pubName)}>{pubName}</span>
              <Flex
                direction="row"
                gap="sm"
                align="center"
                wrap
                style={styles.pubMeta}
              >
                {authorHandle ? (
                  <Text
                    variant="secondary"
                    font="mono"
                    size="xs"
                    leading="none"
                  >
                    {`@${authorHandle}`}
                  </Text>
                ) : null}
                {authorHandle ? (
                  <span {...stylex.props(styles.metaDot)} aria-hidden>
                    ·
                  </span>
                ) : null}
                <Flex
                  direction="row"
                  gap="sm"
                  align="center"
                  aria-label={`${followerCount.toLocaleString("en-US")} followers`}
                >
                  <Users size={12} aria-hidden strokeWidth={2} />
                  <Text font="mono" size="xs" variant="secondary">
                    {formatReaders(followerCount)}
                  </Text>
                </Flex>
              </Flex>
            </Flex>
            {result.isFollowing ? (
              <IconButton
                variant="secondary"
                size="lg"
                label="Subscribed"
                onPress={onFollow}
                isDisabled={followBusy}
              >
                <Check size={18} aria-hidden strokeWidth={2.4} />
              </IconButton>
            ) : (
              <IconButton
                variant="secondary"
                size="lg"
                label="Subscribe"
                onPress={onFollow}
                isDisabled={followBusy}
              >
                <UserPlus size={18} strokeWidth={2} />
              </IconButton>
            )}
          </Flex>
        </Flex>
      ) : null}
    </Flex>
  );
}
