"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";

import type { UnfinishedReadingItem } from "#/integrations/tanstack-query/api-reader.functions";

import { ArticleRow } from "./cards";
import { SectionHead } from "./primitives";

const styles = stylex.create({
  row: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.sm,
  },
  meter: {
    alignItems: "center",
    columnGap: gap.sm,
    display: "flex",
    paddingBottom: spacing["4"],
  },
  track: {
    backgroundColor: uiColor.component2,
    borderRadius: radius.full,
    flexGrow: 1,
    height: spacing["1"],
    minWidth: 0,
    overflow: "hidden",
  },
  fill: {
    backgroundColor: uiColor.text1,
    borderRadius: radius.full,
    height: "100%",
  },
  percent: {
    color: uiColor.text1,
    flexShrink: 0,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontVariantNumeric: "tabular-nums",
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
  },
});

/**
 * The shelf of articles this reader is in the middle of.
 *
 * It sits above the history list rather than inside it because the two answer
 * different questions — history is "what have I read", this is "what am I still
 * reading" — and only one of them is actionable.
 */
export function ContinueReading({
  items,
}: {
  items: Array<UnfinishedReadingItem>;
}) {
  const { t, i18n } = useLingui();

  // An article can drop out of the read-model (deleted, or never mirrored);
  // there is nothing to continue in that case, so it just isn't on the shelf.
  // `flatMap` rather than `filter` so the narrowed `article` survives.
  const readable = items.flatMap((item) =>
    item.article ? [{ ...item, article: item.article }] : [],
  );
  if (readable.length === 0) return null;

  return (
    <>
      <SectionHead
        kicker={t`Still open`}
        title={t`Continue reading`}
        size="md"
      />
      {readable.map((item, index) => {
        // Round toward the middle: never 0% on an article they've started, and
        // never 100% on one they haven't finished.
        const percent = Math.min(
          99,
          Math.max(1, Math.round(item.progress * 100)),
        );
        const label = i18n.number(item.progress, { style: "percent" });

        return (
          <div key={item.documentUri} {...stylex.props(styles.row)}>
            <ArticleRow
              article={item.article}
              isFirstInSection={index === 0}
              showSaveButton={false}
            />
            <div {...stylex.props(styles.meter)}>
              <div
                {...stylex.props(styles.track)}
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t`Reading progress`}
              >
                <div
                  {...stylex.props(styles.fill)}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span {...stylex.props(styles.percent)}>
                <Trans>{label} read</Trans>
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}
