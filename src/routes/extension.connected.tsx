import { Trans } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@standard-reader/design-system/button";
import { Flex } from "@standard-reader/design-system/flex";
import {
  gap as gapSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { Heading4 } from "@standard-reader/design-system/typography";
import { Text } from "@standard-reader/design-system/typography/text";
import { requestExtensionCloseLoginTab } from "#/lib/extension-connected";

const styles = stylex.create({
  page: {
    padding: verticalSpace.xl,
    alignItems: "center",
    boxSizing: "border-box",
    justifyContent: "center",
    minHeight: "100vh",
  },
  card: {
    alignItems: "center",
    textAlign: "center",
    width: "100%",
  },
  actions: {
    paddingTop: gapSpace.sm,
  },
});

function ExtensionConnectedPage() {
  return (
    <Flex direction="column" gap="2xl" style={styles.page}>
      <Flex direction="column" gap="4xl" style={styles.card}>
        <Heading4>
          <Trans>You&apos;re signed in</Trans>
        </Heading4>
        <Text variant="secondary">
          <Trans>
            Return to the Standard Reader extension — this tab will close
            automatically.
          </Trans>
        </Text>
        <Flex direction="column" gap="sm" style={styles.actions}>
          <Button variant="primary" onPress={requestExtensionCloseLoginTab}>
            <Trans>Close tab</Trans>
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}

export const Route = createFileRoute("/extension/connected")({
  component: ExtensionConnectedPage,
});
