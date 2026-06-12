import * as stylex from "@stylexjs/stylex";
import { Button } from "#/design-system/button";
import { Flex } from "#/design-system/flex";
import { primary } from "#/design-system/theme/semantic-color.stylex";
import {
  horizontalSpace,
  size,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import { fontFamily } from "#/design-system/theme/typography.stylex";
import { Heading2 } from "#/design-system/typography";
import { Body, SmallBody } from "#/design-system/typography";
import { Bookmark } from "lucide-react";

import type { ExtensionResolveResult } from "../lib/types";

const styles = stylex.create({
  content: {
    alignItems: "center",
    paddingBlockStart: verticalSpace["4xl"],
    paddingBlockEnd: verticalSpace["6xl"],
    paddingInline: horizontalSpace.md,
    textAlign: "center",
  },
  mark: {
    alignItems: "center",
    borderRadius: radius.lg,
    cornerShape: "squircle",
    display: "flex",
    height: size["7xl"],
    justifyContent: "center",
    width: size["7xl"],
  },
  headline: {
    fontFamily: fontFamily.serif,
    maxWidth: "22rem",
    textAlign: "center",
  },
  description: {
    maxWidth: "17.5rem",
    textAlign: "center",
  },
  signInButton: {
    width: "100%",
  },
  sessionHint: {
    fontFamily: fontFamily.mono,
    textAlign: "center",
  },
});

function indexedPageHint(result: ExtensionResolveResult | null): string | null {
  if (result?.kind === "article") {
    return "We found an article on this page.";
  }
  if (result?.kind === "publication") {
    return "This site is a publication on the network.";
  }
  return null;
}

type PopupSignInProps = {
  result: ExtensionResolveResult | null;
  onSignIn: () => void;
};

export function PopupSignIn({ result, onSignIn }: PopupSignInProps) {
  const pageHint = indexedPageHint(result);

  return (
    <Flex direction="column" gap="5xl" style={styles.content}>
      <div
        {...stylex.props(styles.mark, primary.bgSolid, primary.textContrast)}
      >
        <Bookmark size={28} strokeWidth={1.75} />
      </div>

      <Heading2 style={styles.headline}>Read it later, beautifully</Heading2>

      <Flex direction="column" gap="4xl" align="center">
        <Body variant="secondary" style={styles.description}>
          Sign in with your Atmosphere account to save articles and subscribe to
          publications.
          {pageHint ? ` ${pageHint}` : null}
        </Body>

        <Button
          variant="primary"
          size="lg"
          style={styles.signInButton}
          onPress={onSignIn}
        >
          Sign in
        </Button>
      </Flex>
    </Flex>
  );
}
