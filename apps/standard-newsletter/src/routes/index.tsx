import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@standard-reader/design-system/button";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
} from "@standard-reader/design-system/theme/typography.stylex";

export const Route = createFileRoute("/")({
  component: Home,
});

const styles = stylex.create({
  page: {
    minHeight: "100dvh",
    backgroundColor: uiColor.bg,
    color: uiColor.text1,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBlock: spacing["4"],
    paddingInline: spacing["8"],
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: uiColor.border1,
  },
  wordmark: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize["xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: "-0.01em",
  },
  hero: {
    maxWidth: "48rem",
    marginInline: "auto",
    paddingBlock: spacing["24"],
    paddingInline: spacing["8"],
    textAlign: "center",
  },
  title: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize["6xl"],
    fontWeight: fontWeight.medium,
    lineHeight: 1.05,
    letterSpacing: "-0.02em",
    margin: 0,
  },
  lede: {
    marginTop: spacing["6"],
    fontSize: fontSize["xl"],
    lineHeight: 1.5,
    color: uiColor.text2,
  },
  actions: {
    marginTop: spacing["10"],
    display: "flex",
    gap: spacing["3"],
    justifyContent: "center",
  },
});

function Home() {
  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <span {...stylex.props(styles.wordmark)}>Standard Newsletter</span>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button variant="tertiary">Log in</Button>
          <Button variant="primary">Get started</Button>
        </div>
      </header>
      <main {...stylex.props(styles.hero)}>
        <h1 {...stylex.props(styles.title)}>
          Turn any standard.site publication into a newsletter.
        </h1>
        <p {...stylex.props(styles.lede)}>
          Whether you publish on a hosted platform or write the records
          yourself, we send the emails to your subscribers and show you the
          analytics. You never leave your publication.
        </p>
        <div {...stylex.props(styles.actions)}>
          <Button variant="primary">Open dashboard</Button>
        </div>
      </main>
    </div>
  );
}
