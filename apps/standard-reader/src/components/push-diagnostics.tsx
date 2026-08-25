"use client";

import { Trans } from "@lingui/react/macro";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";

import type { PushDiagnostics } from "#/pwa/push";

const styles = stylex.create({
  panel: {
    display: "flex",
    flexDirection: "column",
    paddingBlock: verticalSpace.lg,
    paddingInlineEnd: horizontalSpace["3xl"],
    paddingInlineStart: horizontalSpace["3xl"],
    rowGap: gap.xs,
  },
  intro: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.md,
    marginTop: verticalSpace.none,
    maxWidth: "42ch",
  },
  row: {
    columnGap: gap.md,
    display: "flex",
    justifyContent: "space-between",
  },
  key: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
  },
  value: {
    color: uiColor.text2,
    // Monospace so a state string or an error is read exactly as written —
    // this gets screenshotted from a phone and read back.
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    overflowWrap: "anywhere",
    textAlign: "end",
  },
});

/**
 * Browser-side push state, rendered in settings.
 *
 * This exists because the first real failure landed on an installed iPhone
 * PWA — a context where "open devtools and read the console" is not a usable
 * debugging loop. Showing the same facts in the app turns a diagnosis
 * round-trip into a screenshot.
 *
 * Deliberately unglamorous and untranslated in its *values*: the labels are
 * localized, but the states are the literal strings the code branches on, so
 * what a reader reports back matches what the source says.
 */
export function PushDiagnosticsPanel({
  diagnostics,
}: {
  diagnostics: PushDiagnostics | null;
}) {
  if (!diagnostics) {
    return (
      <div {...stylex.props(styles.panel)}>
        <p {...stylex.props(styles.intro)}>
          <Trans>Checking…</Trans>
        </p>
      </div>
    );
  }

  const rows: Array<{ label: React.ReactNode; value: string }> = [
    { label: <Trans>Support</Trans>, value: diagnostics.capability },
    {
      label: <Trans>Installed to Home Screen</Trans>,
      value: diagnostics.standalone ? "yes" : "no",
    },
    { label: <Trans>Permission</Trans>, value: diagnostics.permission },
    { label: <Trans>Service worker</Trans>, value: diagnostics.serviceWorker },
    {
      label: <Trans>Subscription</Trans>,
      value: diagnostics.subscribed ? "yes" : "no",
    },
  ];

  if (diagnostics.lastError) {
    rows.push({
      label: <Trans>Last error</Trans>,
      value: diagnostics.lastError,
    });
  }

  return (
    <div {...stylex.props(styles.panel)}>
      <p {...stylex.props(styles.intro)}>
        <Trans>
          If notifications aren’t working, this is what your browser reports.
          Sharing a screenshot of it is the fastest way to get it fixed.
        </Trans>
      </p>
      {rows.map((row, index) => (
        <div key={index} {...stylex.props(styles.row)}>
          <span {...stylex.props(styles.key)}>{row.label}</span>
          <span {...stylex.props(styles.value)}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
