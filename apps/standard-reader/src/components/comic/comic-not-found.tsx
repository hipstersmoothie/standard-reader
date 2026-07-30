import { Trans } from "@lingui/react/macro";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  note: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    textAlign: "center",
    paddingInlineEnd: spacing["6"],
    paddingInlineStart: spacing["6"],
    paddingBottom: spacing["20"],
    paddingTop: spacing["20"],
  },
});

/**
 * The comic route's empty state. Its own component rather than the article
 * view's `ArticleNotFound`, so a route whose whole point is one full-screen
 * image doesn't pull the entire reading view into its bundle for a single line
 * of copy.
 */
export function ComicNotFound() {
  return (
    <div {...stylex.props(styles.note)}>
      <Trans>We couldn’t find that issue.</Trans>
    </div>
  );
}
