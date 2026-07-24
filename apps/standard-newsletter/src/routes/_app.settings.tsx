import {
  successColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { common } from "../common-styles";
import { settingsQueryOptions } from "../server/analytics";

export const Route = createFileRoute("/_app/settings")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(settingsQueryOptions()),
  component: Settings,
});

const styles = stylex.create({
  // Settings is a single column of definition rows, so it reads at a narrower
  // measure than the analytics screens.
  measure: { maxWidth: "760px" },
  intro: {
    marginBlockEnd: spacing["9"],
    marginBlockStart: 0,
  },
  section: {
    marginBottom: spacing["10"],
  },
  row: {
    alignItems: "baseline",
    columnGap: gap["2xl"],
    display: "flex",
    paddingBlockEnd: verticalSpace["2xl"],
    paddingBlockStart: verticalSpace["2xl"],
    paddingInlineEnd: horizontalSpace.xs,
    paddingInlineStart: horizontalSpace.xs,
    rowGap: gap["2xl"],
  },
  rowLabel: {
    color: uiColor.text1,
    flexGrow: 0,
    flexShrink: 0,
    fontSize: fontSize.sm,
    // A fixed label column keeps every value left-aligned down the list; it is
    // sized to the longest label ("Links / unsubscribe"), not to a scale step.
    width: "140px",
  },
  rowValue: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
  rowValueMono: {
    fontFamily: fontFamily.mono,
    wordBreak: "break-all",
  },
  connected: {
    color: successColor.text1,
    fontWeight: fontWeight.semibold,
  },
  notConnected: {
    color: uiColor.text1,
    fontWeight: fontWeight.semibold,
  },
  note: {
    color: uiColor.text1,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginBlockEnd: 0,
    marginBlockStart: verticalSpace["3xl"],
  },
});

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div {...stylex.props(common.ruleAbove, styles.row)}>
      <div {...stylex.props(styles.rowLabel)}>{label}</div>
      <div
        {...stylex.props(
          common.flexFill,
          styles.rowValue,
          mono && styles.rowValueMono,
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Settings() {
  const { data } = useSuspenseQuery(settingsQueryOptions());
  const v = data.viewer;
  return (
    <div {...stylex.props(common.screen)}>
      <div
        {...stylex.props(
          common.container,
          common.screenPadRoomy,
          styles.measure,
        )}
      >
        <h1 {...stylex.props(common.pageTitle)}>Settings</h1>
        <p {...stylex.props(common.pageIntro, styles.intro)}>
          Your account and how newsletters are sent.
        </p>

        <div {...stylex.props(styles.section)}>
          <div {...stylex.props(common.sectionLabel)}>Account</div>
          <div {...stylex.props(common.ruleBelow)}>
            <Row label="Name" value={v?.displayName ?? "—"} />
            <Row label="Handle" value={v?.handle ? `@${v.handle}` : "—"} mono />
            <Row label="DID" value={v?.did ?? "—"} mono />
          </div>
        </div>

        <div>
          <div {...stylex.props(common.sectionLabel)}>Sending</div>
          <div {...stylex.props(common.ruleBelow)}>
            <Row label="From name" value={data.sending.fromName} />
            <Row label="From address" value={data.sending.fromAddress} mono />
            <Row
              label="Links / unsubscribe"
              value={data.sending.publicUrl}
              mono
            />
            <Row
              label="Resend"
              value={
                <span
                  {...stylex.props(
                    data.sending.resendConfigured
                      ? styles.connected
                      : styles.notConnected,
                  )}
                >
                  {data.sending.resendConfigured
                    ? "Connected"
                    : "Not configured"}
                </span>
              }
            />
          </div>
          <p {...stylex.props(styles.note)}>
            These are the instance defaults, configured via environment (a
            verified Resend sender domain). A newsletter can override the From
            name and address on its own settings page.
          </p>
        </div>
      </div>
    </div>
  );
}
