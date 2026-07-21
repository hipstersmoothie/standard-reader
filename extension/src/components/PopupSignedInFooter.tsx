import * as stylex from "@stylexjs/stylex";
import { ArrowRight } from "lucide-react";

import { Avatar } from "@standard-reader/design-system/avatar";
import { Button } from "@standard-reader/design-system/button";
import { Flex } from "@standard-reader/design-system/flex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { SmallBody } from "@standard-reader/design-system/typography";
import { Text } from "@standard-reader/design-system/typography/text";

import type { ExtensionSessionResponse } from "../lib/types";

const styles = stylex.create({
  bar: {
    paddingBlock: verticalSpace["2xl"],
    paddingInline: horizontalSpace["4xl"],
    backgroundColor: uiColor.bg,
    boxSizing: "border-box",
    width: "100%",
  },
  identity: {
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    minWidth: 0,
  },
  handle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  handleRow: {
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    minWidth: 0,
  },
});

type PopupSignedInFooterProps = {
  session: ExtensionSessionResponse;
  onViewSaved: () => void;
};

export function PopupSignedInFooter({
  session,
  onViewSaved,
}: PopupSignedInFooterProps) {
  const handleLabel = session.handle ?? session.name ?? "Signed in";

  return (
    <Flex
      direction="row"
      gap="sm"
      align="center"
      justify="between"
      style={styles.bar}
    >
      <Flex direction="row" gap="sm" align="center" style={styles.identity}>
        <Avatar
          src={session.image ?? undefined}
          alt={session.name ?? session.handle ?? "Signed in"}
          size="sm"
          fallback={(session.name ?? session.handle ?? "?").slice(0, 2)}
        />
        {session.handle ? (
          <Flex
            direction="row"
            gap="none"
            align="center"
            style={styles.handleRow}
          >
            <SmallBody variant="secondary">@</SmallBody>
            <Text
              variant="secondary"
              font="mono"
              size="xs"
              leading="none"
              style={styles.handle}
            >
              {session.handle}
            </Text>
          </Flex>
        ) : (
          <SmallBody variant="secondary" style={styles.handle}>
            {handleLabel}
          </SmallBody>
        )}
      </Flex>
      <Button variant="tertiary" size="sm" onPress={onViewSaved}>
        View saved
        <ArrowRight size={16} />
      </Button>
    </Flex>
  );
}
