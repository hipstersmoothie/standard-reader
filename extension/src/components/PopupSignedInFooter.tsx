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
    backgroundColor: uiColor.bg,
    boxSizing: "border-box",
    paddingBlock: verticalSpace["2xl"],
    paddingInline: horizontalSpace["4xl"],
    width: "100%",
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  handle: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textBoxTrim: "none",
  },
  handleRow: {
    flex: 1,
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
