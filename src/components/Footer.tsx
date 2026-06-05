import * as stylex from "@stylexjs/stylex";

import { Flex } from "../design-system/flex";
import { uiColor } from "../design-system/theme/color.stylex";
import { containerBreakpoints } from "../design-system/theme/media-queries.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "../design-system/theme/semantic-spacing.stylex";
import { Text } from "../design-system/typography/text";

const styles = stylex.create({
  footer: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
  },
  inner: {
    boxSizing: "border-box",
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "var(--page-content-max-width)",
    paddingBottom: verticalSpace["6xl"],
    paddingLeft: {
      default: horizontalSpace["3xl"],
      [containerBreakpoints.sm]: horizontalSpace["6xl"],
    },
    paddingRight: {
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
