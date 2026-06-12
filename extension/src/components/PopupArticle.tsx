import * as stylex from "@stylexjs/stylex";
import { initials } from "#/components/reader/format";
import { ArticleEngagement } from "#/components/reader/primitives";
import { Avatar } from "#/design-system/avatar";
import { Button } from "#/design-system/button";
import { Flex } from "#/design-system/flex";
import { Separator } from "#/design-system/separator";
import { uiColor } from "#/design-system/theme/color.stylex";
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
import { Text } from "#/design-system/typography/text";
import { ArrowRight, Bookmark, UserPlus } from "lucide-react";

import type { ExtensionResolveArticle } from "../lib/types";

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

function formatSubscriberCount(count: number | null): string | null {
  if (count != null && count > 0) {
    return `${count.toLocaleString("en-US")} followers`;
  }
  return null;
}

type PopupArticleProps = {
  result: ExtensionResolveArticle;
  busy: boolean;
  onSave: () => void;
  onFollow: () => void;
  onOpenReader: () => void;
};

export function PopupArticle({
  result,
  busy,
  onSave,
  onFollow,
  onOpenReader,
}: PopupArticleProps) {
  const pubName = result.publicationName ?? "Publication";
  const authorHandle = result.authorHandle;
  const readingLabel =
    result.readingMinutes == null ? null : `${result.readingMinutes} min read`;
  const followerLabel = formatSubscriberCount(
    result.publicationSubscriberCount,
  );
  const showPubRow = Boolean(result.publicationUri && result.publicationName);
  const hasEngagement = result.recommendCount > 0 || result.commentCount > 0;
  const showMeta = Boolean(authorHandle || readingLabel || hasEngagement);

  return (
    <Flex direction="column" style={styles.content}>
      <Flex direction="column" gap="4xl" align="center">
        <Flex direction="column" gap="xxs">
          <h2 {...stylex.props(styles.title)}>{result.title}</h2>

          {showMeta ? (
            <Flex direction="row" gap="md" align="center" wrap>
              {authorHandle ? (
                <Text variant="secondary" font="mono" size="xs">
                  {`@${authorHandle}`}
                </Text>
              ) : null}
              {authorHandle && readingLabel ? (
                <span {...stylex.props(styles.metaDot)} aria-hidden>
                  ·
                </span>
              ) : null}
              {readingLabel ? (
                <Text font="mono" size="xs" variant="secondary">
                  {readingLabel}
                </Text>
              ) : null}
              {hasEngagement && (authorHandle || readingLabel) ? (
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
          <Button
            variant={result.isBookmarked ? "secondary" : "primary"}
            size="lg"
            onPress={onSave}
            isDisabled={busy}
            style={styles.actionButton}
          >
            <Bookmark
              size={16}
              fill={result.isBookmarked ? "currentColor" : "none"}
            />
            {result.isBookmarked ? "Saved" : "Save article"}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onPress={onOpenReader}
            style={styles.actionButton}
          >
            <ArrowRight size={16} />
            View in Reader
          </Button>
        </Flex>
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
              {followerLabel ? (
                <Text font="mono" size="xs" variant="secondary">
                  {followerLabel}
                </Text>
              ) : null}
            </Flex>
            <Button
              variant="secondary"
              size="sm"
              onPress={onFollow}
              isDisabled={busy}
            >
              <UserPlus size={16} />
              {result.isFollowing ? "Subscribed" : "Subscribe"}
            </Button>
          </Flex>
        </Flex>
      ) : null}
    </Flex>
  );
}
