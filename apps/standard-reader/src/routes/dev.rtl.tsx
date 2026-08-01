"use client";

import { Skeleton } from "@standard-reader/design-system/skeleton";
import { StarRatingInput } from "@standard-reader/design-system/star-rating";
import { Switch } from "@standard-reader/design-system/switch";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontSize,
  fontWeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";

/**
 * Dev-only RTL harness. 404s in production.
 *
 * Renders the controls whose *physical* geometry (transforms, pointer math)
 * doesn't mirror automatically the way logical CSS properties do, side by side
 * in both directions. Use it to eyeball RTL regressions without needing an
 * authenticated session — most of these components otherwise only appear
 * behind login, which is why the switch bug went unnoticed.
 */
export const Route = createFileRoute("/dev/rtl")({
  beforeLoad: () => {
    if (import.meta.env.PROD) {
      throw notFound();
    }
  },
  component: DevRtlHarness,
});

const styles = stylex.create({
  page: {
    gap: gap["3xl"],
    paddingBlock: verticalSpace["5xl"],
    paddingInline: horizontalSpace["5xl"],
    display: "flex",
    flexDirection: "column",
  },
  pane: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    gap: gap.xl,
    paddingBlock: verticalSpace["3xl"],
    paddingInline: horizontalSpace["3xl"],
    display: "flex",
    flexDirection: "column",
  },
  heading: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  row: {
    gap: gap.xl,
    alignItems: "center",
    display: "flex",
  },
});

function Controls({ idPrefix }: { idPrefix: string }) {
  const [on, setOn] = useState(true);
  const [rating, setRating] = useState(3);

  return (
    <>
      <div {...stylex.props(styles.row)}>
        <Switch
          data-testid={`${idPrefix}-switch`}
          isSelected={on}
          onChange={setOn}
        >
          Switch (on)
        </Switch>
      </div>
      <div {...stylex.props(styles.row)} data-testid={`${idPrefix}-stars`}>
        <StarRatingInput value={rating} onChange={setRating} />
      </div>
      <div {...stylex.props(styles.row)}>
        <Skeleton variant="rectangle" height="16px" width="240px" />
      </div>
    </>
  );
}

function DevRtlHarness() {
  return (
    <div {...stylex.props(styles.page)}>
      <div dir="ltr" {...stylex.props(styles.pane)} data-testid="pane-ltr">
        <span {...stylex.props(styles.heading)}>dir=ltr</span>
        <Controls idPrefix="ltr" />
      </div>
      <div dir="rtl" {...stylex.props(styles.pane)} data-testid="pane-rtl">
        <span {...stylex.props(styles.heading)}>dir=rtl</span>
        <Controls idPrefix="rtl" />
      </div>
    </div>
  );
}
