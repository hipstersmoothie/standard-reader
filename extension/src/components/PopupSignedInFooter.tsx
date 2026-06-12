import * as stylex from "@stylexjs/stylex";
import { Avatar } from "#/design-system/avatar";
import { Button } from "#/design-system/button";
import { Flex } from "#/design-system/flex";
import { uiColor } from "#/design-system/theme/color.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import { fontFamily, fontSize } from "#/design-system/theme/typography.stylex";
import { SmallBody } from "#/design-system/typography";
import { ArrowRight } from "lucide-react";

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
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
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
            <SmallBody variant="secondary" style={styles.handle}>
              {session.handle}
            </SmallBody>
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
