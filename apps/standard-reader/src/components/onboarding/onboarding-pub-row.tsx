import { Badge } from "@standard-reader/design-system/badge";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import { ToggleButton } from "@standard-reader/design-system/toggle-button";
import * as stylex from "@stylexjs/stylex";
import { Check, Plus } from "lucide-react";

import type { PublicationCard } from "#/integrations/tanstack-query/api-shapes";

import { PublicationAvatar } from "../reader/primitives";

const styles = stylex.create({
  row: {
    borderRadius: 0,
    alignItems: "center",
    columnGap: gap.xl,
    display: "flex",
    justifyContent: "flex-start",
    paddingInlineEnd: horizontalSpace.xl,
    paddingInlineStart: horizontalSpace.xl,
    textAlign: "start",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    // Rows sit inside a bordered container — a divider between rows only, none
    // under the last row, so the row borders don't stack on the container edge.
    borderBottomWidth: { default: 1, ":last-child": 0 },
    height: "auto",
    paddingBottom: verticalSpace.xl,
    paddingTop: verticalSpace.xl,
    width: "100%",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    rowGap: verticalSpace.xxs,
    minWidth: 0,
  },
  titleLine: {
    alignItems: "center",
    columnGap: gap.md,
    display: "flex",
    minWidth: 0,
  },
  name: {
    overflow: "hidden",
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  handle: {
    overflow: "hidden",
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  description: {
    overflow: "hidden",
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    overflowWrap: "anywhere",
    whiteSpace: "normal",
    marginBottom: 0,
    marginTop: 0,
    // The row is a <button>, which sets `white-space: nowrap` — inherited, that
    // pinned descriptions to one unwrappable line that got clipped mid-word.
    // Restore normal wrapping, then cap the block at two lines.
    maxHeight: `calc(2 * ${lineHeight.sm} * ${fontSize.sm})`,
    minWidth: 0,
  },
  metaLine: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.md,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
  action: {
    borderColor: uiColor.border2,
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 1,
    alignItems: "center",
    columnGap: gap.xs,
    display: "flex",
    flexShrink: 0,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    paddingInlineEnd: horizontalSpace.lg,
    paddingInlineStart: horizontalSpace.lg,
    paddingBottom: verticalSpace.xs,
    paddingTop: verticalSpace.xs,
  },
});

export function OnboardingPubRow({
  pub,
  trending = false,
  selected,
  onToggle,
}: {
  pub: PublicationCard;
  trending?: boolean;
  selected: boolean;
  onToggle: (next: boolean) => void;
}) {
  const readers =
    pub.subscriberCount > 0
      ? `${formatCount(pub.subscriberCount)} readers`
      : pub.documentCount > 0
        ? `${formatCount(pub.documentCount)} articles`
        : null;

  return (
    <ToggleButton
      variant="tertiary"
      isSelected={selected}
      onChange={onToggle}
      aria-label={`${selected ? "Unsubscribe from" : "Subscribe to"} ${pub.name}`}
      style={styles.row}
    >
      <PublicationAvatar pub={pub} size="lg" />
      <span {...stylex.props(styles.body)}>
        <span {...stylex.props(styles.titleLine)}>
          <span dir="auto" {...stylex.props(styles.name)}>
            {pub.name}
          </span>
          {trending ? <Badge variant="primary">Trending</Badge> : null}
        </span>
        {pub.ownerHandle ? (
          <span dir="auto" {...stylex.props(styles.handle)}>
            @{pub.ownerHandle}
          </span>
        ) : null}
        {pub.description ? (
          <p dir="auto" {...stylex.props(styles.description)}>
            {pub.description}
          </p>
        ) : null}
        {pub.topic || readers ? (
          <span {...stylex.props(styles.metaLine)}>
            {pub.topic ? <span>{pub.topic}</span> : null}
            {pub.topic && readers ? <span aria-hidden>·</span> : null}
            {readers ? <span>{readers}</span> : null}
          </span>
        ) : null}
      </span>
      <span {...stylex.props(styles.action)}>
        {selected ? <Check size={13} /> : <Plus size={13} />}
        {selected ? "Subscribed" : "Subscribe"}
      </span>
    </ToggleButton>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}
