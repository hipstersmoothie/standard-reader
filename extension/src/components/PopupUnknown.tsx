import * as stylex from "@stylexjs/stylex";
import { Button } from "#/design-system/button";
import { Flex } from "#/design-system/flex";
import { primary, ui } from "#/design-system/theme/semantic-color.stylex";
import {
  horizontalSpace,
  size,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import { fontFamily } from "#/design-system/theme/typography.stylex";
import { Heading2 } from "#/design-system/typography";
import { Body, SmallBody } from "#/design-system/typography";
import { Compass } from "lucide-react";
import { primaryColor } from "#/design-system/theme/color.stylex";

const styles = stylex.create({
  content: {
    alignItems: "center",
    paddingBlockStart: verticalSpace["5xl"],
    paddingBlockEnd: verticalSpace["6xl"],
    paddingInline: horizontalSpace.md,
    textAlign: "center",
  },
  iconTile: {
    alignItems: "center",
    borderRadius: radius.lg,
    display: "flex",
    height: size["7xl"],
    justifyContent: "center",
    width: size["7xl"],
  },
  headline: {
    fontFamily: fontFamily.serif,
    textAlign: "center",
  },
  description: {
    maxWidth: "17.5rem",
    textAlign: "center",
  },
  host: {
    fontFamily: fontFamily.mono,
    textAlign: "center",
    backgroundColor: primaryColor.component1,
    color: primaryColor.text1,
    paddingInline: horizontalSpace.lg,
    paddingBlock: verticalSpace.md,
    borderRadius: radius.md,
    cornerShape: "squircle",
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
