import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "#/design-system/button";
import { Flex } from "#/design-system/flex";
import {
  gap as gapSpace,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import { Heading4 } from "#/design-system/typography";
import { Text } from "#/design-system/typography/text";
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
        <Heading4>You&apos;re signed in</Heading4>
        <Text variant="secondary">
          Return to the Standard Reader extension — this tab will close
          automatically.
        </Text>
        <Flex direction="column" gap="sm" style={styles.actions}>
          <Button variant="primary" onPress={requestExtensionCloseLoginTab}>
            Close tab
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}

export const Route = createFileRoute("/extension/connected")({
  component: ExtensionConnectedPage,
});
