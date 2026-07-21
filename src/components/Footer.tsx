import * as stylex from "@stylexjs/stylex";

import { Flex } from "@standard-reader/design-system/flex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { containerBreakpoints } from "@standard-reader/design-system/theme/media-queries.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { Text } from "@standard-reader/design-system/typography/text";

const styles = stylex.create({
  footer: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
  },
  inner: {
    boxSizing: "border-box",
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    maxWidth: "var(--page-content-max-width)",
    paddingBottom: verticalSpace["6xl"],
    paddingInlineStart: {
      default: horizontalSpace["3xl"],
      [containerBreakpoints.sm]: horizontalSpace["6xl"],
    },
    paddingInlineEnd: {
      default: horizontalSpace["3xl"],
      [containerBreakpoints.sm]: horizontalSpace["6xl"],
    },
    paddingTop: verticalSpace["6xl"],
    width: "100%",
  },
});

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer {...stylex.props(styles.footer)}>
      <Flex
        align="center"
        justify="between"
        gap="2xl"
        wrap
        style={styles.inner}
      >
        <Text size="sm" variant="secondary">
          © {year} Your name here.
        </Text>
        <Text size="sm" variant="secondary">
          Built with TanStack Start + hip-ui
        </Text>
      </Flex>
    </footer>
  );
}
