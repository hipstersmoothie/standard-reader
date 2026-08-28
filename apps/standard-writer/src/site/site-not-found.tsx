import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { readerUrl } from "#/lib/site/article-url";

/**
 * What a site URL renders when there is no site behind it — an unknown handle,
 * a deleted publication, or an account the viewer is blocked from.
 *
 * Deliberately plain: this page is outside the app shell, so there is no
 * navigation to fall back to, and a wrong URL should not be dressed up as
 * somebody's site.
 */
export function SiteNotFound({ children }: { children: ReactNode }) {
  return (
    <main {...stylex.props(styles.shell)}>
      <p {...stylex.props(styles.message)}>{children}</p>
      <a href={readerUrl()} {...stylex.props(styles.home)}>
        Go to Standard Reader
      </a>
    </main>
  );
}

const styles = stylex.create({
  shell: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    minHeight: "100dvh",
    paddingInlineEnd: spacing["6"],
    paddingInlineStart: spacing["6"],
    rowGap: spacing["6"],
    textAlign: "center",
  },
  message: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  home: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    letterSpacing: "0.12em",
    textDecorationColor: "currentColor",
    textDecorationLine: "underline",
    textTransform: "uppercase",
    textUnderlineOffset: "0.3em",
  },
});
