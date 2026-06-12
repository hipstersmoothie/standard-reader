import * as stylex from "@stylexjs/stylex";
import { initials } from "#/components/reader/format";
import { Avatar } from "#/design-system/avatar";
import { Button } from "#/design-system/button";
import { Flex } from "#/design-system/flex";
import { uiColor } from "#/design-system/theme/color.stylex";
import {
  gap as gapToken,
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
import { ArrowRight, UserPlus } from "lucide-react";

import type { ExtensionResolvePublication } from "../lib/types";

const styles = stylex.create({
  content: {
    paddingBlock: verticalSpace["5xl"],
    paddingInline: horizontalSpace["4xl"],
    boxSizing: "border-box",
    width: "100%",
  },
  identityRow: {
    alignItems: "center",
    columnGap: gapToken.lg,
    display: "flex",
    flexDirection: "row",
  },
  identityText: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  name: {
    color: uiColor.text2,
    display: "block",
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    textWrap: "pretty",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
  },
  handle: {
    color: uiColor.text1,
    display: "block",
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
  },
  description: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    lineHeight: lineHeight.sm,
    textWrap: "pretty",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
  },
  followers: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
  },
  actions: {
    width: "100%",
  },
  actionButton: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 0,
  },
});

function formatSubscriberCount(count: number | null): string | null {
  if (count == null || count <= 0) return null;
  return `${count.toLocaleString("en-US")} followers`;
}

type PopupPublicationProps = {
  result: ExtensionResolvePublication;
  busy: boolean;
  onFollow: () => void;
  onOpenReader: () => void;
};

export function PopupPublication({
  result,
  busy,
  onFollow,
  onOpenReader,
}: PopupPublicationProps) {
  const followerLabel = formatSubscriberCount(result.subscriberCount);

  return (
    <Flex direction="column" gap="3xl" style={styles.content}>
      <Flex direction="column" gap="lg">
        <div {...stylex.props(styles.identityRow)}>
          <Avatar
            size="xl"
            src={result.iconUrl ?? result.ownerAvatarUrl ?? undefined}
            fallback={initials(result.name)}
            alt={result.name}
          />
          <div {...stylex.props(styles.identityText)}>
            <h1 {...stylex.props(styles.name)}>{result.name}</h1>
            {result.handle ? (
              <span {...stylex.props(styles.handle)}>@{result.handle}</span>
            ) : null}
          </div>
        </div>

        {result.description ? (
          <p {...stylex.props(styles.description)}>{result.description}</p>
        ) : null}

        {followerLabel ? (
          <p {...stylex.props(styles.followers)}>{followerLabel}</p>
        ) : null}
      </Flex>

      <Flex direction="row" gap="sm" style={styles.actions}>
        <Button
          variant={result.isFollowing ? "secondary" : "primary"}
          size="lg"
          onPress={onFollow}
          isDisabled={busy}
          style={styles.actionButton}
        >
          <UserPlus size={16} />
          {result.isFollowing ? "Subscribed" : "Subscribe"}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onPress={onOpenReader}
          style={styles.actionButton}
        >
          <ArrowRight size={16} />
          Open in Reader
        </Button>
      </Flex>
    </Flex>
  );
}
