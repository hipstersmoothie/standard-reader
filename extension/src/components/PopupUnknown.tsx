import * as stylex from "@stylexjs/stylex";
import { Button } from "#/design-system/button";
import { Flex } from "#/design-system/flex";
import { primaryColor } from "#/design-system/theme/color.stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import { primary } from "#/design-system/theme/semantic-color.stylex";
import {
  horizontalSpace,
  size,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import { fontFamily } from "#/design-system/theme/typography.stylex";
import { Body, Heading2, SmallBody } from "#/design-system/typography";
import { Compass } from "lucide-react";

const styles = stylex.create({
  content: {
    paddingInline: horizontalSpace.md,
    alignItems: "center",
    paddingBlockEnd: verticalSpace["6xl"],
    paddingBlockStart: verticalSpace["5xl"],
    textAlign: "center",
  },
  iconTile: {
    borderRadius: radius.lg,
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    height: size["7xl"],
    width: size["7xl"],
  },
  headline: {
    fontFamily: fontFamily.serif,
    textAlign: "center",
  },
  description: {
    textAlign: "center",
    maxWidth: "17.5rem",
  },
  host: {
    borderRadius: radius.md,
    cornerShape: "squircle",
    paddingBlock: verticalSpace.md,
    paddingInline: horizontalSpace.lg,
    backgroundColor: primaryColor.component1,
    color: primaryColor.text1,
    fontFamily: fontFamily.mono,
    textAlign: "center",
  },
  discoverButton: {
    width: "100%",
  },
});

function formatHost(tabUrl: string | null): string | null {
  if (!tabUrl) return null;
  try {
    return new URL(tabUrl).hostname;
  } catch {
    return null;
  }
}

type PopupUnknownProps = {
  tabUrl: string | null;
  onBrowseDiscover: () => void;
};

export function PopupUnknown({ tabUrl, onBrowseDiscover }: PopupUnknownProps) {
  const host = formatHost(tabUrl);

  return (
    <Flex direction="column" gap="5xl" style={styles.content}>
      <div
        {...stylex.props(
          styles.iconTile,
          primary.bgSolid,
          primary.textContrast,
        )}
      >
        <Compass size={22} strokeWidth={1.75} />
      </div>

      <Heading2 style={styles.headline}>Nothing here yet</Heading2>

      <Flex direction="column" gap="4xl" align="center">
        <Body variant="secondary" style={styles.description}>
          This page isn&apos;t part of a publication Standard Reader knows
          about.
        </Body>

        {host ? (
          <SmallBody variant="secondary" style={styles.host}>
            {host}
          </SmallBody>
        ) : null}

        <Button
          variant="secondary"
          size="lg"
          style={styles.discoverButton}
          onPress={onBrowseDiscover}
        >
          <Compass size={16} />
          Browse Discover
        </Button>
      </Flex>
    </Flex>
  );
}
